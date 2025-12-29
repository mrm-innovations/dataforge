import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { store } from '@/lib/store'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AlertOctagon, AlertTriangle, CheckCircle, ExternalLink, Users } from 'lucide-react'
import { buildSglgScorecardHtml, openScorecardHtml } from '@/lib/scorecardPdf'

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

function resolveIndicatorStatus(indicator: any): string {
  const status = indicator?.status || normStatusFromValue(indicator?.value)
  if (status === 'met' || status === 'failed' || status === 'consideration' || status === 'na') return status
  return 'na'
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

type Props = {
  onFilteredCountChange?: (count: number) => void
}

export type SglgOverviewActions = {
  resetFilters: () => void
  exportCsv: () => void
}

export const SglgOverview = forwardRef<SglgOverviewActions, Props>(({ onFilteredCountChange }, ref) => {
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
  const [criteriaFocusKey, setCriteriaFocusKey] = useState('__all__')
  const [statusFilter, setStatusFilter] = useState('__all__')
  const [search, setSearch] = useState('')

  const criteriaCount = criteriaForYear.length
  const criteriaOptions = useMemo(
    () => criteriaForYear.filter((c) => c.key && c.label),
    [criteriaForYear],
  )
  const criteriaFocusLabel = criteriaFocusKey !== '__all__' ? criteriaLabelMap.get(criteriaFocusKey) || criteriaFocusKey : null
  const statusOptions = useMemo(() => {
    if (criteriaFocusKey === '__all__') {
      return [
        { value: '__all__', label: 'All' },
        { value: 'failed_any', label: 'Failed (any)' },
        { value: 'failed_2plus', label: 'Failed (2+)' },
        { value: 'consideration_any', label: 'Consideration (any)' },
        { value: 'met_all', label: 'Met all' },
      ]
    }
    return [
      { value: '__all__', label: 'All' },
      { value: 'failed', label: 'Failed' },
      { value: 'consideration', label: 'Consideration' },
      { value: 'met', label: 'Met' },
      { value: 'na', label: 'N/A' },
    ]
  }, [criteriaFocusKey])

  useEffect(() => {
    if (criteriaFocusKey === '__all__') {
      const allowed = new Set(['__all__', 'failed_any', 'failed_2plus', 'consideration_any', 'met_all'])
      if (!allowed.has(statusFilter)) setStatusFilter('__all__')
      return
    }
    const allowed = new Set(['__all__', 'failed', 'consideration', 'met', 'na'])
    if (!allowed.has(statusFilter)) setStatusFilter('__all__')
  }, [criteriaFocusKey, statusFilter])

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
        const criteriaStatus = criteriaFocusKey === '__all__' ? null : (r.statuses[criteriaFocusKey] || null)
        if (criteriaFocusKey !== '__all__') {
          if (!criteriaStatus) return false
          if (statusFilter === '__all__') return true
          return criteriaStatus === statusFilter
        }
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
  }, [summarized, provinceFilter, typeFilter, criteriaFocusKey, statusFilter, search, criteriaCount])

  useEffect(() => {
    onFilteredCountChange?.(filtered.length)
  }, [filtered.length, onFilteredCountChange])

  const criteriaSummary = useMemo(() => {
    return criteriaForYear.map((criteria) => {
      const key = year && criteria.key ? `${year}:${criteria.key}` : ''
      const records = key ? store.SGLG_CRITERIA_DATA[key] || [] : []
      const statuses = records.map((r: any) => resolveOverallStatus(r)).filter((s) => s) as string[]
      const met = statuses.filter((s) => s === 'met').length
      const failed = statuses.filter((s) => s === 'failed').length
      const consideration = statuses.filter((s) => s === 'consideration').length
      const na = statuses.filter((s) => s === 'na').length
      const total = records.length
      const indicatorMap = new Map<string, { key: string; label: string; met: number; failed: number; consideration: number; na: number; total: number }>()
      records.forEach((rec: any) => {
        const indicators = Array.isArray(rec?.indicators) ? rec.indicators : []
        indicators.forEach((indicator: any) => {
          const key = String(indicator?.key || indicator?.label || '').trim()
          if (!key) return
          const label = String(indicator?.label || indicator?.key || key).trim()
          let entry = indicatorMap.get(key)
          if (!entry) {
            entry = { key, label, met: 0, failed: 0, consideration: 0, na: 0, total }
            indicatorMap.set(key, entry)
          }
          const status = resolveIndicatorStatus(indicator)
          if (status === 'met') entry.met += 1
          else if (status === 'failed') entry.failed += 1
          else if (status === 'consideration') entry.consideration += 1
          else entry.na += 1
        })
      })
      indicatorMap.forEach((entry) => {
        const counted = entry.met + entry.failed + entry.consideration + entry.na
        const missing = total - counted
        if (missing > 0) entry.na += missing
      })
      const indicators = Array.from(indicatorMap.values())
      return { criteria, met, failed, consideration, na, total, indicators }
    })
  }, [criteriaForYear, year])
  const [expandedCriteria, setExpandedCriteria] = useState<Record<string, boolean>>({})
  const expandedCount = criteriaSummary.filter((row) => expandedCriteria[row.criteria.key]).length
  const toggleCriteria = (key: string) => {
    setExpandedCriteria((prev) => ({ ...prev, [key]: !prev[key] }))
  }
  const expandAllCriteria = () => {
    const next: Record<string, boolean> = {}
    criteriaSummary.forEach((row) => { next[row.criteria.key] = true })
    setExpandedCriteria(next)
  }
  const collapseAllCriteria = () => setExpandedCriteria({})

  const totals = useMemo(() => {
    const totalLGUs = summarized.length
    const failedAny = summarized.filter((r) => r.failedCount > 0).length
    const failed2plus = summarized.filter((r) => r.failedCount >= 2).length
    const avgMet = totalLGUs ? summarized.reduce((s, r) => s + r.metCount, 0) / totalLGUs : 0
    const failedAnyPct = totalLGUs ? (failedAny / totalLGUs) * 100 : 0
    const failed2plusPct = totalLGUs ? (failed2plus / totalLGUs) * 100 : 0
    return { totalLGUs, failedAny, failed2plus, avgMet, failedAnyPct, failed2plusPct }
  }, [summarized])

  const resetFilters = () => {
    setProvinceFilter('__all__')
    setTypeFilter('__all__')
    setStatusFilter('__all__')
    setCriteriaFocusKey('__all__')
    setSearch('')
  }

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
    if (criteriaFocusKey !== '__all__') {
      headers.push('Criteria Focus')
      headers.push('Criteria Status')
    }
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
      if (criteriaFocusKey !== '__all__') {
        const criteriaLabel = criteriaLabelMap.get(criteriaFocusKey) || criteriaFocusKey
        const criteriaStatus = r.statuses[criteriaFocusKey] || ''
        row.push(criteriaLabel)
        row.push(STATUS_LABELS[criteriaStatus] || criteriaStatus)
      }
      lines.push(row.map((s) => `"${String(s).replace(/"/g, '""')}"`).join(','))
    })
    const csv = lines.join('\n') + '\n'
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sglg_overview_${year || ''}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  useImperativeHandle(ref, () => ({ resetFilters, exportCsv: downloadCsv }), [resetFilters, downloadCsv])

  const exportScorecard = (row: { province: string; lgu: string; type: string }) => {
    if (!year || !criteriaForYear.length) {
      window.alert('No SGLG criteria datasets loaded.')
      return
    }
    const canon = store.LGUS.find((g) => g.lgu === row.lgu && g.province === row.province)
      || store.LGUS.find((g) => g.lgu === row.lgu)
      || null
    const fmtNum = (val: number | null | undefined) => (val == null ? '-' : Number(val).toLocaleString('en-PH'))

    const criteriaData = criteriaForYear.map((criteria) => {
      const key = `${year}:${criteria.key}`
      const records = store.SGLG_CRITERIA_DATA[key] || []
      const record = records.find((r: any) => {
        return String(r?.lgu || '').trim().toLowerCase() === String(row.lgu || '').trim().toLowerCase()
          && String(r?.province || '').trim().toLowerCase() === String(row.province || '').trim().toLowerCase()
      })
      const indicators = Array.isArray(record?.indicators) ? record.indicators : []
      const overall = resolveOverallStatus(record)
      const failedIndicators = indicators.filter((i: any) => (i?.status || normStatusFromValue(i?.value)) === 'failed')
      const considerationIndicators = indicators.filter((i: any) => (i?.status || normStatusFromValue(i?.value)) === 'consideration')
      return {
        label: criteria.label,
        overall,
        failedIndicators,
        considerationIndicators,
      }
    })

    const totals = criteriaData.reduce(
      (acc, entry) => {
        if (entry.overall === 'failed') acc.failed += 1
        else if (entry.overall === 'consideration') acc.consideration += 1
        else if (entry.overall === 'met') acc.met += 1
        else acc.na += 1
        return acc
      },
      { met: 0, failed: 0, consideration: 0, na: 0 },
    )

    const statusLabel = (status: string | null | undefined) => {
      if (!status) return 'N/A'
      return STATUS_LABELS[status] || status
    }

    const metaRows = [
      ['Province', canon?.province || row.province],
      ['Region', canon?.region || '-'],
      ['Type', canon?.type || row.type || '-'],
      ['Income Class', canon?.income_class || '-'],
      ['Population', canon?.population != null ? fmtNum(Number(canon.population)) : '-'],
    ]

    const rows = criteriaData.map((entry) => ({
      label: entry.label,
      overall: statusLabel(entry.overall),
      failedIndicators: entry.failedIndicators.map((i: any) => i.label || i.key),
      considerationIndicators: entry.considerationIndicators.map((i: any) => i.label || i.key),
    }))

    const header = `${row.lgu} - SGLG ${year} Scorecard`
    const html = buildSglgScorecardHtml({
      title: header,
      totals,
      metaRows,
      rows,
    })
    openScorecardHtml(html, header)
  }

  if (!year || !criteriaForYear.length) {
    return <div className="text-sm text-muted-foreground">No SGLG criteria datasets loaded.</div>
  }

  const baseCardClass = 'hover:shadow-sm transition border'
  const scopeCardClass = 'bg-[oklch(98.5%_0_0)] border-[oklch(92.2%_0_0)]'
  const failAnyCardClass = 'bg-amber-50 border-amber-300'
  const fail2CardClass = 'bg-rose-50 border-rose-300'
  const avgCardClass = totals.avgMet >= (criteriaCount / 2) ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-6">
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
          <Label className="text-xs">Criteria Focus</Label>
          <Select value={criteriaFocusKey} onValueChange={(v) => setCriteriaFocusKey(v)}>
            <SelectTrigger><SelectValue placeholder="All criteria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Criteria</SelectItem>
              {criteriaOptions.map((c) => (<SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Status Focus</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
            <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Search</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search LGU or province" />
        </div>
      </div>
      <div className="text-xs text-muted-foreground">{filtered.length} LGUs</div>

      {criteriaFocusLabel && (
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 bg-zinc-50 text-zinc-700">
            Focus: {criteriaFocusLabel}
            <button className="text-zinc-500 hover:text-zinc-900" onClick={() => setCriteriaFocusKey('__all__')}>
              Clear
            </button>
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className={`${baseCardClass} ${scopeCardClass}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="text-xs text-muted-foreground">LGUs in Scope</div>
              <div className="rounded-md border p-1.5 text-zinc-600" style={{ background: 'rgba(15, 23, 42, 0.03)' }}>
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-semibold mt-1">{totals.totalLGUs}</div>
            <div className="text-xs text-muted-foreground mt-1">{criteriaCount} criteria loaded</div>
          </CardContent>
        </Card>
          <Card className={`${baseCardClass} ${failAnyCardClass}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="text-xs text-muted-foreground">LGUs Failing (Any)</div>
              <div className="rounded-md border p-1.5 text-amber-700 bg-amber-50">
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-semibold mt-1">{totals.failedAny}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Need attention{totals.totalLGUs ? ` · ${Math.round(totals.failedAnyPct)}% of LGUs` : ''}
            </div>
          </CardContent>
        </Card>
          <Card className={`${baseCardClass} ${fail2CardClass}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="text-xs text-muted-foreground">LGUs Failing (2+)</div>
              <div className="rounded-md border p-1.5 text-rose-700 bg-rose-50">
                <AlertOctagon className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-semibold mt-1">{totals.failed2plus}</div>
            <div className="text-xs text-muted-foreground mt-1">
              High priority{totals.totalLGUs ? ` · ${Math.round(totals.failed2plusPct)}% of LGUs` : ''}
            </div>
          </CardContent>
        </Card>
          <Card className={`${baseCardClass} ${avgCardClass}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="text-xs text-muted-foreground">Avg Criteria Met</div>
              <div className={`rounded-md border p-1.5 ${totals.avgMet >= (criteriaCount / 2) ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'}`}>
                <CheckCircle className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-semibold mt-1">
              {criteriaCount ? (
                <>
                  {totals.avgMet.toFixed(1)}
                  <span className="text-sm font-normal text-muted-foreground"> / {criteriaCount}</span>
                </>
              ) : (
                '-'
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Per LGU</div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Criteria Summary</div>
          <div className="text-xs text-muted-foreground flex items-center gap-3">
            <span>{criteriaCount} criteria</span>
            <button
              type="button"
              className="underline text-xs disabled:opacity-50"
              onClick={expandAllCriteria}
              disabled={expandedCount === criteriaSummary.length || criteriaSummary.length === 0}
            >
              Expand all
            </button>
            <button
              type="button"
              className="underline text-xs disabled:opacity-50"
              onClick={collapseAllCriteria}
              disabled={expandedCount === 0}
            >
              Collapse all
            </button>
          </div>
        </div>
        <div className="overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 border-b font-medium">Criteria</th>
                <th className="text-right px-4 py-3 border-b font-medium">Met</th>
                <th className="text-right px-4 py-3 border-b font-medium">Consideration</th>
                <th className="text-right px-4 py-3 border-b font-medium">Failed</th>
                <th className="text-right px-4 py-3 border-b font-medium">N/A</th>
                <th className="text-right px-4 py-3 border-b font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {criteriaSummary.map((row) => {
                const isOpen = !!expandedCriteria[row.criteria.key]
                return (
                  <React.Fragment key={row.criteria.key}>
                    <tr
                      className={`odd:bg-white even:bg-zinc-50 hover:bg-indigo-50 cursor-pointer ${criteriaFocusKey === row.criteria.key ? 'bg-indigo-50' : ''}`}
                      onClick={() => {
                        setCriteriaFocusKey(row.criteria.key)
                        setStatusFilter('__all__')
                      }}
                      role="button"
                    >
                      <td className="px-4 py-3 border-b">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center w-5 h-5 mr-2 border rounded text-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleCriteria(row.criteria.key)
                          }}
                          title={isOpen ? 'Collapse indicators' : 'Expand indicators'}
                          aria-label={isOpen ? 'Collapse indicators' : 'Expand indicators'}
                        >
                          {isOpen ? '-' : '+'}
                        </button>
                        {row.criteria.label}
                      </td>
                      <td className="px-4 py-3 border-b text-right">{row.met}</td>
                      <td className="px-4 py-3 border-b text-right">{row.consideration}</td>
                      <td className="px-4 py-3 border-b text-right">{row.failed}</td>
                      <td className="px-4 py-3 border-b text-right">{row.na}</td>
                      <td className="px-4 py-3 border-b text-right">{row.total}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-zinc-50/60">
                        <td className="px-4 py-3 border-b" colSpan={6}>
                          {row.indicators.length ? (
                            <div className="rounded border bg-white">
                              <table className="w-full text-xs">
                                <thead className="bg-zinc-50 text-[11px] uppercase tracking-wide text-muted-foreground">
                                  <tr>
                                    <th className="text-left px-4 py-3 border-b font-medium">Indicator</th>
                                    <th className="text-right px-4 py-3 border-b font-medium">Met</th>
                                    <th className="text-right px-4 py-3 border-b font-medium">Consideration</th>
                                    <th className="text-right px-4 py-3 border-b font-medium">Failed</th>
                                    <th className="text-right px-4 py-3 border-b font-medium">N/A</th>
                                    <th className="text-right px-4 py-3 border-b font-medium">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.indicators.map((indicator) => (
                                    <tr key={indicator.key} className="odd:bg-white even:bg-zinc-50">
                                      <td className="px-4 py-3 border-b">{indicator.label}</td>
                                      <td className="px-4 py-3 border-b text-right">{indicator.met}</td>
                                      <td className="px-4 py-3 border-b text-right">{indicator.consideration}</td>
                                      <td className="px-4 py-3 border-b text-right">{indicator.failed}</td>
                                      <td className="px-4 py-3 border-b text-right">{indicator.na}</td>
                                      <td className="px-4 py-3 border-b text-right">{indicator.total}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">No indicators available for this criteria.</div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">LGU Overview</div>
        </div>
        <div className="rounded border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 border-b font-medium">Province</th>
                <th className="text-left px-4 py-3 border-b font-medium">LGU</th>
                <th className="text-left px-4 py-3 border-b font-medium">Type</th>
                <th className="text-right px-4 py-3 border-b font-medium">Met</th>
                <th className="text-right px-4 py-3 border-b font-medium">Failed</th>
                <th className="text-right px-4 py-3 border-b font-medium">Consideration</th>
                <th className="text-left px-4 py-3 border-b font-medium">Status</th>
                {criteriaFocusKey !== '__all__' && (
                  <th className="text-left px-4 py-3 border-b font-medium">Criteria Status</th>
                )}
                <th className="text-left px-4 py-3 border-b font-medium">Failed Criteria</th>
                <th className="text-left px-4 py-3 border-b font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 400).map((r, idx) => (
                <tr key={`${r.province}-${r.lgu}-${idx}`} className={idx % 2 ? 'bg-zinc-50' : 'bg-white'}>
                  <td className="px-4 py-3 border-b">{r.province}</td>
                  <td className="px-4 py-3 border-b">{r.lgu}</td>
                  <td className="px-4 py-3 border-b">{r.type || '-'}</td>
                  <td className="px-4 py-3 border-b text-right">{r.metCount}/{criteriaCount}</td>
                  <td className="px-4 py-3 border-b text-right">{r.failedCount}</td>
                  <td className="px-4 py-3 border-b text-right">{r.considerationCount}</td>
                  <td className="px-4 py-3 border-b">
                    <StatusPill status={r.overall} />
                  </td>
                  {criteriaFocusKey !== '__all__' && (
                    <td className="px-4 py-3 border-b">
                      <StatusPill status={r.statuses[criteriaFocusKey] || null} />
                    </td>
                  )}
                  <td className="px-4 py-3 border-b">{r.failedCriteria.length ? r.failedCriteria.join(', ') : '-'}</td>
                  <td className="px-4 py-3 border-b">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => { void exportScorecard(r) }}
                      aria-label="Open scorecard"
                      title="Open scorecard"
                    >
                      <ExternalLink />
                      <span className="sr-only">Open scorecard</span>
                    </Button>
                  </td>
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
})
SglgOverview.displayName = 'SglgOverview'

function StatusPill({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-muted-foreground">-</span>
  const label = STATUS_LABELS[status] || status
  const color = status === 'failed' ? 'bg-rose-100 text-rose-800 border-rose-200'
    : status === 'met' ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : status === 'consideration' ? 'bg-amber-100 text-amber-800 border-amber-200'
    : 'bg-slate-100 text-slate-700 border-slate-200'
  return <span className={`px-2 py-0.5 rounded border text-xs ${color}`}>{label}</span>
}
