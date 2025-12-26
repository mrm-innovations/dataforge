import React, { useEffect, useMemo, useState } from 'react'
import { store } from '@/lib/store'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Download } from 'lucide-react'

type CriteriaInfo = { key: string; label: string; year: number }

type LguRow = {
  province: string
  lgu: string
  type: string
  statuses: Record<string, string | null>
}

const STATUS_LABELS: Record<string, string> = {
  met: 'Met',
  failed: 'Failed',
  consideration: 'Consideration',
  na: 'N/A',
}

function unique<T>(arr: T[]) {
  return Array.from(new Set(arr))
}

function normStatusFromValue(val: unknown): string | null {
  const n = Number(val)
  if (!Number.isFinite(n)) return null
  if (n === 0) return 'failed'
  if (n === 1) return 'met'
  if (n === 2) return 'consideration'
  if (n === 3) return 'na'
  return null
}

function resolveOverallStatus(record: any): string | null {
  if (record?.overall_status) return record.overall_status
  const indicators = Array.isArray(record?.indicators) ? record.indicators : []
  const overallIndicator = indicators.find((i: any) => i?.key === 'overall_process' || String(i?.label || '').toLowerCase() === 'overall process')
  if (overallIndicator) {
    return overallIndicator.status || normStatusFromValue(overallIndicator.value)
  }
  const statuses = indicators.map((i: any) => i?.status || normStatusFromValue(i?.value)).filter(Boolean) as string[]
  if (!statuses.length) return null
  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('consideration')) return 'consideration'
  if (statuses.every((s) => s === 'na')) return 'na'
  return 'met'
}

export function SglgOverview() {
  const criteriaList = store.SGLG_CRITERIA
  const years = unique(criteriaList.map((c) => c.year)).sort((a, b) => b - a)
  const [year, setYear] = useState<number | null>(years[0] ?? null)

  useEffect(() => {
    if (!criteriaList.length) return
    const latestYear = years[0]
    if (year == null || !years.includes(year)) setYear(latestYear)
  }, [criteriaList, years, year])

  const criteriaForYear = useMemo(
    () => criteriaList.filter((c) => c.year === year),
    [criteriaList, year],
  )
  const criteriaLabelMap = useMemo(() => {
    const map = new Map<string, string>()
    criteriaForYear.forEach((c) => {
      if (c.key && c.label) map.set(c.key, c.label)
    })
    return map
  }, [criteriaForYear])

  const lguRows = useMemo(() => {
    const map = new Map<string, LguRow>()
    criteriaForYear.forEach((criteria) => {
      const key = year && criteria.key ? `${year}:${criteria.key}` : ''
      const records = key ? store.SGLG_CRITERIA_DATA[key] || [] : []
      records.forEach((rec: any) => {
        const province = String(rec.province || '').trim()
        const lgu = String(rec.lgu || '').trim()
        if (!lgu) return
        const rowKey = `${province}||${lgu}`
        const entry = map.get(rowKey) || {
          province,
          lgu,
          type: String(rec.type || '').trim(),
          statuses: {},
        }
        if (!entry.type && rec.type) entry.type = String(rec.type || '').trim()
        entry.statuses[criteria.key] = resolveOverallStatus(rec)
        map.set(rowKey, entry)
      })
    })
    return Array.from(map.values())
  }, [criteriaForYear, year])

  const provinces = useMemo(() => unique(lguRows.map((r) => r.province).filter(Boolean)).sort(), [lguRows])
  const types = useMemo(() => unique(lguRows.map((r) => r.type).filter(Boolean)).sort(), [lguRows])

  const [provinceFilter, setProvinceFilter] = useState('__all__')
  const [typeFilter, setTypeFilter] = useState('__all__')
  const [statusFilter, setStatusFilter] = useState('__all__')
  const [search, setSearch] = useState('')

  const criteriaCount = criteriaForYear.length

  const summarized = useMemo(() => {
    return lguRows.map((row) => {
      const statuses = criteriaForYear.map((c) => row.statuses[c.key] || null)
      const metCount = statuses.filter((s) => s === 'met').length
      const failedCount = statuses.filter((s) => s === 'failed').length
      const considerationCount = statuses.filter((s) => s === 'consideration').length
      const naCount = statuses.filter((s) => s === 'na').length
      const missingCount = statuses.filter((s) => !s).length
      const overall = failedCount > 0
        ? 'failed'
        : considerationCount > 0
        ? 'consideration'
        : metCount > 0
        ? 'met'
        : 'na'
      const failedCriteria = criteriaForYear
        .filter((c) => row.statuses[c.key] === 'failed')
        .map((c) => c.label)
      return {
        ...row,
        metCount,
        failedCount,
        considerationCount,
        naCount,
        missingCount,
        overall,
        failedCriteria,
      }
    })
  }, [lguRows, criteriaForYear])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return summarized
      .filter((r) => (provinceFilter === '__all__' ? true : r.province === provinceFilter))
      .filter((r) => (typeFilter === '__all__' ? true : r.type === typeFilter))
      .filter((r) => {
        if (statusFilter === '__all__') return true
        if (statusFilter === 'failed_any') return r.failedCount > 0
        if (statusFilter === 'failed_2plus') return r.failedCount >= 2
        if (statusFilter === 'met_all') return criteriaCount > 0 && r.failedCount === 0 && r.considerationCount === 0 && (r.metCount + r.naCount) === criteriaCount
        if (statusFilter === 'consideration_any') return r.considerationCount > 0
        return true
      })
      .filter((r) => {
        if (!q) return true
        const hay = `${r.province} ${r.lgu} ${r.type}`.toLowerCase()
        return hay.includes(q)
      })
  }, [summarized, provinceFilter, typeFilter, statusFilter, search, criteriaCount])

  const criteriaSummary = useMemo(() => {
    return criteriaForYear.map((criteria) => {
      const key = year && criteria.key ? `${year}:${criteria.key}` : ''
      const records = key ? store.SGLG_CRITERIA_DATA[key] || [] : []
      const statuses = records.map((r: any) => resolveOverallStatus(r)).filter((s) => s) as string[]
      const met = statuses.filter((s) => s === 'met').length
      const failed = statuses.filter((s) => s === 'failed').length
      const consideration = statuses.filter((s) => s === 'consideration').length
      const na = statuses.filter((s) => s === 'na').length
      return { criteria, met, failed, consideration, na, total: records.length }
    })
  }, [criteriaForYear, year])

  const totals = useMemo(() => {
    const totalLGUs = summarized.length
    const failedAny = summarized.filter((r) => r.failedCount > 0).length
    const failed2plus = summarized.filter((r) => r.failedCount >= 2).length
    const avgMet = totalLGUs ? summarized.reduce((s, r) => s + r.metCount, 0) / totalLGUs : 0
    return { totalLGUs, failedAny, failed2plus, avgMet }
  }, [summarized])

  const downloadCsv = () => {
    const headers = [
      'Province',
      'LGU',
      'Type',
      'Overall Status',
      'Criteria Met',
      'Criteria Failed',
      'Criteria Consideration',
      'Criteria N/A',
      'Criteria Missing',
      'Failed Criteria',
    ]
    const lines = [headers.map((s) => `"${s}"`).join(',')]
    filtered.forEach((r) => {
      const row = [
        r.province,
        r.lgu,
        r.type || '',
        STATUS_LABELS[r.overall] || r.overall,
        r.metCount,
        r.failedCount,
        r.considerationCount,
        r.naCount,
        r.missingCount,
        r.failedCriteria.join('; '),
      ]
      lines.push(row.map((s) => `"${String(s).replace(/"/g, '""')}"`).join(','))
    })
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sglg_overview_${year || ''}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  if (!year || !criteriaForYear.length) {
    return <div className="text-sm text-muted-foreground">No SGLG criteria datasets loaded.</div>
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-5">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Year</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Province</Label>
          <Select value={provinceFilter} onValueChange={(v) => setProvinceFilter(v)}>
            <SelectTrigger><SelectValue placeholder="All provinces" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Provinces</SelectItem>
              {provinces.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">LGU Type</Label>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v)}>
            <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Types</SelectItem>
              {types.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Status Focus</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
            <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              <SelectItem value="failed_any">Failed (any)</SelectItem>
              <SelectItem value="failed_2plus">Failed (2+)</SelectItem>
              <SelectItem value="consideration_any">Consideration (any)</SelectItem>
              <SelectItem value="met_all">Met all</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Search</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search LGU or province" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">LGUs in Scope</div>
            <div className="text-2xl font-semibold mt-1">{totals.totalLGUs}</div>
            <div className="text-xs text-muted-foreground mt-1">{criteriaCount} criteria loaded</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">LGUs Failing (Any)</div>
            <div className="text-2xl font-semibold mt-1">{totals.failedAny}</div>
            <div className="text-xs text-muted-foreground mt-1">Need attention</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">LGUs Failing (2+)</div>
            <div className="text-2xl font-semibold mt-1">{totals.failed2plus}</div>
            <div className="text-xs text-muted-foreground mt-1">High priority</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Avg Criteria Met</div>
            <div className="text-2xl font-semibold mt-1">{totals.avgMet.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground mt-1">Per LGU</div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Criteria Summary</div>
          <div className="text-xs text-muted-foreground">{criteriaCount} criteria</div>
        </div>
        <div className="overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50">
              <tr>
                <th className="text-left p-2 border-b">Criteria</th>
                <th className="text-right p-2 border-b">Met</th>
                <th className="text-right p-2 border-b">Consideration</th>
                <th className="text-right p-2 border-b">Failed</th>
                <th className="text-right p-2 border-b">N/A</th>
                <th className="text-right p-2 border-b">Total</th>
              </tr>
            </thead>
            <tbody>
              {criteriaSummary.map((row) => (
                <tr key={row.criteria.key} className="odd:bg-white even:bg-zinc-50">
                  <td className="p-2 border-b">{row.criteria.label}</td>
                  <td className="p-2 border-b text-right">{row.met}</td>
                  <td className="p-2 border-b text-right">{row.consideration}</td>
                  <td className="p-2 border-b text-right">{row.failed}</td>
                  <td className="p-2 border-b text-right">{row.na}</td>
                  <td className="p-2 border-b text-right">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">LGU Overview</div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setProvinceFilter('__all__')
                setTypeFilter('__all__')
                setStatusFilter('__all__')
                setSearch('')
              }}
            >
              Reset filters
            </Button>
            <Button size="sm" onClick={downloadCsv}><Download className="h-4 w-4 mr-2" /> CSV</Button>
            <div className="text-xs text-muted-foreground">{filtered.length} LGUs</div>
          </div>
        </div>
        <div className="rounded border overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50">
              <tr>
                <th className="text-left p-2 border-b">Province</th>
                <th className="text-left p-2 border-b">LGU</th>
                <th className="text-left p-2 border-b">Type</th>
                <th className="text-right p-2 border-b">Met</th>
                <th className="text-right p-2 border-b">Failed</th>
                <th className="text-right p-2 border-b">Consideration</th>
                <th className="text-left p-2 border-b">Status</th>
                <th className="text-left p-2 border-b">Failed Criteria</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 400).map((r, idx) => (
                <tr key={`${r.province}-${r.lgu}-${idx}`} className={idx % 2 ? 'bg-zinc-50' : 'bg-white'}>
                  <td className="p-2 border-b">{r.province}</td>
                  <td className="p-2 border-b">{r.lgu}</td>
                  <td className="p-2 border-b">{r.type || '-'}</td>
                  <td className="p-2 border-b text-right">{r.metCount}/{criteriaCount}</td>
                  <td className="p-2 border-b text-right">{r.failedCount}</td>
                  <td className="p-2 border-b text-right">{r.considerationCount}</td>
                  <td className="p-2 border-b">
                    <StatusPill status={r.overall} />
                  </td>
                  <td className="p-2 border-b">{r.failedCriteria.length ? r.failedCriteria.join(', ') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 400 && (
          <div className="text-xs text-muted-foreground">Showing first 400 rows. Export CSV for full list.</div>
        )}
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground">-</span>
  const label = STATUS_LABELS[status] || status
  const color = status === 'failed' ? 'bg-rose-100 text-rose-800 border-rose-200'
    : status === 'met' ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : status === 'consideration' ? 'bg-amber-100 text-amber-800 border-amber-200'
    : 'bg-slate-100 text-slate-700 border-slate-200'
  return <span className={`px-2 py-0.5 rounded border text-[11px] ${color}`}>{label}</span>
}
