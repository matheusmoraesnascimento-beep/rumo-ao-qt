import CycleToday from '@/features/ciclos/CycleToday'
import LegacyDashboard from './LegacyDashboard'
export default function Dashboard() {
  return (
    <div className="space-y-4">
      <CycleToday />
      <details className="rounded-xl border border-line bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Painel anterior e histórico geral
        </summary>
        <div className="mt-4">
          <LegacyDashboard />
        </div>
      </details>
    </div>
  )
}
