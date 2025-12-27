import React, { useMemo } from 'react'
import { Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import {
  classifyBand,
  metricIsStatus,
  bandsArrayFor,
  bandLabelForKey,
  store,
  fmt,
  isADAC,
  isLCPC,
} from '@/lib/store'
import { applyAlpha, hsl } from '@/lib/colors'

ChartJS.register(ArcElement, Tooltip, Legend)

type Props = {
  rows: any[]
}

type Slice = {
  key: string
  label: string
  value: number
  count: number
  sum: number
  color: string
}

export function ScoreComposition({ rows }: Props) {
  const latestYear = store.state.endYear

  const summary = useMemo(() => {
    if (!rows.length || latestYear == null) {
      return { labels: [] as string[], slices: [] as Slice[], total: 0 }
    }

    const groups: Record<string, { sum: number; count: number }> = {}
    rows.forEach((row) => {
      const value = (row as any)['y' + latestYear] as number | null | undefined
      if (value == null) return
      const band = classifyBand(value)
      if (!band) return
      const bucket = (groups[band] = groups[band] || { sum: 0, count: 0 })
      bucket.sum += value
      bucket.count += 1
    })

    const bandsMeta = bandsArrayFor(store.state.audit)
    const catOrder = metricIsStatus()
      ? (['pass', 'fail'] as const)
      : bandsMeta && bandsMeta.length
      ? (bandsMeta.map((b) => b.key) as readonly string[])
      : isADAC()
      ? (['high', 'moderate', 'low'] as const)
      : isLCPC()
      ? (['ideal', 'mature', 'progressive', 'basic'] as const)
      : (['elite', 'compliant', 'near', 'below'] as const)

    const defaultColors: Record<string, string> = {
      pass: hsl('emerald'),
      fail: hsl('rose'),
      high: hsl('emerald'),
      moderate: hsl('amber'),
      low: hsl('rose'),
      elite: hsl('emerald'),
      compliant: hsl('green'),
      near: hsl('amber'),
      below: hsl('rose'),
      ideal: hsl('emerald'),
      mature: hsl('amber'),
      progressive: hsl('orange'),
      basic: hsl('rose'),
    }

    const slices: Slice[] = []
    for (const key of catOrder as readonly string[]) {
      const data = groups[key]
      if (!data || data.count === 0) continue
      const label = bandLabelForKey(store.state.audit, key) || key
      const colorFromBand = bandsMeta?.find((b) => b.key === key)?.color
      const baseColor = colorFromBand || defaultColors[key] || hsl('indigo')
      const color = applyAlpha(baseColor, 0.85)
      slices.push({
        key,
        label,
        value: data.count,
        count: data.count,
        sum: data.sum,
        color,
      })
    }

    const total = slices.reduce((sum, slice) => sum + slice.value, 0)
    return {
      labels: slices.map((s) => s.label),
      slices,
      total,
    }
  }, [rows, latestYear])

  if (!summary.labels.length) {
    return <div className="text-sm text-muted-foreground">No data for the latest year.</div>
  }

  const dataset = {
    data: summary.slices.map((s) => s.value),
    backgroundColor: summary.slices.map((s) => s.color),
    metaCounts: summary.slices.map((s) => s.count),
    metaSums: summary.slices.map((s) => s.sum),
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {latestYear ? `Latest year: ${latestYear}` : ''}
      </div>
      <div className="flex items-center justify-center" style={{ height: 320 }}>
        <Doughnut
          data={{ labels: summary.labels, datasets: [dataset as any] }}
          options={{
            responsive: true,
            cutout: '65%',
            plugins: {
              legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10 } },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const total = summary.total || 0
                    const raw = ctx.raw as number
                    const pct = total ? ` (${fmt((raw / total) * 100, 0)}%)` : ''
                    const count = (ctx.dataset as any).metaCounts?.[ctx.dataIndex] ?? 0
                    const sum = (ctx.dataset as any).metaSums?.[ctx.dataIndex] ?? 0
                    const avg = count ? sum / count : 0
                    return `${ctx.label}: ${count} LGUs${pct} – avg ${fmt(avg, 1)}`
                  },
                },
              },
            },
          }}
        />
      </div>
    </div>
  )
}
