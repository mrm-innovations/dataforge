import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { store, bandsArrayFor, classifyBandFor, bandLabelForKey, fmt, statusToNum } from '@/lib/store'
import type { Official } from '@/components/LocalOfficialsView'
import type { FieldOfficer } from '@/components/FieldOfficersView'
import { Download } from 'lucide-react'

type IndicatorEntry = {
  key: string
  label: string
  status: string
}

type ScenarioRow = {
  province: string
  lgu: string
  lce: string
  fieldOfficer: string
  type: string
  incomeClass: string
}

const AUDIT_STATUS_OPTIONS = [
  { value: '__all__', label: 'All statuses' },
  { value: 'pass', label: 'Passer' },
  { value: 'fail', label: 'Non-Passer' },
]

function unique<T>(arr: T[]) {
  return Array.from(new Set(arr))
}

function latestYearFor(auditKey: string) {
  const years = (store.AUDITS?.[auditKey]?.years || []) as number[]
  if (!years.length) return null
  return years.slice().sort((a, b) => b - a)[0] ?? null
}

function bandOptionsFor(auditKey: string) {
  const arr = bandsArrayFor(auditKey)
  if (arr && arr.length) {
    return arr.map((band) => ({
      value: band.key,
      label: bandLabelForKey(auditKey, band.key),
    }))
  }
  return ['elite', 'compliant', 'near', 'below'].map((key) => ({
    value: key,
    label: bandLabelForKey(auditKey, key),
  }))
}

function normalizeName(s: string) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s*\([^\)]*\)/g, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\(capital\)/g, '')
    .replace(/^city of\s+/, '')
    .replace(/[^a-z0-9]+/g, '')
}

function sglgKey(province: string, lgu: string) {
  return `${normalizeName(province)}|${normalizeName(lgu)}`
}

function normalizeCityName(lgu: string) {
  return normalizeName(lgu).replace(/city$/, '')
}

function sglgCityKey(province: string, lgu: string) {
  return `${normalizeName(province)}|${normalizeCityName(lgu)}`
}

function fixMojibake(value: string | null | undefined) {
  const text = String(value || '')
  if (!/[\u00C2\u00C3\u00E2]/.test(text)) return text
  try {
    return new TextDecoder('utf-8').decode(Uint8Array.from(text, (ch) => ch.charCodeAt(0)))
  } catch {
    return text
  }
}

function toTitleCase(value: string | null | undefined) {
  const lower = fixMojibake(value).toLowerCase()
  return lower.replace(/(^|[\s\-'])(\p{L})/gu, (_match, sep, letter) => `${sep}${letter.toUpperCase()}`)
}

function formatLastName(value: string | null | undefined) {
  const base = toTitleCase(fixMojibake(value) || '')
  const tokens = base.split(/\s+/)
  const roman = /^[IVXLCDM]+\.?$/i
  return tokens
    .map((token) => (roman.test(token.replace(/\./g, '')) ? token.toUpperCase() : token))
    .join(' ')
}

function splitSuffix(firstName: string | null | undefined) {
  const trimmed = (firstName || '').trim()
  const jrPattern = /(,?\s*jr\.?)$/i
  if (jrPattern.test(trimmed)) {
    return { base: trimmed.replace(jrPattern, '').trim(), suffix: 'Jr.' }
  }
  return { base: trimmed, suffix: '' }
}

function formatMiddleInitial(value: string | null | undefined) {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  const sanitized = trimmed.replace(/\.+$/, '')
  return `${sanitized}.`
}

function formatOfficialName(official: Official) {
  const { base, suffix } = splitSuffix(fixMojibake(official.first_name))
  const parts = [toTitleCase(base)]
  const middle = formatMiddleInitial(fixMojibake(official.middle_initial))
  if (middle) parts.push(middle)
  parts.push(formatLastName(fixMojibake(official.last_name)))
  const name = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  return suffix ? `${name} ${suffix}` : name
}

type ScenarioBuilderProps = {
  officials?: Official[] | null
  fieldOfficers?: FieldOfficer[] | null
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

function TogglePill({ enabled, onChange }: { enabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${enabled ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600'}`}
      onClick={() => onChange(!enabled)}
    >
      {enabled ? 'ON' : 'OFF'}
    </button>
  )
}

export function ScenarioBuilder({ officials, fieldOfficers }: ScenarioBuilderProps) {
  const [matchMode, setMatchMode] = useState<'all' | 'any'>('all')
  const [useSglg, setUseSglg] = useState(true)
  const [useAdac, setUseAdac] = useState(true)
  const officialsList = officials || []
  const fieldOfficersList = fieldOfficers || []
  const criteriaYears = useMemo(
    () => unique(store.SGLG_CRITERIA.map((c) => c.year)).sort((a, b) => b - a),
    [store.SGLG_CRITERIA],
  )
  const sglgYear = criteriaYears[0] ?? null

  const criteriaForYear = useMemo(
    () => store.SGLG_CRITERIA.filter((c) => c.year === sglgYear),
    [sglgYear, store.SGLG_CRITERIA],
  )
  const [criteriaKey, setCriteriaKey] = useState<string>(criteriaForYear[0]?.key || '')
  useEffect(() => {
    if (!criteriaForYear.length) {
      setCriteriaKey('')
      return
    }
    if (!criteriaForYear.some((c) => c.key === criteriaKey)) {
      setCriteriaKey(criteriaForYear[0].key)
    }
  }, [criteriaForYear, criteriaKey])

  const criteriaLabelMap = useMemo(() => {
    const map = new Map<string, string>()
    criteriaForYear.forEach((c) => map.set(c.key, c.label || c.key || ''))
    return map
  }, [criteriaForYear])

  const lceMap = useMemo(() => {
    const map = new Map<string, string[]>()
    const positions = new Set(['governor', 'city mayor', 'municipal mayor'])
    officialsList.forEach((official) => {
      const position = (official.position || '').trim().toLowerCase()
      if (!positions.has(position)) return
      const key = sglgKey(official.province || '', official.lgu || '')
      const name = formatOfficialName(official)
      if (!key || !name) return
      const list = map.get(key) || []
      if (!list.includes(name)) list.push(name)
      map.set(key, list)
    })
    const joined = new Map<string, string>()
    map.forEach((names, key) => joined.set(key, names.join(', ')))
    return joined
  }, [officialsList])

  const mlgooMap = useMemo(() => {
    const map = new Map<string, string[]>()
    const target = new Set(['mlgoo', 'clgoo'])
    fieldOfficersList.forEach((officer) => {
      const designation = (officer.designation || '').trim().toLowerCase()
      if (!target.has(designation)) return
      const key = sglgKey(officer.province || '', officer.assignment || '')
      const name = String(officer.name || '').trim()
      if (!key || !name) return
      const list = map.get(key) || []
      if (!list.includes(name)) list.push(name)
      map.set(key, list)
    })
    const joined = new Map<string, string>()
    map.forEach((names, key) => joined.set(key, names.join(', ')))
    return joined
  }, [fieldOfficersList])

  const provincialDirectorMap = useMemo(() => {
    const map = new Map<string, string[]>()
    fieldOfficersList.forEach((officer) => {
      const designation = (officer.designation || '').trim().toLowerCase()
      if (designation !== 'provincial director') return
      const provinceKey = normalizeName(officer.province || '')
      const name = String(officer.name || '').trim()
      if (!provinceKey || !name) return
      const list = map.get(provinceKey) || []
      if (!list.includes(name)) list.push(name)
      map.set(provinceKey, list)
    })
    const joined = new Map<string, string>()
    map.forEach((names, key) => joined.set(key, names.join(', ')))
    return joined
  }, [fieldOfficersList])

  const cityDirectorMap = useMemo(() => {
    const map = new Map<string, string[]>()
    fieldOfficersList.forEach((officer) => {
      const designation = (officer.designation || '').trim().toLowerCase()
      if (designation !== 'city director') return
      const key = sglgCityKey(officer.province || '', officer.assignment || '')
      const name = String(officer.name || '').trim()
      if (!key || !name) return
      const list = map.get(key) || []
      if (!list.includes(name)) list.push(name)
      map.set(key, list)
    })
    const joined = new Map<string, string>()
    map.forEach((names, key) => joined.set(key, names.join(', ')))
    return joined
  }, [fieldOfficersList])

  const indicatorOptions = useMemo(() => {
    if (!sglgYear || !criteriaKey) return [] as Array<{ key: string; label: string }>
    const dataKey = `${sglgYear}:${criteriaKey}`
    const records = store.SGLG_CRITERIA_DATA[dataKey] || []
    const map = new Map<string, string>()
    records.forEach((rec: any) => {
      const indicators = Array.isArray(rec?.indicators) ? rec.indicators : []
      indicators.forEach((indicator: any) => {
        const key = String(indicator?.key || '').trim()
        if (!key || map.has(key)) return
        map.set(key, String(indicator?.label || key).trim())
      })
    })
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }))
  }, [sglgYear, criteriaKey, store.SGLG_CRITERIA_DATA])

  const [indicatorKey, setIndicatorKey] = useState<string>(indicatorOptions[0]?.key || '')
  useEffect(() => {
    if (!indicatorOptions.length) {
      setIndicatorKey('')
      return
    }
    if (!indicatorOptions.some((opt) => opt.key === indicatorKey)) {
      setIndicatorKey(indicatorOptions[0].key)
    }
  }, [indicatorOptions, indicatorKey])

  const [indicatorStatus, setIndicatorStatus] = useState<string>('__all__')
  const [adacBand, setAdacBand] = useState<string>('__all__')
  const [lcpcBand, setLcpcBand] = useState<string>('__all__')
  const [pocBand, setPocBand] = useState<string>('__all__')
  const [cflgaStatus, setCflgaStatus] = useState<string>('__all__')
  const [sglgOverallStatus, setSglgOverallStatus] = useState<string>('__all__')

  const [useLcpc, setUseLcpc] = useState(true)
  const [usePoc, setUsePoc] = useState(true)
  const [useCflga, setUseCflga] = useState(true)
  const [useSglgOverall, setUseSglgOverall] = useState(true)

  const adacYear = useMemo(() => latestYearFor('ADAC'), [store.AUDITS])
  const lcpcYear = useMemo(() => latestYearFor('LCPC'), [store.AUDITS])
  const pocYear = useMemo(() => latestYearFor('POC'), [store.AUDITS])
  const cflgaYear = useMemo(() => latestYearFor('CFLGA'), [store.AUDITS])
  const sglgOverallYear = useMemo(() => latestYearFor('SGLG'), [store.AUDITS])

  const adacBandOptions = useMemo(
    () => [{ value: '__all__', label: 'All bands' }, ...bandOptionsFor('ADAC')],
    [store.AUDITS],
  )
  const lcpcBandOptions = useMemo(
    () => [{ value: '__all__', label: 'All bands' }, ...bandOptionsFor('LCPC')],
    [store.AUDITS],
  )
  const pocBandOptions = useMemo(
    () => [{ value: '__all__', label: 'All bands' }, ...bandOptionsFor('POC')],
    [store.AUDITS],
  )

  const provinces = useMemo(
    () => unique(store.LGUS.map((g) => g.province).filter(Boolean)).sort(),
    [store.LGUS],
  )
  const types = useMemo(
    () => unique(store.LGUS.map((g) => g.type).filter(Boolean)).sort(),
    [store.LGUS],
  )
  const [provinceFilter, setProvinceFilter] = useState('__all__')
  const [typeFilter, setTypeFilter] = useState('__all__')
  const [search, setSearch] = useState('')

  const indicatorMap = useMemo(() => {
    const map = new Map<string, IndicatorEntry>()
    if (!sglgYear || !criteriaKey || !indicatorKey) return map
    const dataKey = `${sglgYear}:${criteriaKey}`
    const records = store.SGLG_CRITERIA_DATA[dataKey] || []
    records.forEach((rec: any) => {
      const province = String(rec?.province || '').trim()
      const lgu = String(rec?.lgu || '').trim()
      if (!province || !lgu) return
      const indicators = Array.isArray(rec?.indicators) ? rec.indicators : []
      const indicator = indicators.find((i: any) => String(i?.key || '').trim() === indicatorKey)
      if (!indicator) return
      const status = resolveIndicatorStatus(indicator)
      map.set(sglgKey(province, lgu), {
        key: indicatorKey,
        label: String(indicator?.label || indicatorKey).trim(),
        status,
      })
    })
    return map
  }, [sglgYear, criteriaKey, indicatorKey, store.SGLG_CRITERIA_DATA])

  const results = useMemo(() => {
    const rows: ScenarioRow[] = []
    if (useSglg && !indicatorKey) return rows
    const q = search.trim().toLowerCase()
    store.LGUS.forEach((g) => {
      if (provinceFilter !== '__all__' && g.province !== provinceFilter) return
      if (typeFilter !== '__all__' && g.type !== typeFilter) return
      if (q) {
        const hay = `${g.province || ''} ${g.lgu || ''} ${g.type || ''}`.toLowerCase()
        if (!hay.includes(q)) return
      }
      const typeValue = String(g.type || '').trim().toLowerCase()
      const isProvince = typeValue === 'province'
      const isHuc = typeValue === 'highly urbanized city'
      const key = sglgKey(g.province || '', g.lgu || '')
      const indicator = indicatorMap.get(key)
      const indicatorStatusValue = indicator?.status || (isProvince ? 'na' : null)
      const sglgMatch = indicatorStatusValue
        ? (indicatorStatus === '__all__' || indicatorStatusValue === indicatorStatus)
        : false

      const bandMatchFor = (auditKey: string, year: number | null, bandValue: string, allowMissing: boolean) => {
        if (year == null) return allowMissing && bandValue === '__all__'
        const raw = (g.results?.[auditKey] || {})[String(year)]
        const n = Number(raw)
        const value = Number.isFinite(n) ? n : null
        if (bandValue === '__all__') return allowMissing ? true : value != null
        const bandKey = value == null ? null : (classifyBandFor(auditKey, value) as string | null)
        return !!bandKey && bandKey === bandValue
      }

      const statusMatchFor = (auditKey: string, year: number | null, statusValue: string, allowMissing: boolean) => {
        if (year == null) return allowMissing && statusValue === '__all__'
        const raw = (g.results?.[auditKey] || {})[String(year)]
        const statusNum = statusToNum(raw)
        if (statusValue === '__all__') return allowMissing ? true : statusNum != null
        if (statusNum == null) return false
        const normalized = statusNum === 1 ? 'pass' : 'fail'
        return normalized === statusValue
      }

      const adacMatch = bandMatchFor('ADAC', adacYear, adacBand, isProvince)
      const lcpcMatch = bandMatchFor('LCPC', lcpcYear, lcpcBand, isProvince)
      const pocMatch = bandMatchFor('POC', pocYear, pocBand, isProvince)
      const cflgaMatch = statusMatchFor('CFLGA', cflgaYear, cflgaStatus, isProvince)
      const sglgOverallMatch = statusMatchFor('SGLG', sglgOverallYear, sglgOverallStatus, isProvince)

      const checks: boolean[] = []
      if (useSglg) checks.push(sglgMatch)
      if (useAdac) checks.push(adacMatch)
      if (useLcpc) checks.push(lcpcMatch)
      if (usePoc) checks.push(pocMatch)
      if (useCflga) checks.push(cflgaMatch)
      if (useSglgOverall) checks.push(sglgOverallMatch)

      const passes = checks.length
        ? (matchMode === 'all' ? checks.every(Boolean) : checks.some(Boolean))
        : true
      if (!passes) return

      const lceName = lceMap.get(key) || ''
      const mlgooName = mlgooMap.get(key) || ''
      const provinceKey = normalizeName(g.province || '')
      const provincialDirectorName = isProvince ? (provincialDirectorMap.get(provinceKey) || '') : ''
      const cityDirectorKey = isHuc ? sglgCityKey(g.province || '', g.lgu || '') : ''
      const cityDirectorName = isHuc ? (cityDirectorMap.get(cityDirectorKey) || '') : ''
      const fieldOfficerName = isProvince ? provincialDirectorName : (isHuc ? cityDirectorName : mlgooName)

      rows.push({
        province: g.province || '',
        lgu: g.lgu || '',
        lce: lceName,
        fieldOfficer: fieldOfficerName,
        type: g.type || '',
        incomeClass: g.income_class || '',
      })
    })
    return rows
  }, [
    indicatorKey,
    indicatorMap,
    indicatorStatus,
    adacBand,
    lcpcBand,
    pocBand,
    cflgaStatus,
    adacYear,
    lcpcYear,
    pocYear,
    cflgaYear,
    sglgOverallYear,
    lceMap,
    mlgooMap,
    provincialDirectorMap,
    cityDirectorMap,
    provinceFilter,
    typeFilter,
    search,
    store.LGUS,
    matchMode,
    useSglg,
    useAdac,
    useLcpc,
    usePoc,
    useCflga,
    useSglgOverall,
  ])

  const statusOptions = [
    { value: '__all__', label: 'All statuses' },
    { value: 'failed', label: 'Failed' },
    { value: 'consideration', label: 'Consideration' },
    { value: 'met', label: 'Met' },
    { value: 'na', label: 'N/A' },
  ]

  const resetFilters = () => {
    setProvinceFilter('__all__')
    setTypeFilter('__all__')
    setSearch('')
    setIndicatorStatus('__all__')
    setAdacBand('__all__')
    setLcpcBand('__all__')
    setPocBand('__all__')
    setCflgaStatus('__all__')
    setSglgOverallStatus('__all__')
  }

  const exportCsv = () => {
    const headers = [
      'Province',
      'LGU',
      'Type',
      'Income Class',
      'Current LCE',
      'Current Field Officer',
    ]
    const lines = [headers.map((h) => `"${h}"`).join(',')]
    results.forEach((row) => {
      const values = [
        row.province,
        row.lgu,
        row.type,
        row.incomeClass,
        row.lce,
        row.fieldOfficer,
      ]
      lines.push(values.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    })
    const csv = lines.join('\n') + '\n'
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scenario_results_${Date.now()}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  if (!criteriaYears.length) {
    return <div className="text-sm text-muted-foreground">No SGLG criteria datasets loaded.</div>
  }

  const criteriaLabel = criteriaLabelMap.get(criteriaKey) || criteriaKey
  const indicatorLabel = indicatorOptions.find((opt) => opt.key === indicatorKey)?.label || indicatorKey
  const indicatorStatusLabel = statusOptions.find((opt) => opt.value === indicatorStatus)?.label || 'All statuses'
  const adacBandLabel = adacBand === '__all__' ? 'any band' : bandLabelForKey('ADAC', adacBand)
  const lcpcBandLabel = lcpcBand === '__all__' ? 'any band' : bandLabelForKey('LCPC', lcpcBand)
  const pocBandLabel = pocBand === '__all__' ? 'any band' : bandLabelForKey('POC', pocBand)
  const cflgaStatusLabel = AUDIT_STATUS_OPTIONS.find((opt) => opt.value === cflgaStatus)?.label || 'Any status'
  const sglgOverallLabel = AUDIT_STATUS_OPTIONS.find((opt) => opt.value === sglgOverallStatus)?.label || 'Any status'
  const pillBase = 'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium'
  const pillMuted = 'bg-zinc-100 text-zinc-500 border-zinc-200'

  return (
    <section className="rounded-xl border p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium">Scenario Builder</h2>
          <div className="text-xs text-muted-foreground">
            Toggle conditions on/off and match all or any of the active blocks.
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Match</span>
          <div className="inline-flex rounded-full border overflow-hidden">
            <button
              type="button"
              className={`px-3 py-1 ${matchMode === 'all' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700'}`}
              onClick={() => setMatchMode('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`px-3 py-1 ${matchMode === 'any' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700'}`}
              onClick={() => setMatchMode('any')}
            >
              Any
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Seal of Good Local Governance (SGLG) Indicator</div>
            <TogglePill enabled={useSglg} onChange={setUseSglg} />
          </div>
          <div className={`grid gap-3 md:grid-cols-3 ${!useSglg ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Criteria</Label>
              <Select value={criteriaKey} onValueChange={(v) => setCriteriaKey(v)}>
                <SelectTrigger><SelectValue placeholder="Select criteria" /></SelectTrigger>
                <SelectContent>
                  {criteriaForYear.map((c) => {
                    const label = c.label || c.key || ''
                    return (
                      <SelectItem key={c.key} value={c.key}>{label}</SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Indicator</Label>
              <Select value={indicatorKey} onValueChange={(v) => setIndicatorKey(v)}>
                <SelectTrigger><SelectValue placeholder="Select indicator" /></SelectTrigger>
                <SelectContent>
                  {indicatorOptions.map((opt) => (<SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Status</Label>
              <Select value={indicatorStatus} onValueChange={(v) => setIndicatorStatus(v)}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Seal of Good Local Governance (SGLG) Overall Status</div>
            <TogglePill enabled={useSglgOverall} onChange={setUseSglgOverall} />
          </div>
          <div className={`grid gap-3 ${!useSglgOverall ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Status</Label>
              <Select value={sglgOverallStatus} onValueChange={(v) => setSglgOverallStatus(v)}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  {AUDIT_STATUS_OPTIONS.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Anti-Drug Abuse Council (ADAC) Performance Audit</div>
            <TogglePill enabled={useAdac} onChange={setUseAdac} />
          </div>
          <div className={`grid gap-3 ${!useAdac ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Band</Label>
              <Select value={adacBand} onValueChange={(v) => setAdacBand(v)}>
                <SelectTrigger><SelectValue placeholder="All bands" /></SelectTrigger>
                <SelectContent>
                  {adacBandOptions.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Local Council for the Protection of Children (LCPC) Functionality Assessment</div>
            <TogglePill enabled={useLcpc} onChange={setUseLcpc} />
          </div>
          <div className={`grid gap-3 ${!useLcpc ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Band</Label>
              <Select value={lcpcBand} onValueChange={(v) => setLcpcBand(v)}>
                <SelectTrigger><SelectValue placeholder="All bands" /></SelectTrigger>
                <SelectContent>
                  {lcpcBandOptions.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Peace and Order Council (POC) Performance Audit</div>
            <TogglePill enabled={usePoc} onChange={setUsePoc} />
          </div>
          <div className={`grid gap-3 ${!usePoc ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Band</Label>
              <Select value={pocBand} onValueChange={(v) => setPocBand(v)}>
                <SelectTrigger><SelectValue placeholder="All bands" /></SelectTrigger>
                <SelectContent>
                  {pocBandOptions.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Child-Friendly Local Governance Audit (CFLGA)</div>
            <TogglePill enabled={useCflga} onChange={setUseCflga} />
          </div>
          <div className={`grid gap-3 ${!useCflga ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Status</Label>
              <Select value={cflgaStatus} onValueChange={(v) => setCflgaStatus(v)}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  {AUDIT_STATUS_OPTIONS.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
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
          <Label className="text-xs">Search</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search LGU or province" />
        </div>
        <div className="flex items-end gap-2">
          <Button variant="outline" size="sm" onClick={resetFilters}>Reset filters</Button>
          <Button size="sm" onClick={exportCsv} disabled={!results.length}>
            <Download className="h-4 w-4 mr-2" /> CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Scenario</span>
        <span className={`${pillBase} ${useSglg ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : pillMuted}`}>
          {useSglg ? `SGLG ${criteriaLabel || 'Criteria'} > ${indicatorLabel || 'Indicator'} (${indicatorStatusLabel})` : 'SGLG off'}
        </span>
        <span className={`${pillBase} ${useSglgOverall ? 'bg-sky-50 text-sky-700 border-sky-200' : pillMuted}`}>
          {useSglgOverall ? `SGLG Overall ${sglgOverallYear ?? ''} (${sglgOverallLabel})` : 'SGLG overall off'}
        </span>
        <span className={`${pillBase} ${useAdac ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : pillMuted}`}>
          {useAdac ? `ADAC ${adacYear ?? ''} (${adacBandLabel})` : 'ADAC off'}
        </span>
        <span className={`${pillBase} ${useLcpc ? 'bg-amber-50 text-amber-700 border-amber-200' : pillMuted}`}>
          {useLcpc ? `LCPC ${lcpcYear ?? ''} (${lcpcBandLabel})` : 'LCPC off'}
        </span>
        <span className={`${pillBase} ${usePoc ? 'bg-orange-50 text-orange-700 border-orange-200' : pillMuted}`}>
          {usePoc ? `POC ${pocYear ?? ''} (${pocBandLabel})` : 'POC off'}
        </span>
        <span className={`${pillBase} ${useCflga ? 'bg-rose-50 text-rose-700 border-rose-200' : pillMuted}`}>
          {useCflga ? `CFLGA ${cflgaYear ?? ''} (${cflgaStatusLabel})` : 'CFLGA off'}
        </span>
      </div>

      <div className="rounded border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left p-2 border-b font-medium">Province</th>
              <th className="text-left p-2 border-b font-medium">LGU</th>
              <th className="text-left p-2 border-b font-medium">Type</th>
              <th className="text-left p-2 border-b font-medium">Income Class</th>
              <th className="text-left p-2 border-b font-medium">Current LCE</th>
              <th className="text-left p-2 border-b font-medium">Current Field Officer</th>
            </tr>
          </thead>
          <tbody>
            {results.map((row, idx) => {
              return (
                <tr key={`${row.province}-${row.lgu}-${idx}`} className={idx % 2 ? 'bg-zinc-50' : 'bg-white'}>
                  <td className="p-2 border-b">{row.province}</td>
                  <td className="p-2 border-b">{row.lgu}</td>
                  <td className="p-2 border-b">{row.type}</td>
                  <td className="p-2 border-b">{row.incomeClass || '-'}</td>
                  <td className="p-2 border-b">{row.lce || '-'}</td>
                  <td className="p-2 border-b">{row.fieldOfficer || '-'}</td>
                </tr>
              )
            })}
            {!results.length && (
              <tr>
                <td className="p-3 text-sm text-muted-foreground" colSpan={6}>
                  No LGUs matched the current scenario.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
