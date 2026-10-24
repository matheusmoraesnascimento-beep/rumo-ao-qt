/** Camada repositório: todo acesso ao Supabase passa por aqui. Erros viram exceções com mensagem útil. */
import { supabase } from './supabase'
import type {
  Attempt, Exam, Question, QuestionLite, ReviewCard, Settings, Simulation, StudySession, Topic,
  TopicProgress, WritingFeedback, WritingPrompt, WritingSubmission,
} from '@/types/db'

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}
async function uid(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new Error('Sessão expirada. Entre novamente.')
  return id
}

// ---- catálogo ----
export const getExams = async () => ok(await supabase.from('exams').select('*').order('year')) as Exam[]
export const getTopics = async () =>
  ok(await supabase.from('topics').select('*').order('ordinal')) as Topic[]
export const getQuestionsLite = async () =>
  ok(await supabase.from('questions').select('id,code,exam_id,number,ocr_status,has_figure,annulled').order('code').limit(1000)) as QuestionLite[]
export const getQuestion = async (id: string) =>
  ok(await supabase.from('questions').select('*').eq('id', id).single()) as Question
export const getQuestionsByIds = async (ids: string[]) =>
  ok(await supabase.from('questions').select('*').in('id', ids)) as Question[]
export async function searchQuestionText(q: string): Promise<string[]> {
  const rows = ok(await supabase.from('questions').select('id').textSearch('ocr_body', q, { type: 'websearch', config: 'portuguese' })) as { id: string }[]
  return rows.map((r) => r.id)
}
export async function signedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('provas').createSignedUrl(path, 300)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

// ---- configurações ----
export const getSettings = async () =>
  ok(await supabase.from('user_settings').select('*').eq('user_id', await uid()).single()) as Settings
export async function saveSettings(patch: Partial<Settings>) {
  ok(await supabase.from('user_settings').update(patch).eq('user_id', await uid()))
}
export const getProfile = async () =>
  ok(await supabase.from('profiles').select('*').eq('id', await uid()).single()) as { id: string; display_name: string | null; timezone: string }
export async function saveProfile(display_name: string) {
  ok(await supabase.from('profiles').update({ display_name }).eq('id', await uid()))
}

// ---- progresso do edital ----
export const getProgress = async () => ok(await supabase.from('topic_progress').select('*')) as TopicProgress[]
export async function upsertProgress(p: Partial<TopicProgress> & { topic_id: string }) {
  const now = new Date().toISOString()
  ok(await supabase.from('topic_progress').upsert({ user_id: await uid(), ...p, updated_at: now }, { onConflict: 'user_id,topic_id' }))
}

// ---- sessões ----
export const getSessions = async (sinceIso?: string) => {
  let q = supabase.from('study_sessions').select('*').order('started_at', { ascending: false }).limit(2000)
  if (sinceIso) q = q.gte('started_at', sinceIso)
  return ok(await q) as StudySession[]
}
export async function addSession(s: {
  topic_id?: string | null; started_at: string; ended_at?: string | null; duration_minutes: number
  kind: StudySession['kind']; source?: string | null; notes?: string | null; retroactive?: boolean
}) {
  if (!(s.duration_minutes >= 0 && s.duration_minutes <= 1440)) throw new Error('Duração inválida.')
  return ok(await supabase.from('study_sessions').insert({ user_id: await uid(), ...s }).select().single()) as StudySession
}
export async function deleteSession(id: string) { ok(await supabase.from('study_sessions').delete().eq('id', id)) }

export const getBlockedDays = async () =>
  ok(await supabase.from('blocked_days').select('*').order('day')) as { day: string; reason: string | null }[]
export async function blockDay(day: string, reason?: string) {
  ok(await supabase.from('blocked_days').upsert({ user_id: await uid(), day, reason: reason ?? null }, { onConflict: 'user_id,day' }))
}
export async function unblockDay(day: string) { ok(await supabase.from('blocked_days').delete().eq('day', day)) }

// ---- questões / tentativas ----
export const getAttempts = async () =>
  ok(await supabase.from('question_attempts').select('*').order('created_at', { ascending: false }).limit(5000)) as Attempt[]
export async function addAttempt(a: {
  question_id: string; selected_option?: string | null; time_seconds: number
  confidence?: number | null; self_grade?: Attempt['self_grade']; simulation_id?: string | null
}) {
  return ok(await supabase.from('question_attempts').insert({ user_id: await uid(), ...a }).select().single()) as Attempt
}
export async function upsertSimAttempt(a: {
  simulation_id: string; question_id: string; selected_option?: string | null
  time_seconds?: number; confidence?: number | null; self_grade?: Attempt['self_grade']
}) {
  ok(await supabase.from('question_attempts').upsert({ user_id: await uid(), ...a }, { onConflict: 'simulation_id,question_id' }))
}
export const getSimAttempts = async (simId: string) =>
  ok(await supabase.from('question_attempts').select('*').eq('simulation_id', simId)) as Attempt[]

export const getFlags = async () =>
  ok(await supabase.from('question_flags').select('*')) as { question_id: string; favorite: boolean; tags: string[]; note: string | null }[]
export async function setFlag(question_id: string, patch: { favorite?: boolean; tags?: string[]; note?: string | null }) {
  ok(await supabase.from('question_flags').upsert({ user_id: await uid(), question_id, ...patch }, { onConflict: 'user_id,question_id' }))
}
export async function reportQuestion(question_id: string, message: string) {
  ok(await supabase.from('question_reports').insert({ user_id: await uid(), question_id, message }))
}
export const getUserQuestionTopics = async () =>
  ok(await supabase.from('user_question_topics').select('question_id,topic_id')) as { question_id: string; topic_id: string }[]
export async function setUserQuestionTopic(question_id: string, topic_id: string, on: boolean) {
  const u = await uid()
  if (on) ok(await supabase.from('user_question_topics').upsert({ user_id: u, question_id, topic_id }))
  else ok(await supabase.from('user_question_topics').delete().eq('question_id', question_id).eq('topic_id', topic_id))
}

/** Substitui a classificação do usuário para uma questão (remove o que saiu, insere o que entrou). */
export async function replaceQuestionTopics(question_id: string, topicIds: string[]) {
  const u = await uid()
  const del = supabase.from('user_question_topics').delete().eq('question_id', question_id)
  ok(topicIds.length ? await del.not('topic_id', 'in', `(${topicIds.join(',')})`) : await del)
  if (topicIds.length) {
    ok(await supabase.from('user_question_topics').upsert(topicIds.map((topic_id) => ({ user_id: u, question_id, topic_id })), { onConflict: 'user_id,question_id,topic_id' }))
  }
}

// ---- simulados ----
export const getSimulations = async () =>
  ok(await supabase.from('simulations').select('*').order('started_at', { ascending: false })) as Simulation[]
export const getSimulation = async (id: string) =>
  ok(await supabase.from('simulations').select('*').eq('id', id).single()) as Simulation
export async function createSimulation(s: {
  mode: 'year' | 'mixed'; exam_id?: string | null; seed?: string | null; question_ids: string[]; time_limit_seconds?: number | null
}) {
  return ok(await supabase.from('simulations').insert({ user_id: await uid(), ...s }).select().single()) as Simulation
}
export async function patchSimulation(id: string, patch: Partial<Pick<Simulation, 'marked' | 'elapsed_seconds' | 'status' | 'finished_at' | 'duration_seconds'>>) {
  ok(await supabase.from('simulations').update(patch).eq('id', id))
}

/** Gabarito oficial de UMA questão: liberado pelo servidor só depois que você respondeu (fora de simulado). */
export interface RevealedKey { correct_option: string | null; status: 'valida' | 'anulada' | 'alterada'; note: string | null }
export async function revealAnswer(questionId: string): Promise<RevealedKey> {
  const rows = ok(await supabase.rpc('reveal_answer', { p_question_id: questionId })) as RevealedKey[]
  if (!rows?.length) throw new Error('Gabarito indisponível para esta questão.')
  return rows[0]
}
/** Finaliza o simulado no servidor e libera a conferência. */
export async function finalizeSimulation(id: string, elapsedSeconds: number) {
  return ok(await supabase.rpc('finalize_simulation', { p_sim_id: id, p_elapsed_seconds: Math.max(0, Math.round(elapsedSeconds)) })) as Simulation
}
export interface ReviewKey extends RevealedKey { question_id: string }
export const simulationReview = async (id: string) => ok(await supabase.rpc('simulation_review', { p_sim_id: id })) as ReviewKey[]

// ---- revisões ----
export const getCards = async () =>
  ok(await supabase.from('review_cards').select('*').order('due_at').limit(5000)) as ReviewCard[]
export async function createCard(c: { front: string; back?: string; topic_id?: string | null; question_id?: string | null; due_at?: string }) {
  return ok(await supabase.from('review_cards').insert({ user_id: await uid(), back: '', ...c }).select().single()) as ReviewCard
}
export async function deleteCard(id: string) { ok(await supabase.from('review_cards').delete().eq('id', id)) }
/** Atômico no servidor (card + evento) e idempotente por client_event_id. A UI só marca "salvo" após o retorno. */
export async function reviewCard(cardId: string, rating: number, clientEventId: string, tz: string) {
  return ok(await supabase.rpc('review_card', {
    p_card_id: cardId, p_rating: rating, p_client_event_id: clientEventId, p_reviewed_at: new Date().toISOString(), p_tz: tz,
  })) as ReviewCard
}
export async function rescheduleCard(cardId: string, newDue: string, reason?: string) {
  return ok(await supabase.rpc('reschedule_card', { p_card_id: cardId, p_new_due: newDue, p_reason: reason ?? null })) as ReviewCard
}
export const getReviewEvents = async (sinceIso: string) =>
  ok(await supabase.from('review_events').select('id,card_id,rating,reviewed_at').gte('reviewed_at', sinceIso).limit(5000)) as { id: string; card_id: string; rating: number; reviewed_at: string }[]

// ---- redação ----
export const getPrompts = async () =>
  ok(await supabase.from('writing_prompts').select('*').order('title')) as WritingPrompt[]
export async function addPrompt(title: string, prompt_text: string, source_url?: string) {
  return ok(await supabase.from('writing_prompts').insert({
    owner_id: await uid(), origin: 'usuario', title, prompt_text, official: false, source_url: source_url ?? null,
  }).select().single()) as WritingPrompt
}
export const getSubmissions = async () =>
  ok(await supabase.from('writing_submissions').select('*').order('updated_at', { ascending: false })) as WritingSubmission[]
export async function createSubmission(s: Partial<WritingSubmission> & { essay_id?: string; version?: number }) {
  return ok(await supabase.from('writing_submissions').insert({ user_id: await uid(), ...s }).select().single()) as WritingSubmission
}
export async function updateSubmission(id: string, patch: Partial<WritingSubmission>) {
  ok(await supabase.from('writing_submissions').update(patch).eq('id', id))
}
export const getFeedback = async (submissionId: string) =>
  ok(await supabase.from('writing_feedback').select('*').eq('submission_id', submissionId).order('created_at')) as WritingFeedback[]
export const getAllFeedback = async () =>
  ok(await supabase.from('writing_feedback').select('*')) as WritingFeedback[]
export async function addFeedback(f: Omit<WritingFeedback, 'id' | 'created_at'>) {
  ok(await supabase.from('writing_feedback').insert({ user_id: await uid(), ...f }))
}

export async function uploadAttachment(submissionId: string, file: File): Promise<string> {
  const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-80)
  const path = `${await uid()}/${submissionId}/${Date.now()}-${safe}`
  const { error } = await supabase.storage.from('redacoes').upload(path, file, { upsert: false })
  if (error) throw new Error(error.message)
  return path
}

// ---- lembrete diário (Web Push) ----
export async function savePushSubscription(s: { endpoint: string; p256dh: string; auth: string }) {
  const u = await uid()
  ok(await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)) // inscrição antiga deste navegador
  ok(await supabase.from('push_subscriptions').insert({ user_id: u, ...s, user_agent: navigator.userAgent.slice(0, 200) }))
}
export async function deletePushSubscription(endpoint: string) {
  ok(await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint))
}
export const getPushSubscriptions = async () =>
  ok(await supabase.from('push_subscriptions').select('id,endpoint,user_agent,created_at')) as { id: string; endpoint: string; user_agent: string | null; created_at: string }[]

// ---- conta ----
export async function deleteAccount() {
  ok(await supabase.rpc('delete_my_account'))
  await supabase.auth.signOut()
}
