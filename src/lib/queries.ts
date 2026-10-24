import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from './api'

export const qk = {
  settings: ['settings'], profile: ['profile'], exams: ['exams'], topics: ['topics'], progress: ['progress'],
  sessions: ['sessions'], blocked: ['blocked'], attempts: ['attempts'], flags: ['flags'], uqt: ['uqt'],
  questions: ['questions'], sims: ['sims'], cards: ['cards'], prompts: ['prompts'], subs: ['subs'], feedback: ['feedback'],
} as const

export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: api.getSettings })
export const useProfile = () => useQuery({ queryKey: qk.profile, queryFn: api.getProfile })
export const useExams = () => useQuery({ queryKey: qk.exams, queryFn: api.getExams, staleTime: Infinity })
export const useTopics = () => useQuery({ queryKey: qk.topics, queryFn: api.getTopics, staleTime: Infinity })
export const useProgress = () => useQuery({ queryKey: qk.progress, queryFn: api.getProgress })
export const useSessions = () => useQuery({ queryKey: qk.sessions, queryFn: () => api.getSessions() })
export const useBlockedDays = () => useQuery({ queryKey: qk.blocked, queryFn: api.getBlockedDays })
export const useAttempts = () => useQuery({ queryKey: qk.attempts, queryFn: api.getAttempts })
export const useFlags = () => useQuery({ queryKey: qk.flags, queryFn: api.getFlags })
export const useUserQuestionTopics = () => useQuery({ queryKey: qk.uqt, queryFn: api.getUserQuestionTopics })
export const useQuestionsLite = () => useQuery({ queryKey: qk.questions, queryFn: api.getQuestionsLite, staleTime: Infinity })
export const useSimulations = () => useQuery({ queryKey: qk.sims, queryFn: api.getSimulations })
export const useCards = () => useQuery({ queryKey: qk.cards, queryFn: api.getCards })
export const usePrompts = () => useQuery({ queryKey: qk.prompts, queryFn: api.getPrompts })
export const useSubmissions = () => useQuery({ queryKey: qk.subs, queryFn: api.getSubmissions })
export const useAllFeedback = () => useQuery({ queryKey: qk.feedback, queryFn: api.getAllFeedback })

export function useInvalidate() {
  const qc = useQueryClient()
  return (...keys: (readonly string[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })))
}

/** URL assinada curta do recorte da prova (bucket privado). */
export const useSignedUrl = (path: string | null | undefined) =>
  useQuery({ queryKey: ['signed', path], queryFn: () => api.signedUrl(path!), enabled: !!path, staleTime: 4 * 60_000, retry: 1 })
