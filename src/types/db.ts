/**
 * Tipos das linhas usadas pelo app. Para gerar tipos completos do seu projeto:
 *   npx supabase gen types typescript --project-id SEU_ID > src/types/database.gen.ts
 * (não há coluna de gabarito em `questions` — por desenho)
 */
export type TopicStatus = 'nao_iniciado' | 'estudando' | 'revisando' | 'consolidado'
export type SessionKind = 'teoria' | 'revisao' | 'questoes' | 'simulado' | 'redacao'
export type SelfGrade = 'acertei' | 'errei' | 'nao_sei'
export type OcrStatus = 'pending_review' | 'needs_manual_transcription' | 'reviewed'

export interface Exam { id: string; slug: string; year: number }
export interface Topic {
  id: string; syllabus_version_id: string; parent_id: string | null
  name: string; slug: string; ordinal: number; notes: string | null
}
export interface Question {
  id: string; code: string; exam_id: string; number: number
  source_pdf: string | null; source_page: number | null; source_column: string | null
  ocr_body: string | null; options: { letter: string; text: string }[]
  image_path: string | null; image_status: string | null
  ocr_status: OcrStatus; has_figure: boolean | null; reviewed_at: string | null
}
export interface QuestionLite {
  id: string; code: string; exam_id: string; number: number; ocr_status: OcrStatus; has_figure: boolean | null
}
export interface Settings {
  user_id: string; goal_correct: number; baseline_2026: number; exam_date: string | null
  daily_review_cap: number; weekly_availability: Record<string, number>
  writing_cadence: string; include_writing: boolean; min_new_topic_share: number
  theme: 'system' | 'light' | 'dark'
}
export interface TopicProgress {
  user_id: string; topic_id: string; status: TopicStatus; confidence: number
  notes: string | null; first_studied_at: string | null; last_studied_at: string | null
}
export interface StudySession {
  id: string; user_id: string; topic_id: string | null; started_at: string; ended_at: string | null
  duration_minutes: number; kind: SessionKind; source: string | null; notes: string | null
  retroactive: boolean; created_at: string
}
export interface Attempt {
  id: string; user_id: string; question_id: string; simulation_id: string | null
  selected_option: string | null; time_seconds: number; confidence: number | null
  self_grade: SelfGrade | null; created_at: string
}
export interface Simulation {
  id: string; user_id: string; mode: 'year' | 'mixed'; exam_id: string | null; seed: string | null
  question_ids: string[]; marked: string[]; started_at: string; finished_at: string | null
  time_limit_seconds: number | null; elapsed_seconds: number; duration_seconds: number | null
  status: 'em_andamento' | 'finalizado' | 'abandonado'
}
export interface ReviewCard {
  id: string; user_id: string; topic_id: string | null; question_id: string | null
  front: string; back: string; algorithm: string; level: number; due_at: string
  last_reviewed_at: string | null; lapses: number; review_count: number; created_at: string
}
export interface WritingPrompt {
  id: string; owner_id: string | null; origin: string; title: string; prompt_text: string; official: boolean
}
export interface WritingSubmission {
  id: string; user_id: string; essay_id: string; prompt_id: string | null
  plan: { intro?: string; dev?: string; concl?: string; repertorio?: string }
  draft: string; word_count: number; writing_seconds: number; version: number
  status: 'rascunho' | 'finalizada'; created_at: string; updated_at: string
}
export interface WritingFeedback {
  id: string; submission_id: string; rubric: Record<string, number>; comments: string | null
  paragraph_comments: { paragraph: number; text: string }[]; error_tags: string[]
  reviewer_type: 'self' | 'teacher'; created_at: string
}
