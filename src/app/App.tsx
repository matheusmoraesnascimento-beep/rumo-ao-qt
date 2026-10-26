import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth'
import { Layout, MorePage } from './Layout'
import { LoginPage, ResetPasswordPage } from '@/features/auth/AuthPages'
import { Spinner } from '@/components/ui'

const Dashboard = lazy(() => import('@/features/dashboard/Dashboard'))
const Edital = lazy(() => import('@/features/edital/Edital'))
const NotasPage = lazy(() => import('@/features/edital/NotasPage'))
const Agenda = lazy(() => import('@/features/calendario/Agenda'))
const Questoes = lazy(() => import('@/features/questoes/Questoes'))
const QuestaoPage = lazy(() => import('@/features/questoes/QuestaoPage'))
const Classificar = lazy(() => import('@/features/questoes/Classificar'))
const Simulados = lazy(() => import('@/features/simulados/Simulados'))
const SimuladoRun = lazy(() => import('@/features/simulados/SimuladoRun'))
const Revisoes = lazy(() => import('@/features/revisoes/Revisoes'))
const Redacao = lazy(() => import('@/features/redacao/Redacao'))
const Analise = lazy(() => import('@/features/relatorios/Analise'))
const Config = lazy(() => import('@/features/config/Config'))

export function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="edital" element={<Edital />} />
          <Route path="edital/:topicId" element={<NotasPage />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="questoes" element={<Questoes />} />
          <Route path="questoes/classificar" element={<Classificar />} />
          <Route path="questoes/:id" element={<QuestaoPage />} />
          <Route path="simulados" element={<Simulados />} />
          <Route path="simulados/:id" element={<SimuladoRun />} />
          <Route path="revisoes" element={<Revisoes />} />
          <Route path="redacao" element={<Redacao />} />
          <Route path="analise" element={<Analise />} />
          <Route path="config" element={<Config />} />
          <Route path="mais" element={<MorePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
