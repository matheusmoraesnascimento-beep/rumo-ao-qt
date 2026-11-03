import { useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface SyllabusVersion {
  id: string
  exam_id: string | null
  year: number
  label: string
  status: string
}
export interface StudyPlan {
  id: string
  user_id: string
  syllabus_version_id: string
  exam_id: string | null
  name: string
  active: boolean
  current_item_id: string | null
  passage_number: number
  revision: number
  algorithm_version: string
  preferences: Record<string, unknown>
  exceptions: Record<string, { minutes: number; reason: string }>
  created_at: string
}
export interface PlanItem {
  id: string
  user_id: string
  plan_id: string
  topic_id: string
  ordinal: number
  budget_minutes: number
  paused: boolean
  manual_weight: number
  skipped_on: string | null
}
export interface PassageStage {
  id: string
  user_id: string
  syllabus_version_id: string
  topic_id: string
  passage_number: number
  status: 'in_progress' | 'completed'
  checklist: Record<string, boolean>
  completed_at: string | null
  completion_source: string
  evidence_session_id: string | null
  evidence_note: string | null
  checklist_version: string
}
export interface GuidedSession {
  id: string
  plan_id: string
  item_id: string
  topic_id: string
  passage_number: number
  state: 'running' | 'paused' | 'finished'
  elapsed_seconds: number
  resumed_at: string | null
  started_at: string
  study_session_id: string | null
  notes: string | null
}
export interface PlanEvent {
  id: string
  plan_id: string
  kind: string
  payload: Record<string, unknown>
  created_at: string
}
export interface CycleData {
  available: boolean
  plans: StudyPlan[]
  items: PlanItem[]
  stages: PassageStage[]
  sessions: GuidedSession[]
  events: PlanEvent[]
}
const key = ['cycles'] as const
async function rows<T>(table: string, order?: string): Promise<T[]> {
  const all: T[] = []
  for (let offset = 0; ; offset += 1000) {
    let q = supabase.from(table).select('*')
    q = q.order(order ?? 'id')
    if (order && order !== 'id') q = q.order('id')
    const { data, error } = await q.range(offset, offset + 999)
    if (error) throw error
    all.push(...(data as T[]))
    if (data.length < 1000) return all
  }
}
export async function getCycleData(): Promise<CycleData> {
  try {
    const [plans, items, stages, sessions, events] = await Promise.all([
      rows<StudyPlan>('study_plans', 'created_at'),
      rows<PlanItem>('study_cycle_items', 'ordinal'),
      rows<PassageStage>('topic_passages'),
      rows<GuidedSession>('guided_study_sessions', 'started_at'),
      rows<PlanEvent>('study_plan_events', 'created_at'),
    ])
    return { available: true, plans, items, stages, sessions, events }
  } catch (error) {
    const e = error as { code?: string }
    if (['42P01', 'PGRST205', 'PGRST202'].includes(e.code ?? ''))
      return { available: false, plans: [], items: [], stages: [], sessions: [], events: [] }
    throw error
  }
}
export const useCycleData = () => useQuery({ queryKey: key, queryFn: getCycleData, retry: 1 })
export const useSyllabusVersions = () =>
  useQuery({
    queryKey: ['syllabus-versions'],
    queryFn: () => rows<SyllabusVersion>('syllabus_versions', 'year'),
    staleTime: Infinity,
  })
export async function cycleCommand(
  operation: string,
  payload: Record<string, unknown>,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc('study_plan_command', {
    p_operation: operation,
    p_payload: payload,
    p_key: idempotencyKey,
  })
  if (error) throw new Error(error.message)
  return data as Record<string, unknown>
}
export function useRefreshCycles() {
  const client = useQueryClient()
  return async () => {
    await Promise.all(
      ['cycles', 'sessions', 'settings', 'blocked'].map((k) =>
        client.invalidateQueries({ queryKey: [k] }),
      ),
    )
  }
}

/** Exact retries retain their key even when a subsequent refresh fails. */
export function useIdempotentCommand() {
  const keys = useRef(new Map<string, string>())
  return async (operation: string, payload: Record<string, unknown>) => {
    const signature = JSON.stringify({ operation, payload })
    let key = keys.current.get(signature)
    if (!key) {
      key = crypto.randomUUID()
      keys.current.set(signature, key)
    }
    return cycleCommand(operation, payload, key)
  }
}
