import { useQuery } from '@tanstack/react-query'
import { fromZonedTime } from 'date-fns-tz'
import { getReviewEvents } from '@/lib/api'
import { useProfile } from '@/lib/queries'
import { todayLocal } from '@/lib/utils'
import { useStudyData } from '@/features/dashboard/usePlan'
import { useCycleData, useSyllabusVersions } from './api'

export function useCycles() {
  const legacy = useStudyData()
  const profile = useProfile()
  const query = useCycleData()
  const versions = useSyllabusVersions()
  const data = query.data
  const plan = data?.plans.find((p) => p.active)
  const items = (data?.items ?? []).filter((i) => i.plan_id === plan?.id)
  const topics = legacy.topics.filter((t) => t.syllabus_version_id === plan?.syllabus_version_id)
  const parents = new Set(topics.map((t) => t.parent_id))
  const leaves = topics.filter((t) => !parents.has(t.id))
  const stages = (data?.stages ?? []).filter(
    (s) => s.syllabus_version_id === plan?.syllabus_version_id,
  )
  const ordered = [...items].sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id))
  const cursor = Math.max(
    0,
    ordered.findIndex((i) => i.id === plan?.current_item_id),
  )
  const rotated = [...ordered.slice(cursor), ...ordered.slice(0, cursor)]
  const localDate = todayLocal(profile.data?.timezone)
  const reviewEvents = useQuery({
    queryKey: ['events', 'cycle-day', localDate],
    queryFn: () =>
      getReviewEvents(
        fromZonedTime(
          `${localDate}T00:00:00`,
          profile.data?.timezone ?? 'America/Sao_Paulo',
        ).toISOString(),
      ),
    enabled: !!plan,
  })
  const next = rotated.find(
    (i) =>
      !i.paused &&
      i.skipped_on !== localDate &&
      !stages.some(
        (s) =>
          s.topic_id === i.topic_id &&
          s.passage_number === plan?.passage_number &&
          s.status === 'completed',
      ),
  )
  const running = data?.sessions.find((s) => s.state !== 'finished' && s.plan_id === plan?.id)
  return {
    ...legacy,
    profile: profile.data,
    cycleQuery: query,
    cycleData: data,
    versions,
    plan,
    items: ordered,
    leaves,
    stages,
    next,
    running,
    localDate,
    cycleLoading: query.isLoading || versions.isLoading || reviewEvents.isLoading,
    cycleError: query.error || versions.error || reviewEvents.error,
    reviewEvents: reviewEvents.data ?? [],
  }
}
export type CyclesContext = ReturnType<typeof useCycles>
