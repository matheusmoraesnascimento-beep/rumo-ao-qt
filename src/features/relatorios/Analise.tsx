import Performance from '@/features/ciclos/Performance'
import LegacyAnalysis from './LegacyAnalysis'
export default function Analise() {
  return (
    <div className="space-y-4">
      <Performance />
      <details className="rounded-xl border border-line bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Gráficos históricos, simulados e redação
        </summary>
        <div className="mt-4">
          <LegacyAnalysis />
        </div>
      </details>
    </div>
  )
}
