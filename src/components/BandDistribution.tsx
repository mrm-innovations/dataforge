import React, { useMemo, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js'
import { classifyBand, isADAC, isLCPC, metricIsStatus, yearsInScope, fmt, bandsArrayFor, bandLabelForKey, store } from '@/lib/store'
import { applyAlpha, hsl } from '@/lib/colors'
import { Button } from '@/components/ui/button'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

type Props = { rows: any[] }

export function BandDistribution({ rows }: Props) {
  const [mode, setMode] = useState<'percent' | 'count'>('percent')
  const years = yearsInScope()

  const { labels, datasets } = useMemo(() => {
    const byYear = new Map<number, { denom: number; buckets: Record<string, number> }>()

    // define category order and colors (support custom band arrays)
    const bands = bandsArrayFor(store.state.audit)
    const catOrder = metricIsStatus()
      ? (['pass','fail'] as const)
      : bands && bands.length
      ? (bands.map(b => b.key) as readonly string[])
      : isADAC()
      ? (['high','moderate','low'] as const)
      : isLCPC()
      ? (['ideal','mature','progressive','basic'] as const)
      : (['elite','compliant','near','below'] as const)

    const palette = {
      emerald400: '#34d399',
      amber400: '#fbbf24',
      orange400: '#fb923c',
      rose400: '#fb7185',
    }
    const defaultColors: Record<string,string> = {
      high: palette.emerald400,
      moderate: palette.amber400,
      low: palette.rose400,
      elite: palette.emerald400,
      compliant: palette.emerald400,
      near: palette.amber400,
      below: palette.rose400,
      ideal: palette.emerald400,
      mature: palette.amber400,
      progressive: palette.orange400,
      basic: palette.rose400,
      pass: palette.emerald400,
      fail: palette.rose400,
    }
    const catColors: Record<string, string> = {}
    if (metricIsStatus()) { catColors.pass = palette.emerald400; catColors.fail = palette.rose400 }
    else if (bands && bands.length) {
      bands.forEach(b => { catColors[b.key] = b.color || defaultColors[b.key] || hsl('sky') })
    } else if (isADAC()) { Object.assign(catColors, { high: palette.emerald400, moderate: palette.amber400, low: palette.rose400 }) }
    else if (isLCPC()) { Object.assign(catColors, { ideal: palette.emerald400, mature: palette.amber400, progressive: palette.orange400, basic: palette.rose400 }) }
    else { Object.assign(catColors, { elite: palette.emerald400, compliant: palette.emerald400, near: palette.amber400, below: palette.rose400 }) }

    for (const y of years) {
      byYear.set(y, { denom: 0, buckets: Object.fromEntries(catOrder.map((k) => [k, 0])) as Record<string, number> })
    }

    for (const r of rows) {
      for (const y of years) {
        const v = (r as any)['y' + y] as number | null | undefined
        if (v == null) continue
        const cat = classifyBand(v)
        const entry = byYear.get(y)!
        entry.denom += 1
        if (cat && entry.buckets[cat] != null) entry.buckets[cat] += 1
      }
    }

    const labels = years.map(String)
    const datasets = (catOrder as readonly string[]).map((cat) => ({
      label: resolveBandLabel(cat),
      backgroundColor: applyAlpha(catColors[cat], 0.75),
      stack: 'bands',
      data: years.map((y) => 0),
      metaCounts: years.map((y) => 0),
    })) as Array<any>

    years.forEach((y, yi) => {
      const entry = byYear.get(y)!
      const denom = entry.denom || 0
      for (let di = 0; di < datasets.length; di++) {
        const cat = (catOrder as readonly string[])[di]
        const count = entry.buckets[cat] ?? 0
        datasets[di].metaCounts[yi] = count
        datasets[di].data[yi] = denom ? (count / denom) * 100 : 0
      }
    })

    return { labels, datasets }
  }, [rows, years])

  if (!years.length) return null

  const isPct = mode === 'percent'
  const data = {
    labels,
    datasets: datasets.map((ds) => ({
      ...ds,
      data: isPct ? ds.data : ds.metaCounts,
      borderRadius: 6,
    })),
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{years[0]}{years.length > 1 ? `–${years[years.length - 1]}` : ''}</div>
        <div className="inline-flex gap-1">
          <Button size="sm" variant={isPct ? 'default' : 'outline'} onClick={() => setMode('percent')}>Percent</Button>
          <Button size="sm" variant={!isPct ? 'default' : 'outline'} onClick={() => setMode('count')}>Count</Button>
        </div>
      </div>
      <Bar
        data={data as any}
        options={{
          responsive: true,
          // Make the bars slimmer: shrink category and bar percentages
          datasets: {
            bar: {
              // Slightly wider than previous tweak
              categoryPercentage: 0.62,
              barPercentage: 0.78,
              maxBarThickness: 26,
            },
          },
          scales: {
            x: { stacked: true },
            y: {
              stacked: true,
              suggestedMin: 0,
              suggestedMax: isPct ? 100 : undefined,
              ticks: {
                callback: (val) => (isPct ? `${val}%` : `${val}`),
              },
            },
          },
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const count = (ctx.dataset as any).metaCounts?.[ctx.dataIndex] ?? 0
                  if (isPct) return `${ctx.dataset.label}: ${fmt(ctx.parsed.y, 0)}% (${count})`
                  return `${ctx.dataset.label}: ${count}`
                },
              },
            },
          },
        }}
      />
    </div>
  )
}

function labelForCategory(cat: string) {
  switch (cat) {
    case 'pass': return 'Passer'
    case 'fail': return 'Non-Passer'
    case 'high': return 'High Functional'
    case 'moderate': return 'Moderate Functional'
    case 'low': return 'Low Functional'
    case 'elite': return 'Elite'
    case 'compliant': return 'Compliant'
    case 'near': return 'Near'
    case 'below': return 'Below'
    case 'ideal': return 'Ideal (≥80%)'
    case 'mature': return 'Mature (50–79%)'
    case 'progressive': return 'Progressive (20–49%)'
    case 'basic': return 'Basic (<20%)'
    default: return cat
  }
}

function resolveBandLabel(cat: string) {
  const label = bandLabelForKey(store.state.audit, cat as any)
  if (label && label !== '-') return label
  return labelForCategory(cat)
}
