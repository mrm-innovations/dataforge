import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js'
import { barColor, fmt, metricIsStatus, store } from '@/lib/store'
import { hsl } from '@/lib/colors'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

export function BarChartLGU({ rows }: { rows: any[] }) {
  const latest = store.state.endYear
  if (!latest) return null

  const items = rows
    .map((row) => ({ lgu: row.lgu, value: (row as any)['y' + latest] as number | null }))
    .filter((i) => i.value != null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 30)

  const data = {
    labels: items.map((i) => i.lgu),
    datasets: [
      {
        label: metricIsStatus() ? `${latest} Pass %` : `${latest} Score`,
        data: items.map((i) => i.value) as number[],
        backgroundColor: hsl('blue'),
        borderRadius: 8,
      },
    ],
  }

  return (
    <Bar
      data={data as any}
      options={{
        responsive: true,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => (metricIsStatus() ? `${fmt(ctx.parsed.x, 0)}%` : fmt(ctx.parsed.x)),
            },
          },
        },
        scales: { x: { suggestedMin: metricIsStatus() ? 0 : 50, suggestedMax: 100 } },
      }}
    />
  )
}
