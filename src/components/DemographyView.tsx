import { useMemo, type ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip as UITooltip, TooltipContent as UITooltipContent, TooltipProvider as UITooltipProvider, TooltipTrigger as UITooltipTrigger } from '@/components/ui/tooltip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js'
import { fmt } from '@/lib/store'
import { store } from '@/lib/store'
import { hsl } from '@/lib/colors'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend, ArcElement)

type Row = any

export function DemographyView({ rows }: { rows: Row[] }){
  // Normalize types
  const normalizeType = (value: any) => String(value || '').trim().toLowerCase()

  // Local number helpers
  const fmtInt = (n: number | null | undefined) => (n == null ? '-' : Number(n).toLocaleString('en-PH'))
  const fmtPct = (n: number | null | undefined, d = 1) => (n == null ? '-' : `${Number(n).toFixed(d).replace(/\.0+$/, '')}%`)

  const working = useMemo(() => {
    const noProvinces = rows.filter((r) => normalizeType(r.type) !== 'province')
    if (noProvinces.length) return noProvinces
    return rows.filter((r) => normalizeType(r.type) === 'province')
  }, [rows])

  const popRows = useMemo(() => working.filter((r) => Number.isFinite(r.population)), [working])
  const totalPop = useMemo(() => popRows.reduce((s, r) => s + (Number(r.population) || 0), 0), [popRows])

  const lguCount = working.length
  const provinceNames = useMemo(() => {
    const set = new Set<string>()
    working.forEach((r) => {
      if (!r.province) return
      if (normalizeType(r.type) === 'highly urbanized city') return
      if (String(r.province).trim().toLowerCase() === 'huc') return
      set.add(r.province)
    })
    if (set.size === 0){
      rows.forEach((r) => {
        if (normalizeType(r.type) === 'province'){
          if (r.lgu) set.add(r.lgu); else if (r.province) set.add(r.province)
        }
      })
    }
    return set
  }, [working, rows])
  const provinceCount = provinceNames.size

  const hucCount = useMemo(() => {
    const set = new Set<string>()
    working.forEach((r) => {
      if (normalizeType(r.type) === 'highly urbanized city' && r.lgu) set.add(r.lgu)
    })
    return set.size
  }, [working])

  // Province population bar (exclude HUC and province placeholder)
  const provinceBar = useMemo(() => {
    const groups: Record<string, number> = {}
    popRows.forEach((r) => {
      if (!r.province) return
      if (normalizeType(r.type) === 'highly urbanized city') return
      const p = String(r.province).trim()
      if (!p || p.toLowerCase() === 'huc') return
      groups[p] = (groups[p] || 0) + (Number(r.population) || 0)
    })
    const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 20)
    return {
      labels: entries.map((e) => e[0]),
      data: entries.map((e) => e[1]),
    }
  }, [popRows])

  // Type doughnut by population
  const typeDoughnut = useMemo(() => {
    const groups: Record<string, number> = {}
    popRows.forEach((r) => {
      const key = r.type || 'Unspecified'
      groups[key] = (groups[key] || 0) + (Number(r.population) || 0)
    })
    const entries = Object.entries(groups).sort((a, b) => b[1] - a[1])
    const palette = [hsl('blue'), hsl('yellow'), hsl('red')]
    return {
      labels: entries.map((e) => e[0]),
      data: entries.map((e) => e[1]),
      colors: entries.map((_, i) => palette[i % palette.length])
    }
  }, [popRows])

  // Top 10 LGUs by population
  const topLGUs = useMemo(() => popRows.slice().sort((a, b) => (b.population || 0) - (a.population || 0)).slice(0, 10), [popRows])

  // Income class normalization (1st..6th or Unclassified)
  const toOrdinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`)
  const normalizeClass = (value: any): string => {
    const raw = String(value || '').trim().toLowerCase()
    if (!raw) return 'Unclassified'
    const m = raw.match(/([1-6])/)
    if (m) return toOrdinal(Number(m[1]))
    // textual fallback
    if (/first/.test(raw)) return '1st'
    if (/second/.test(raw)) return '2nd'
    if (/third/.test(raw)) return '3rd'
    if (/fourth/.test(raw)) return '4th'
    if (/fifth/.test(raw)) return '5th'
    if (/sixth/.test(raw)) return '6th'
    return 'Unclassified'
  }

  const CLASS_ORDER = ['1st','2nd','3rd','4th','5th','6th','Unclassified'] as const

  // Grouped counts by income class × type
  const classDist = useMemo(() => {
    const byType: Record<string, Record<string, number>> = {}
    const types: string[] = []
    const addType = (t: string) => { if (!byType[t]) { byType[t] = {}; types.push(t) } }
    working.forEach((r) => {
      const t = normalizeType(r.type)
      if (!t || t === 'province') return
      addType(t)
      const c = normalizeClass(r.income_class)
      byType[t][c] = (byType[t][c] || 0) + 1
    })
    const labels = CLASS_ORDER.slice()
    const colorForType = (t: string) => {
      const key = String(t || '').trim().toLowerCase()
      if (key === 'province') return hsl('indigo')
      if (key === 'municipality') return hsl('blue')
      if (key === 'component city') return hsl('red')
      if (key === 'highly urbanized city') return hsl('yellow')
      return hsl('indigo')
    }
    const datasets = types.map((t) => ({
      label: t === 'highly urbanized city' ? 'HUC' : t.charAt(0).toUpperCase() + t.slice(1),
      data: labels.map((c) => byType[t][c] || 0),
      backgroundColor: colorForType(t),
      borderRadius: 6,
      maxBarThickness: 44,
    }))
    return { labels, datasets }
  }, [working])

  // (Removed) Pass/Compliance rate by income class

  // Small stat card component for consistent layout
  const StatCard = ({
    title,
    value,
    subtext,
    tooltip,
    icon,
  }: { title: string; value: string; subtext?: string; tooltip?: string; icon?: ReactNode }) => (
    <Card className="hover:shadow-sm transition">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <span>{title}</span>
            {tooltip && (
              <UITooltipProvider>
                <UITooltip>
                  <UITooltipTrigger asChild>
                    <span aria-label="Info" className="inline-flex items-center cursor-help select-none">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-3.5 w-3.5 text-zinc-500" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" strokeWidth="2"/><path strokeWidth="2" strokeLinecap="round" d="M12 8h.01M11 12h2v5h-2z"/></svg>
                    </span>
                  </UITooltipTrigger>
                  <UITooltipContent>{tooltip}</UITooltipContent>
                </UITooltip>
              </UITooltipProvider>
            )}
          </div>
          {icon && (
            <div className="rounded-md p-1.5 bg-zinc-50 border text-zinc-600">
              {icon}
            </div>
          )}
        </div>
        <div className="text-3xl font-semibold mt-1">{value}</div>
        {subtext && <div className="text-xs text-muted-foreground mt-1">{subtext}</div>}
      </CardContent>
    </Card>
  )

  // Derived subtexts
  const popShare = store.totals.population ? (totalPop / store.totals.population * 100) : null
  const lguSub = store.totals.lgus ? `of ${fmtInt(store.totals.lgus)} LGUs` : undefined
  const provSub = store.totals.provinces ? `of ${fmtInt(store.totals.provinces)} provinces` : undefined
  const hucSub = store.totals.hucs ? `of ${fmtInt(store.totals.hucs)} HUCs` : undefined

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Population"
          value={fmtInt(totalPop)}
          subtext={popShare != null ? `${fmtPct(popShare, 1)} of regional total` : undefined}
          tooltip="Sum of populations for LGUs currently in scope."
          icon={(
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M16 13a4 4 0 1 0-8 0M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" transform="translate(0,8)"/></svg>
          )}
        />
        <StatCard
          title="LGUs in Scope"
          value={fmtInt(lguCount)}
          subtext={lguSub}
          tooltip="Total LGUs matching current filters (excludes Province rows)."
          icon={(
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" d="M3 21v-2a4 4 0 0 1 4-4h2M17 21v-2a4 4 0 0 0-4-4h-2"/><circle cx="9" cy="7" r="3" strokeWidth="2"/><circle cx="17" cy="7" r="3" strokeWidth="2"/></svg>
          )}
        />
        <StatCard
          title="Provinces"
          value={fmtInt(provinceCount)}
          subtext={provSub}
          tooltip="Unique provinces represented (excluding HUCs)."
          icon={(
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 11l9-8 9 8v8a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V13H9v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          )}
        />
        <StatCard
          title="HUCs"
          value={fmtInt(hucCount)}
          subtext={hucSub}
          tooltip="Highly Urbanized Cities counted in scope."
          icon={(
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 21V8l7-3 7 3v13M9 21V10m6 11V10"/></svg>
          )}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-2">Population by Province</div>
            {provinceBar.labels.length ? (
              <Bar data={{ labels: provinceBar.labels, datasets: [{ label: 'Population', data: provinceBar.data, backgroundColor: hsl('blue'), borderRadius: 8, maxBarThickness: 48 }] }} options={{ responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => fmt(ctx.parsed.y, 0) } } }, scales: { y: { beginAtZero: true } } }} />
            ) : (<div className="text-sm text-muted-foreground">No data</div>)}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-2">Population by LGU Type</div>
            {typeDoughnut.labels.length ? (
              <div style={{ height: 280 }}>
                <Doughnut
                  data={{ labels: typeDoughnut.labels, datasets: [{ data: typeDoughnut.data, backgroundColor: typeDoughnut.colors, borderWidth: 0 }] }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '60%',
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true, pointStyle: 'circle' } } },
                  }}
                />
              </div>
            ) : (<div className="text-sm text-muted-foreground">No data</div>)}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-2">Income Class Distribution</div>
            {classDist.datasets.length ? (
              <Bar
                data={{ labels: classDist.labels, datasets: classDist.datasets as any }}
                options={{
                  responsive: true,
                  indexAxis: 'y' as const,
                  plugins: { legend: { position: 'bottom' } },
                  scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
                }}
              />
            ) : (<div className="text-sm text-muted-foreground">No data</div>)}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-2">Top 10 by Population</div>
            {topLGUs.length ? (
              <Bar
                data={{ labels: topLGUs.map(r => r.lgu), datasets: [{ data: topLGUs.map(r => r.population), backgroundColor: hsl('blue'), borderRadius: 8 }] }}
                options={{
                  responsive: true,
                  indexAxis: 'y',
                  plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => fmt(ctx.parsed.x, 0) } } },
                  scales: { x: { beginAtZero: true } }
                }}
              />
            ) : (<div className="text-sm text-muted-foreground">No data</div>)}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-2">Directory</div>
            <div className="overflow-auto rounded-md border">
              <Table>
                <TableHeader style={{ background: 'oklch(98.5% 0 0)' }}>
                  <TableRow style={{ borderColor: 'oklch(92.2% 0 0)' }}>
                    <TableHead>PROVINCE</TableHead>
                    <TableHead>LGU</TableHead>
                    <TableHead>TYPE</TableHead>
                    <TableHead>INCOME</TableHead>
                    <TableHead className="text-right">POPULATION</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {working.slice().sort((a,b)=> (Number(b.population)||0) - (Number(a.population)||0)).map((r:any)=> (
                    <TableRow key={r.lgu+':'+r.province}>
                      <TableCell className="text-sm text-gray-700">{r.province || '--'}</TableCell>
                      <TableCell className="text-sm text-gray-700">{r.lgu || '--'}</TableCell>
                      <TableCell className="text-sm text-gray-700">{r.type || '--'}</TableCell>
                      <TableCell className="text-sm text-gray-700">{r.income_class || '--'}</TableCell>
                      <TableCell className="text-sm text-gray-700 text-right">{Number.isFinite(r.population) ? fmt(r.population,0) : '--'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
