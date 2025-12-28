import React, { useEffect, useMemo, useState } from 'react'
import { store } from '@/lib/store'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

type CriteriaInfo = { key: string; label: string; year: number }

const STATUS_LABELS: Record<string, string> = {
  met: 'Met',
  failed: 'Failed',
  consideration: 'Consideration',
  na: 'N/A',
}

function unique<T>(arr: T[]) {
  return Array.from(new Set(arr))
}

export function SglgCriteriaTab() {
  const criteriaList = store.SGLG_CRITERIA
  const years = unique(criteriaList.map((c) => c.year)).sort((a, b) => b - a)
  const [year, setYear] = useState<number | null>(years[0] ?? null)
  const criteriaForYear = useMemo(() => criteriaList.filter((c) => c.year === year), [criteriaList, year])
  const criteriaOptions = useMemo(
    () => criteriaForYear.filter((c) => c.key && c.label),
    [criteriaForYear],
  )
  const [criteriaKey, setCriteriaKey] = useState<string>(criteriaOptions[0]?.key || '')

  // Keep year/criteria in sync with loaded criteria list
  useEffect(() => {
    if (!criteriaList.length) return
    const latestYear = years[0]
    if (year == null || !years.includes(year)) setYear(latestYear)
    const forYear = criteriaList.filter((c) => c.year === (year ?? latestYear)).filter((c) => c.key && c.label)
    if (forYear.length) {
      if (!criteriaKey || !forYear.some((c) => c.key === criteriaKey)) {
        setCriteriaKey(forYear[0].key)
      }
    }
  }, [criteriaList, years, year, criteriaKey])
  const dataKey = year && criteriaKey ? `${year}:${criteriaKey}` : ''
  const records = dataKey ? store.SGLG_CRITERIA_DATA[dataKey] || [] : []

  const provinces = useMemo(() => unique(records.map((r) => r.province).filter(Boolean)).sort(), [records])
  const types = useMemo(() => unique(records.map((r) => (r.type || '').trim()).filter(Boolean)).sort(), [records])
  const allIndicators = useMemo(() => {
    const keys = new Map<string, string>()
    records.forEach((r) => (r.indicators || []).forEach((i) => {
      const k = (i.key || '').trim()
      const lbl = (i.label || '').trim()
      if (k && lbl) keys.set(k, lbl)
    }))
    return Array.from(keys.entries()).map(([key, label]) => ({ key, label }))
  }, [records])

  const [provinceFilter, setProvinceFilter] = useState<string>('__all__')
  const [typeFilter, setTypeFilter] = useState<string>('__all__')
  const indicatorOptions = useMemo(() => allIndicators.filter((i) => i.key && i.label), [allIndicators])
  const [indicatorKey, setIndicatorKey] = useState<string>(indicatorOptions[0]?.key || '')
  useEffect(() => {
    if (indicatorOptions.length && (!indicatorKey || !indicatorOptions.some((i) => i.key === indicatorKey))) {
      setIndicatorKey(indicatorOptions[0].key)
    }
  }, [indicatorOptions, indicatorKey])
  const [statusFilter, setStatusFilter] = useState<string>('__all__')

  const filtered = useMemo(() => {
    return records
      .map((r) => {
        const indicator = (r.indicators || []).find((i) => i.key === indicatorKey)
        return indicator ? { ...r, indicator } : null
      })
      .filter((r): r is any => !!r)
      .filter((r) => (provinceFilter === '__all__' ? true : r.province === provinceFilter))
      .filter((r) => (typeFilter === '__all__' ? true : (r.type || '').trim() === typeFilter))
      .filter((r) => {
        if (statusFilter === '__all__') return true
        return (r.indicator.status || '') === statusFilter
      })
  }, [records, indicatorKey, provinceFilter, typeFilter, statusFilter])

  const downloadCsv = () => {
    const lines = [
      ['Province', 'LGU', 'Type', 'Criteria', 'Indicator', 'Value', 'Status']
        .map((s) => `"${s}"`)
        .join(','),
    ]
    filtered.forEach((r) => {
      const val = r.indicator.value
      const status = r.indicator.status || ''
      lines.push(
        [
          r.province,
          r.lgu,
          r.type || '',
          criteriaKey,
          r.indicator.label,
          val == null ? '' : val,
          status,
        ]
          .map((s) => `"${String(s).replace(/"/g, '""')}"`)
          .join(','),
      )
    })
    const csv = lines.join('\n') + '\n'
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${criteriaKey || 'sglg'}_${year || ''}_${indicatorKey || 'indicator'}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  if (!year || !criteriaList.length) {
    return <div className="text-sm text-muted-foreground">No SGLG criteria datasets loaded.</div>
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-6">
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
          <Label className="text-xs">Criteria</Label>
          <Select value={criteriaKey} onValueChange={(v) => setCriteriaKey(v)}>
            <SelectTrigger className="w-full justify-between text-left"><SelectValue placeholder="Select criteria" /></SelectTrigger>
            <SelectContent>
              {criteriaOptions.map((c) => (<SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Indicator</Label>
          <Select value={indicatorKey} onValueChange={(v) => setIndicatorKey(v)}>
            <SelectTrigger className="w-full justify-between text-left"><SelectValue placeholder="Select indicator" /></SelectTrigger>
            <SelectContent>
              {indicatorOptions.map((i) => (<SelectItem key={i.key} value={i.key}>{i.label}</SelectItem>))}
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
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
            <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="consideration">Consideration</SelectItem>
              <SelectItem value="met">Met</SelectItem>
              <SelectItem value="na">N/A</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => { setProvinceFilter('__all__'); setTypeFilter('__all__'); setStatusFilter('__all__') }}>Reset filters</Button>
        <Button size="sm" onClick={downloadCsv}><Download className="h-4 w-4 mr-2" /> CSV</Button>
        <div className="text-xs text-muted-foreground">{filtered.length} LGUs</div>
      </div>

      <div className="rounded border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left p-2 border-b font-medium">Province</th>
              <th className="text-left p-2 border-b font-medium">LGU</th>
              <th className="text-left p-2 border-b font-medium">Type</th>
              <th className="text-left p-2 border-b font-medium">Indicator</th>
              <th className="text-left p-2 border-b font-medium">Value</th>
              <th className="text-left p-2 border-b font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 400).map((r, idx) => (
              <tr key={`${r.lgu}-${r.province}-${idx}`} className={idx % 2 ? 'bg-zinc-50' : 'bg-white'}>
                <td className="p-2 border-b">{r.province}</td>
                <td className="p-2 border-b">{r.lgu}</td>
                <td className="p-2 border-b">{r.type || '-'}</td>
                <td className="p-2 border-b">{r.indicator.label}</td>
                <td className="p-2 border-b">{r.indicator.value ?? '-'}</td>
                <td className="p-2 border-b">
                  <StatusPill status={r.indicator.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
  return <span className={`px-2 py-0.5 rounded border text-xs ${color}`}>{label}</span>
}
