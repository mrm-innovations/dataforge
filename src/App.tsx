import React, { useEffect, useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
} from 'chart.js'
import { FilterBar } from '@/components/FilterBar'
import { BarChartLGU } from '@/components/BarChartLGU'
import { ProvinceChart } from '@/components/ProvinceChart'
import { BandDistribution } from '@/components/BandDistribution'
import { RecordsTable } from '@/components/RecordsTable'
import { MetricCards } from '@/components/MetricCards'
import { DemographyView } from '@/components/DemographyView'
import { MapView } from '@/components/MapView'
import { loadCanon, setAudit, store, avg, fmt, metricIsStatus, filterRows, yearsInScope, actions } from './lib/store'
import { hsl } from '@/lib/colors'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend)

export function App() {
  const [, setTick] = useState(0)
  const [tab, setTab] = useState<'dashboard' | 'demography' | 'about'>('dashboard')
  const force = () => setTick((t) => t + 1)

  useEffect(() => {
    ;(async () => {
      try {
        await loadCanon()
        setAudit(store.state.audit)
        force()
      } catch (e) {
        console.error(e)
      }
    })()
  }, [])

  const [bandFilter, setBandFilter] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [wide, setWide] = useState(false)
  const baseRows = filterRows()
  const latest = store.state.endYear
  const rows = useMemo(() => {
    if (!bandFilter || latest == null) return baseRows
    return baseRows.filter((r) => {
      const v = (r as any)['y' + latest] as number | null
      return v != null && (classifyForFilter(v, bandFilter))
    })
  }, [baseRows, bandFilter, latest])
  const years = yearsInScope()

  const kpis = useMemo(() => {
    if (!rows.length || !years.length) return { avgVal: null as number | null, count: 0 }
    const values: number[] = []
    for (const r of rows) for (const y of years) {
      const v = (r as any)['y' + y]
      if (v != null) values.push(v as number)
    }
    return { avgVal: avg(values), count: values.length }
  }, [rows, years])

  const chartData = useMemo(() => {
    if (!rows.length || !years.length) return null
    const groups: Record<string, any[]> = {}
    rows.forEach((r) => {
      ;(groups[r.type] = groups[r.type] || []).push(r)
    })
    const datasets = Object.entries(groups).map(([type, group]) => {
      const key = String(type || '').trim().toLowerCase()
      const color = key === 'province' ? hsl('green')
        : key === 'municipality' ? hsl('blue')
        : key === 'component city' ? hsl('red')
        : key === 'highly urbanized city' ? hsl('yellow')
        : hsl('indigo')
      return {
        label: type,
        data: years.map((y) => avg((group as any[]).map((r) => (r as any)['y' + y] as number | null)) ?? null),
        borderColor: color,
        backgroundColor: color,
        tension: 0.25,
        spanGaps: true,
      }
    })
    return { labels: years.map(String), datasets }
  }, [rows, years])

  function classifyForFilter(value: number, key: string){
    // mirror classifyBand without importing to keep tree small
    if (metricIsStatus()) return key === 'pass' ? value >= 90 : value < 90
    if (store.state.audit === 'ADAC'){
      const bands = (store.AUDITS?.ADAC?.bands || {})
      const high = bands.high_functional ?? 85
      const moderate = bands.moderate_functional ?? 50
      if (key === 'high') return value >= high
      if (key === 'moderate') return value >= moderate && value < high
      if (key === 'low') return value < moderate
      return true
    }
    const bands = store.AUDITS[store.state.audit]?.bands || { elite: 95, compliant: 90, near: 80 }
    if (key === 'elite') return value >= bands.elite
    if (key === 'compliant') return value >= bands.compliant && value < bands.elite
    if (key === 'near') return value >= bands.near && value < bands.compliant
    if (key === 'below') return value < bands.near
    return true
  }

  function toggleSidebar() {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width: 1024px)').matches) {
      setSidebarCollapsed((v) => !v)
    } else {
      setSidebarOpen(true)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Reserve space for fixed sidebar on large screens */}
      <div className={`min-h-screen ${sidebarCollapsed ? '' : 'lg:pl-64'}`}>
        {!sidebarCollapsed && (
        <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 border-r backdrop-blur" style={{ background: 'oklch(98.5% 0 0)', borderColor: 'oklch(92.2% 0 0)' }}>
          <div className="flex h-full w-full flex-col">
            <div className="h-14 px-5 border-b flex items-center sticky top-0 z-10" style={{ background: 'oklch(98.5% 0 0)' }}>
              <div className="flex items-center gap-3">
                <img src={`${(import.meta as any).env.BASE_URL}logo.png`} alt="Logo" className="h-10 w-10 object-contain" />
                <div className="leading-tight">
                  <div className="text-base font-semibold tracking-tight">DataForge</div>
                </div>
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              <button onClick={() => setTab('dashboard')} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='dashboard' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-8 9 8"/><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 21V9h6v12"/></svg>
                <span>Dashboard</span>
              </button>
            <button onClick={() => setTab('demography')} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='demography' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><path strokeWidth="2" strokeLinecap="round" d="M4 19v-6m6 6V5m6 14v-9"/></svg>
              <span>Demography</span>
            </button>
            <button onClick={() => setTab('about')} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='about' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9" strokeWidth="2"/><path strokeWidth="2" strokeLinecap="round" d="M12 8h.01M11 12h2v5h-2z"/></svg>
              <span>About</span>
            </button>
            </nav>
            <div className="mt-auto px-5 py-3 border-t text-[11px] text-muted-foreground" style={{ borderColor: 'oklch(92.2% 0 0)' }}>
              <div>
                © {new Date().getFullYear()} <a href="https://region12.dilg.gov.ph/" target="_blank" rel="noopener noreferrer" className="hover:underline">DILG Region XII</a>
              </div>
              <div>
                Developed by <a href="mailto:mbmanait@dilg.gov.ph" className="hover:underline">Mel Roy Manait (LGMED)</a>
              </div>
            </div>
          </div>
        </aside>
        )}

        {/* Floating content header aligned to content area */}
        <header className={`fixed top-0 right-0 left-0 ${sidebarCollapsed ? 'lg:left-0' : 'lg:left-64'} h-14 z-30 border-b bg-background`}>
          <div className="h-full w-full flex items-center">
            <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
              <button
                data-slot="sidebar-trigger"
                data-sidebar="trigger"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-7 -ml-1"
                onClick={toggleSidebar}
                aria-label="Toggle Sidebar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-panel-left">
                  <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                  <path d="M9 3v18"></path>
                </svg>
                <span className="sr-only">Toggle Sidebar</span>
              </button>
              <div data-orientation="vertical" role="none" data-slot="separator" className="bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px mx-2 data-[orientation=vertical]:h-4"></div>
              <h1 className="text-base font-medium">
                {tab === 'dashboard' ? 'Dashboard' : tab === 'demography' ? 'Demography' : 'About'}
              </h1>
              <div className="ml-auto">
                <button
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-7"
                  onClick={() => setWide(w => !w)}
                  aria-label="Toggle Content Width"
                  title={wide ? 'Limit content width' : 'Use full width'}
                >
                  {wide ? (
                    // minimize icon
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
                      <path d="M16 3h3a2 2 0 0 1 2 2v3"/>
                      <path d="M8 21H5a2 2 0 0 1-2-2v-3"/>
                      <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
                      <path d="M8 12h8"/>
                    </svg>
                  ) : (
                    // maximize icon
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h6v6"/>
                      <path d="M9 21H3v-6"/>
                      <path d="M21 3l-7 7"/>
                      <path d="M3 21l7-7"/>
                    </svg>
                  )}
                  <span className="sr-only">Toggle Content Width</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="p-6 pt-20">
          <div className={`${wide ? 'w-full' : 'max-w-7xl mx-auto'} space-y-6`}>

            <section className="rounded-xl border p-4 space-y-3">
              <FilterBar onChange={() => { /* persist band filter */ force() }} onAuditChange={() => {
                // if current bandFilter not applicable for audit, clear it
                const audit = store.state.audit
                const set = metricIsStatus() ? new Set(['pass','fail']) : (audit==='ADAC' ? new Set(['high','moderate','low']) : new Set(['elite','compliant','near','below']))
                if (bandFilter && !set.has(bandFilter)) setBandFilter(null)
              }} />
              {bandFilter && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md inline-flex items-center gap-2">
                  <span>Band filter: {bandFilter}</span>
                  <button className="underline" onClick={() => setBandFilter(null)}>clear</button>
                </div>
              )}
            </section>

            {tab === 'dashboard' && (
              <>
                <MetricCards rows={rows} years={years} onBandFilter={(b) => setBandFilter(b)} />

                <section>
                  <MapView rows={rows} />
                </section>

                <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-xl border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="font-medium">Functional Distribution</h2>
                    <div className="text-xs text-muted-foreground">
                      {metricIsStatus() ? 'Passers vs Non-Passers' : (store.state.audit === 'ADAC' ? 'High / Moderate / Low' : 'Band distribution')}
                    </div>
                  </div>
                  <BandDistribution rows={rows} />
                  </div>
                

                  <div className="rounded-xl border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-medium">Trend by Type</h2>
                    <div className="text-xs text-muted-foreground">{years.length ? `${years[0]}-${years[years.length - 1]}` : ''}</div>
                  </div>
                  {chartData ? (
                    <Line
                      data={chartData as any}
                      options={{
                        responsive: true,
                        scales: {
                          y: metricIsStatus() ? { suggestedMin: 0, suggestedMax: 100, ticks: { callback: (v) => `${v}%` } } : {},
                        },
                        plugins: { legend: { position: 'bottom' } },
                      }}
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground">Loading…</div>
                  )}
                  </div>
                </section>

                <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-xl border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="font-medium">{metricIsStatus() ? 'Pass % (Latest)' : 'Scores (Latest)'} – by LGU</h2>
                      <div className="text-xs text-muted-foreground">Top 30</div>
                    </div>
                    <BarChartLGU rows={rows} />
                  </div>
                  <div className="rounded-xl border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="font-medium">{metricIsStatus() ? 'Pass % (Latest)' : 'Avg (Latest)'} – by Province</h2>
                    </div>
                    <ProvinceChart rows={rows} />
                  </div>
                </section>

                {/* Heatmap merged into Detailed Records (cell coloring) */}

                <section className="rounded-xl border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-medium">Detailed Records</h2>
                    <div className="text-xs text-muted-foreground">Sorted by latest year</div>
                  </div>
                  <RecordsTable rows={rows} />
                </section>
              </>
            )}

            {tab === 'demography' && (
              <DemographyView rows={rows} />
            )}

            {tab === 'about' && (
              <section className="rounded-xl border p-4">
                <h2 className="font-medium mb-2">About GovDash XII</h2>
                <p className="text-sm text-muted-foreground">
                  Built with Vite, React, shadcn/ui, Tailwind, and Chart.js. Data source: <code>lg-audits.json</code> served from the site root.
                </p>
              </section>
            )}
          </div>
        </main>
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="lg:hidden">
            <div className="fixed inset-0 bg-black/30 z-30" onClick={() => setSidebarOpen(false)} />
            <aside className="fixed z-40 inset-y-0 left-0 w-64 border-r shadow-lg p-4 space-y-4" style={{ background: 'oklch(98.5% 0 0)', borderColor: 'oklch(92.2% 0 0)' }}>
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold tracking-tight">DataForge</div>
                <button className="inline-flex items-center justify-center w-9 h-9 border rounded-md" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <nav className="space-y-1">
                <button onClick={() => { setTab('dashboard'); setSidebarOpen(false) }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='dashboard' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-8 9 8"/><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 21V9h6v12"/></svg>
                  <span>Dashboard</span>
                </button>
                <button onClick={() => { setTab('demography'); setSidebarOpen(false) }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='demography' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><path strokeWidth="2" strokeLinecap="round" d="M4 19v-6m6 6V5m6 14v-9"/></svg>
                  <span>Demography</span>
                </button>
                <button onClick={() => { setTab('about'); setSidebarOpen(false) }} className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${tab==='about' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-[#f5f5f5]'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9" strokeWidth="2"/><path strokeWidth="2" strokeLinecap="round" d="M12 8h.01M11 12h2v5h-2z"/></svg>
                  <span>About</span>
                </button>
              </nav>
              <div className="mt-4 pt-3 border-t text-[11px] text-muted-foreground" style={{ borderColor: 'oklch(92.2% 0 0)' }}>
                <div>
                  © {new Date().getFullYear()} <a href="https://region12.dilg.gov.ph/" target="_blank" rel="noopener noreferrer" className="hover:underline">DILG Region XII</a>
                </div>
                <div>
                  Developed by <a href="mailto:mbmanait@dilg.gov.ph" className="hover:underline">Mel Roy Manait (LGMED)</a>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}


