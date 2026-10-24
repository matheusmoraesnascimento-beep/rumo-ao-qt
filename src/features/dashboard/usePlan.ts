import { useMemo } from 'react'
import { differenceInCalendarDays } from 'date-fns'
import {
  useAttempts, useBlockedDays, useCards, useProgress, useSessions, useSettings, useSubmissions,
  useTopics, useUserQuestionTopics, useQuestionsLite,
} from '@/lib/queries'
import { isWritingDue, planDay, rankTopics, type PlanBlock, type Scored, type TopicSignal } from '@/lib/planner'
import { dailyQueue } from '@/lib/srs'
import { todayLocal, weekdayKey } from '@/lib/utils'
import { coverage } from '@/lib/metrics'

export function useStudyData() {
  const settings = useSettings(), topics = useTopics(), progress = useProgress(), cards = useCards()
  const attempts = useAttempts(), uqt = useUserQuestionTopics(), sessions = useSessions()
  const blocked = useBlockedDays(), subs = useSubmissions(), qs = useQuestionsLite()
  const all = [settings, topics, progress, cards, attempts, uqt, sessions, blocked, subs, qs]
  return {
    loading: all.some((q) => q.isLoading),
    error: all.find((q) => q.error)?.error ?? null,
    refetch: () => all.forEach((q) => q.refetch()),
    settings: settings.data, topics: topics.data ?? [], progress: progress.data ?? [], cards: cards.data ?? [],
    attempts: attempts.data ?? [], uqt: uqt.data ?? [], sessions: sessions.data ?? [], blocked: blocked.data ?? [],
    subs: subs.data ?? [], questions: qs.data ?? [],
  }
}
export type StudyData = ReturnType<typeof useStudyData>

export function useDerived(d: StudyData, minutesOverride?: number) {
  return useMemo(() => {
    const now = new Date()
    const today = todayLocal()
    const parents = new Set(d.topics.map((t) => t.parent_id).filter(Boolean))
    const leaves = d.topics.filter((t) => !parents.has(t.id))
    const prog = new Map(d.progress.map((p) => [p.topic_id, p]))
    const qTopic = new Map<string, string[]>()
    for (const r of d.uqt) qTopic.set(r.question_id, [...(qTopic.get(r.question_id) ?? []), r.topic_id])

    const stat = new Map<string, { attempts: number; errors: number }>()
    for (const a of d.attempts) {
      for (const t of qTopic.get(a.question_id) ?? []) {
        const s = stat.get(t) ?? { attempts: 0, errors: 0 }
        if (a.self_grade === 'acertei' || a.self_grade === 'errei') {
          s.attempts++
          if (a.self_grade === 'errei') s.errors++
        }
        stat.set(t, s)
      }
    }
    const overdue = new Map<string, { n: number; maxDays: number }>()
    for (const c of d.cards) {
      if (!c.topic_id || new Date(c.due_at) > now) continue
      const o = overdue.get(c.topic_id) ?? { n: 0, maxDays: 0 }
      o.n++
      o.maxDays = Math.max(o.maxDays, differenceInCalendarDays(now, new Date(c.due_at)))
      overdue.set(c.topic_id, o)
    }
    const signals: TopicSignal[] = leaves.map((t) => {
      const p = prog.get(t.id)
      const s = stat.get(t.id), o = overdue.get(t.id)
      return {
        topicId: t.id, name: t.name, status: p?.status ?? 'nao_iniciado', confidence: p?.confidence ?? 0,
        lastStudiedAt: p?.last_studied_at ? new Date(p.last_studied_at) : null,
        overdueCards: o?.n ?? 0, maxOverdueDays: o?.maxDays ?? 0, attempts: s?.attempts ?? 0, errors: s?.errors ?? 0,
      }
    })
    const ranked: Scored[] = rankTopics(signals, now)
    const untouched = ranked.filter((r) => (prog.get(r.topicId)?.status ?? 'nao_iniciado') === 'nao_iniciado')

    const cap = d.settings?.daily_review_cap ?? 20
    const { queue, backlog } = dailyQueue(d.cards, now, cap)
    const isBlocked = d.blocked.some((b) => b.day === today)
    const avail = d.settings?.weekly_availability?.[weekdayKey(today)] ?? 0
    const minutes = isBlocked ? 0 : (minutesOverride ?? avail)

    const lastWriting = d.subs.length ? new Date(Math.max(...d.subs.map((s) => new Date(s.created_at).getTime()))) : null
    const writingDue = isWritingDue(now, lastWriting, d.settings?.writing_cadence ?? 'auto')
    const plan: PlanBlock[] = planDay({
      minutes, dueCards: queue.length, ranked, untouched,
      writingDue, includeWriting: d.settings?.include_writing ?? true,
      minNewShare: d.settings?.min_new_topic_share ?? 0.2, blocked: isBlocked,
    })
    const cov = coverage(leaves.map((t) => prog.get(t.id)?.status ?? 'nao_iniciado'))
    const weakest = ranked.find((r) => r.score > 0)
    return { today, isBlocked, avail, minutes, queue, backlog, ranked, untouched, plan, cov, weakest, writingDue, lastWriting, leaves }
  }, [d, minutesOverride])
}
