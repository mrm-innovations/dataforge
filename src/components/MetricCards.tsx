import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { avg, complianceThreshold, computeCoverage, fmt, metricIsStatus, quantile, firstNonNull, lastNonNull, store } from '@/lib/store'

type Props = { rows: any[]; years: number[]; onBandFilter?: (band: string) => void }

export function MetricCards({ rows, years }: Props){
  const latest = store.state.endYear
  const prevYear = latest != null ? (store.YEARS.filter(y => y < latest).slice(-1)[0] ?? null) : null

  const latestVals = rows.map(r => latest != null ? (r as any)['y'+latest] as number | null : null).filter(v => v != null) as number[]
  const prevVals = rows.map(r => prevYear != null ? (r as any)['y'+prevYear] as number | null : null).filter(v => v != null) as number[]

  const threshold = complianceThreshold()
  const rate = latestVals.length ? (latestVals.filter(v => v >= threshold).length / latestVals.length * 100) : null
  const ratePrev = prevVals.length ? (prevVals.filter(v => v >= threshold).length / prevVals.length * 100) : null
  const rateChange = rate != null && ratePrev != null ? rate - ratePrev : null

  const sortedLatest = latestVals.slice().sort((a,b)=>a-b)
  const med = quantile(sortedLatest, 0.5)
  const medPrev = quantile(prevVals.slice().sort((a,b)=>a-b), 0.5)
  const medChange = med != null && medPrev != null ? med - medPrev : null

  const coverage = computeCoverage(rows, years)
  const covLatest = latest != null ? (rows.filter(r => (r as any)['y'+latest] != null).length / rows.length * 100) : null
  const covPrev = prevYear != null ? (rows.filter(r => (r as any)['y'+prevYear] != null).length / rows.length * 100) : null
  const covChange = covLatest != null && covPrev != null ? covLatest - covPrev : null

  let startVals: number[] = []
  let endVals: number[] = []
  for (const r of rows){
    const a = firstNonNull(r, years).value
    const b = lastNonNull(r, years).value
    if (a != null) startVals.push(a)
    if (b != null) endVals.push(b)
  }
  const steps = years.length > 1 ? (years.length - 1) : 1
  const growth = ((avg(endVals) ?? 0) - (avg(startVals) ?? 0)) / steps

  const badge = (change: number | null, unit: 'pct' | 'pts') => (
    change == null ? '—' : `${change>0?'+':''}${unit==='pct'?fmt(change,0)+'%':fmt(change)+' pts'}`
  )

  const InfoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-3.5 w-3.5 text-zinc-500" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" strokeWidth="2"/><path strokeWidth="2" strokeLinecap="round" d="M12 8h.01M11 12h2v5h-2z"/></svg>
  )

  const NoteArrow = ({ change }: { change: number | null }) => {
    if (change == null) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h18" />
        </svg>
      )
    }
    const up = change >= 0
    return up ? (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-emerald-600">
        <path d="M3 17l6 -6l4 4l8 -8"></path>
        <path d="M14 7l7 0l0 7"></path>
      </svg>
    ) : (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-rose-600">
        <path d="M3 7l6 6l4 -4l8 8"></path>
        <path d="M21 10l0 7l-7 0"></path>
      </svg>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="hover:shadow-sm transition">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <span>{metricIsStatus() ? 'Pass Rate' : 'Compliance Rate'}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center cursor-help select-none"><InfoIcon /></span>
                  </TooltipTrigger>
                  <TooltipContent>Share of LGUs at or above threshold this year; change vs prior year.</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className={`text-[11px] px-1.5 py-0.5 rounded-md border ${rateChange == null ? 'text-zinc-500' : rateChange >= 0 ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-rose-700 border-rose-200 bg-rose-50'}`}>{badge(rateChange,'pct')}</div>
          </div>
          <div className="text-3xl font-semibold mt-1">{rate == null ? '-' : `${fmt(rate,0)}%`}</div>
          <div className="mt-2 font-medium text-sm inline-flex items-center gap-1">
            {rateChange == null ? 'No prior year' : rateChange >= 0 ? 'Trending up this year' : 'Down this year'}
            <NoteArrow change={rateChange} />
          </div>
          <div className="text-xs text-muted-foreground">
            {metricIsStatus()
              ? `${latestVals.length ? (latestVals.filter(v=>v>=threshold).length) : 0}/${latestVals.length} passers`
              : `Based on ${latestVals.length} LGUs; threshold >= ${fmt(threshold)}`}
          </div>
        </CardContent>
      </Card>

      <Card className="hover:shadow-sm transition">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <span>Median (latest)</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center cursor-help select-none"><InfoIcon /></span>
                  </TooltipTrigger>
                  <TooltipContent>P50 of latest-year distribution; change vs previous-year median.</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className={`text-[11px] px-1.5 py-0.5 rounded-md border ${medChange == null ? 'text-zinc-500' : medChange >= 0 ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-rose-700 border-rose-200 bg-rose-50'}`}>{badge(medChange, metricIsStatus()?'pct':'pts')}</div>
          </div>
          <div className="text-3xl font-semibold mt-1">{med == null ? '-' : metricIsStatus()? `${fmt(med,0)}%` : fmt(med)}</div>
          <div className="mt-2 font-medium text-sm inline-flex items-center gap-1">{medChange == null ? 'No prior year' : medChange >= 0 ? 'Strong central tendency' : 'Median softened'}<NoteArrow change={medChange} /></div>
          <div className="text-xs text-muted-foreground">P50 of latest-year distribution</div>
        </CardContent>
      </Card>

      <Card className="hover:shadow-sm transition">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <span>Coverage (selected range)</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center cursor-help select-none"><InfoIcon /></span>
                  </TooltipTrigger>
                  <TooltipContent>Share of present data cells out of all LGU x year cells in range.</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className={`text-[11px] px-1.5 py-0.5 rounded-md border ${covChange == null ? 'text-zinc-500' : covChange >= 0 ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-rose-700 border-rose-200 bg-rose-50'}`}>{badge(covChange,'pct')}</div>
          </div>
          <div className="text-3xl font-semibold mt-1">{fmt(coverage.percent,0)}%</div>
          <div className="mt-2 font-medium text-sm inline-flex items-center gap-1">{covChange == null ? 'No prior year' : covChange >= 0 ? 'Data completeness improved' : 'Coverage dipped'}<NoteArrow change={covChange} /></div>
          <div className="text-xs text-muted-foreground">{coverage.present}/{coverage.denom} cells present</div>
        </CardContent>
      </Card>

      <Card className="hover:shadow-sm transition">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <span>Growth Rate (avg YoY)</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center cursor-help select-none"><InfoIcon /></span>
                  </TooltipTrigger>
                  <TooltipContent>Average year-over-year change from first to last available values.</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className={`text-[11px] px-1.5 py-0.5 rounded-md border ${growth >= 0 ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-rose-700 border-rose-200 bg-rose-50'}`}>{growth>=0?`+${metricIsStatus()?fmt(growth,0)+'%':fmt(growth)+' pts'}`:`${metricIsStatus()?fmt(growth,0)+'%':fmt(growth)+' pts'}`}</div>
          </div>
          <div className="text-3xl font-semibold mt-1">{metricIsStatus()? `${fmt(growth,0)}%` : `${fmt(growth)} pts`}</div>
          <div className="mt-2 font-medium text-sm inline-flex items-center gap-1">{growth>=0?'Steady performance increase':'Performance decline'}<NoteArrow change={growth} /></div>
          <div className="text-xs text-muted-foreground">Across {years.length} years</div>
        </CardContent>
      </Card>
    </div>
  )
}
