import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js'
import { avg, fmt, metricIsStatus, provColor, store } from '@/lib/store'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

export function ProvinceChart({ rows }: { rows: any[] }) {
  const latest = store.state.endYear
  if (!latest) return null
  const groups: Record<string, number[]> = {}
  for (const row of rows) {
    const value = (row as any)['y' + latest] as number | null
    if (value == null) continue
    const key = row.province || '—'
    ;(groups[key] = groups[key] || []).push(value)
  }
  const entries = Object.entries(groups)
    .map(([province, values]) => ({ province, avg: avg(values) }))
    .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))
    .slice(0, 20)

  const data = {
    labels: entries.map((e) => e.province),
    datasets: [
      {
        label: metricIsStatus() ? `Pass Rate ${latest}` : `Avg ${latest}`,
        data: entries.map((e) => e.avg) as number[],
        backgroundColor: entries.map((e) => provColor(e.avg)),
        borderRadius: 8,
      },
    ],
  }

  return (
    <Bar
      data={data as any}
      options={{
        responsive: true,
        datasets: {
          bar: {
            // Slightly slimmer bars than default
            categoryPercentage: 0.6,
            barPercentage: 0.75,
            maxBarThickness: 24,
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => (metricIsStatus() ? `${fmt(ctx.parsed.y, 0)}%` : fmt(ctx.parsed.y)),
            },
          },
        },
        scales: { y: { suggestedMin: metricIsStatus() ? 0 : 50, suggestedMax: 100 } },
      }}
    />
  )
}
