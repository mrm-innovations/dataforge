import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
import { store, statusToNum, fmt, bandLabelFor, metricIsStatus } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { hsl } from '@/lib/colors'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend)

type Props = {
  open: boolean
  onClose: () => void
  lgu: string
  province: string
  initialAudit?: string
}

export function LguDialog({ open, onClose, lgu, province, initialAudit }: Props) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { clearParams(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const canon = useMemo(() => {
    const byExact = store.LGUS.find((g) => g.lgu === lgu && g.province === province)
    if (byExact) return byExact
    return store.LGUS.find((g) => g.lgu === lgu) || null
  }, [lgu, province])

  const audits = useMemo(() => Object.keys(store.AUDITS || {}), [])
  const [activeAudit, setActiveAudit] = useState<string | null>(null)
  useEffect(() => {
    if (!audits.length) return
    const urlAudit = initialAudit && audits.includes(initialAudit) ? initialAudit : null
    setActiveAudit(urlAudit || audits[0])
  }, [audits, initialAudit])

  const closeBtnRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { if (open) closeBtnRef.current?.focus() }, [open])

  if (!open) return null
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="lgu-dialog-title" onClick={() => { clearParams(); onClose() }}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-0 flex items-start justify-center p-4 lg:p-8 overflow-auto" onClick={stop}>
        <Card className="w-full max-w-xl shadow-xl">
          <CardContent className="p-0 text-[13px]">
            <header className="flex items-center justify-between p-5 border-b">
              <div>
                <div id="lgu-dialog-title" className="text-lg font-semibold leading-snug">{lgu}</div>
                <div className="text-xs text-muted-foreground">Press Esc to close</div>
              </div>
              <button
                ref={closeBtnRef}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md border transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
                onClick={() => { clearParams(); onClose() }}
                aria-label="Close dialog"
                title="Close (Esc)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </header>

            <div className="p-5 grid grid-cols-1 gap-4">
              <section className="rounded-md border p-4">
                <div className="text-[13px] font-medium mb-2">Profile</div>
                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-md border p-3" style={{ background: 'oklch(98.5% 0 0)', borderColor: 'oklch(92.2% 0 0)' }}>
                    <div className="text-muted-foreground inline-flex items-center gap-1 text-[12px]">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor"><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 21s-6-4.35-6-10a6 6 0 1 1 12 0c0 5.65-6 10-6 10Z"/><circle cx="12" cy="11" r="2"/></svg>
                      {(() => {
                        const q = [
                          (canon?.lgu || lgu),
                          (canon?.province || province),
                          (canon?.region ? String(canon.region).toUpperCase() : null),
                          'Philippines',
                        ].filter(Boolean).join(', ')
                        return (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                            title="Open in Google Maps"
                          >
                            {[
                              (canon?.lgu || lgu),
                              (canon?.province || province),
                              (canon?.region ? String(canon.region).toUpperCase() : null),
                            ].filter(Boolean).join(', ')}
                          </a>
                        )
                      })()}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <Badge label={canon?.type || '-'} colorKey={typeColorKey(String(canon?.type || ''))} />
                    <Badge label={`Income: ${canon?.income_class || '-'}`} colorKey="indigo" />
                    <Badge label={`Pop: ${canon?.population != null ? fmt(Number(canon.population), 0) : '-'}`} colorKey="blue" />
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[12px] w-24">PSGC</span>
                    <span className="text-foreground text-[13px]">{(canon as any)?.psgc || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[12px] w-24">Region</span>
                    <span className="text-foreground text-[13px]">{canon?.region || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[12px] w-24">Province</span>
                    <span className="text-foreground text-[13px]">{canon?.province || province}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[12px] w-24">LGU</span>
                    <span className="text-foreground text-[13px]">{canon?.lgu || lgu}</span>
                  </div>
                </div>
              </section>

              <section className="rounded-md border p-4">
                <div className="text-[13px] font-medium mb-2">Scorecards</div>
                {audits.length && activeAudit ? (
                  <Tabs value={activeAudit} onValueChange={(v) => setActiveAudit(v)}>
                    <TabsList className="mb-3 sticky top-0 z-10 bg-muted p-1 rounded-md shadow-sm overflow-x-auto whitespace-nowrap">
                      {audits.map((a) => (
                        <TabsTrigger
                          key={a}
                          value={a}
                          className="text-[13px] px-3 py-1.5 rounded-md transition data-[state=inactive]:text-muted-foreground hover:bg-muted data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                        >
                          {a}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {audits.map((a) => {
                      const meta = (store.AUDITS as any)[a] || {}
                      const years: number[] = (meta.years || [])
                      const metric = meta.metric
                      const raw = (canon as any)?.results?.[a] || {}
                      const series = years.map((y) => {
                        const v = raw?.[String(y)]
                        if (metric === 'status') {
                          const n = statusToNum(v)
                          return n == null ? null : (n === 1 ? 100 : 0)
                        }
                        return v == null ? null : +v
                      }) as Array<number | null>

                      const lastIdx = (() => { for (let i = series.length - 1; i >= 0; i--) if (series[i] != null) return i; return -1 })()
                      const prevIdx = (() => { for (let i = lastIdx - 1; i >= 0; i--) if (series[i] != null) return i; return -1 })()
                      const latestVal = lastIdx >= 0 ? series[lastIdx] : null
                      const prevVal = prevIdx >= 0 ? series[prevIdx] : null
                      const change = latestVal != null && prevVal != null ? (latestVal - prevVal) : null
                      const present = series.filter((v) => v != null).length
                      const coverage = years.length ? (present / years.length) * 100 : 0

                      const chart = {
                        labels: years.map(String),
                        datasets: [
                          {
                            label: metric === 'status' ? 'Pass %' : 'Score',
                            data: series,
                            borderColor: 'hsl(217.2 91.2% 59.8%)',
                            backgroundColor: 'hsl(217.2 91.2% 59.8%)',
                            spanGaps: true,
                            tension: 0.25,
                          },
                        ],
                      }
                      const kpiBadge = (val: number | null) => (
                        <span className={`text-[11px] px-1.5 py-0.5 rounded-md border ${val == null ? 'text-zinc-500' : val >= 0 ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-rose-700 border-rose-200 bg-rose-50'}`}>
                          {val == null ? '—' : `${val>0?'+':''}${fmt(val, metric==='status'?0:1)}${metric==='status'?'%':''}`}
                        </span>
                      )
                      return (
                        <TabsContent key={a} value={a} className="mt-2">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="text-xs text-muted-foreground inline-flex items-center gap-3">
                              <span>Latest: <strong className="text-foreground">{latestVal == null ? '-' : `${fmt(latestVal, metric==='status'?0:1)}${metric==='status'?'%':''}`}</strong></span>
                              <span>Change: {kpiBadge(change)}</span>
                              <span>Coverage: <strong>{fmt(coverage,0)}%</strong></span>
                            </div>
                            <div className="inline-flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => exportCsv(lgu, province, a, years, raw, metric)}>Export CSV</Button>
                              <Button size="sm" variant="outline" onClick={() => copyLink(lgu, province, a)}>Copy Link</Button>
                            </div>
                          </div>
                          {years.length ? (
                            <div style={{ height: 260 }}>
                              <Line
                                data={chart as any}
                                options={{
                                  responsive: true,
                                  maintainAspectRatio: false,
                                  scales: {
                                    y: metric === 'status' ? { suggestedMin: 0, suggestedMax: 100, ticks: { callback: (v) => `${v}%` } } : {},
                                  },
                                  plugins: { legend: { display: false } },
                                }}
                              />
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">No data</div>
                          )}
                          <div className="mt-3">
                            <div className="text-xs font-medium mb-1">Raw Values</div>
                            {years.length ? (
                              <div className="overflow-auto rounded-md border">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-left" style={{ background: 'oklch(98.5% 0 0)' }}>
                                      <th className="px-2 py-1 border-r" style={{ borderColor: 'oklch(92.2% 0 0)' }}>Year</th>
                                      <th className="px-2 py-1">{metric==='status' ? 'Status' : 'Value'}</th>
                                      {metric !== 'status' && (
                                        <th className="px-2 py-1">Label</th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {years.map((y, idx) => (
                                      <tr key={y} className="border-t" style={{ borderColor: 'oklch(95% 0 0)' }}>
                                        <td className="px-2 py-1">{y}</td>
                                        <td className="px-2 py-1">{metric==='status' ? (raw?.[String(y)] ?? '-') : ((series[idx] == null) ? '-' : fmt(series[idx] as number))}</td>
                                        {metric !== 'status' && (
                                          <td className="px-2 py-1">{series[idx] == null ? '-' : bandLabelFor(a, series[idx] as number)}</td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                          </div>
                        </TabsContent>
                      )
                    })}
                  </Tabs>
                ) : (
                  <div className="text-xs text-muted-foreground">No audits configured.</div>
                )}
              </section>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function exportCsv(lgu: string, province: string, audit: string, years: number[], raw: Record<string, any>, metric: string){
  const headers = ['YEAR', metric==='status' ? 'STATUS' : 'VALUE']
  const lines = [headers.join(',')]
  for (const y of years){
    const v = raw?.[String(y)]
    if (metric==='status'){
      lines.push([y, v == null ? '' : '"' + String(v).replace(/"/g,'""') + '"'].join(','))
    } else {
      lines.push([y, v == null ? '' : String(v)].join(','))
    }
  }
  const csv = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${audit.toLowerCase()}_${province}_${lgu}_series.csv`.replace(/\s+/g,'_')
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function copyLink(lgu: string, province: string, audit: string){
  const url = new URL(window.location.href)
  url.searchParams.set('lgu', lgu)
  url.searchParams.set('province', province)
  url.searchParams.set('audit', audit)
  if ((navigator as any).clipboard?.writeText) (navigator as any).clipboard.writeText(url.toString()).catch(()=>{})
  window.history.replaceState({}, '', url)
}

function clearParams(){
  const url = new URL(window.location.href)
  url.searchParams.delete('lgu')
  url.searchParams.delete('province')
  url.searchParams.delete('audit')
  window.history.replaceState({}, '', url)
}

function typeColorKey(t: string): string {
  const key = t.trim().toLowerCase()
  if (key === 'province') return 'green'
  if (key === 'municipality') return 'blue'
  if (key === 'component city') return 'red'
  if (key === 'highly urbanized city') return 'yellow'
  return 'indigo'
}

function Badge({ label, colorKey }: { label: string; colorKey: string }){
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md border text-[12px]"
      style={{ background: hsl(colorKey, 0.12), color: hsl(colorKey), borderColor: hsl(colorKey, 0.3) }}
    >
      {label}
    </span>
  )
}
