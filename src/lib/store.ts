import type { Canon } from './types'

export type State = {
  audit: string
  region: string
  province: string
  lgu: string
  type: string
  startYear: number | null
  endYear: number | null
}

export type Row = {
  region: string
  province: string
  lgu: string
  type: string
  psgc?: string
  income_class?: string
  population: number | null
} & Record<string, number | string | null>

export const store = {
  CANON: null as Canon | null,
  LGUS: [] as Canon['lgus'],
  AUDITS: {} as Record<string, any>,
  YEARS: [] as number[],
  rawRows: [] as Row[],
  totals: { population: 0, provinces: 0, hucs: 0, lgus: 0 },
  state: { audit: 'ADAC', region: '', province: '', lgu: '', type: '', startYear: null, endYear: null } as State,
}

export const metricIsStatus = () => store.AUDITS[store.state.audit]?.metric === 'status'
// Treat any audit with high/moderate functional thresholds as a 3-band score audit (ADAC-like)
export const isADAC = () => {
  const meta = store.AUDITS[store.state.audit] || {}
  return String(store.state.audit).toUpperCase() === 'ADAC' || !!(meta?.bands?.high_functional)
}
export const isLCPC = () => String(store.state.audit).toUpperCase() === 'LCPC'

// Per-audit variants (used by components that render other audits in tabs)
export const metricIsStatusFor = (auditKey: string) => store.AUDITS[auditKey]?.metric === 'status'
export const isADACFor = (auditKey: string) => String(auditKey).toUpperCase() === 'ADAC'
export const isLCPCFor = (auditKey: string) => String(auditKey).toUpperCase() === 'LCPC'

export const fmt = (n: number | null | undefined, d = 1) =>
  n == null || Number.isNaN(n as number) ? '-' : (+n!).toFixed(d).replace(/\.0+$/, '')

export const avg = (arr: Array<number | null | undefined>) => {
  const v = arr.filter((x): x is number => x != null && Number.isFinite(+x))
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

export async function loadCanon() {
  const base = (import.meta as any).env?.BASE_URL ?? '/'
  const dir = `${location.pathname.replace(/\/[^/]*$/, '/') || '/'}`
  const candidates = [
    // Vite copies files from /public to the build root; prefer this path
    `${base}lg-audits.json`,
    // Fallbacks for non-standard hosting or local file serving
    `${dir}lg-audits.json`,
    `/lg-audits.json`,
  ]
  let canon: Canon | null = null
  let lastStatus: number | null = null
  for (const url of candidates){
    try {
      const resp = await fetch(url, { cache: 'no-store' })
      lastStatus = resp.status
      if (resp.ok) { canon = (await resp.json()) as Canon; break }
    } catch {}
  }
  if (!canon) throw new Error(`Failed to load lg-audits.json (${lastStatus ?? 'network'})`)
  // Optionally merge POC dataset if available
  try {
    const pocUrl = `${base}poc.json`
    const r = await fetch(pocUrl, { cache: 'no-store' })
    if (r.ok) {
      const poc = await r.json()
      mergePOC(canon, poc)
    }
  } catch {}
  store.CANON = canon
  store.LGUS = canon.lgus || []
  store.AUDITS = canon.meta?.audits || {}

  const typeOf = (value: any) => String(value || '').trim().toLowerCase()
  const nonProvince = store.LGUS.filter((g) => typeOf(g.type) !== 'province')
  store.totals.lgus = nonProvince.length
  store.totals.population = nonProvince.reduce((sum, g) => {
    const val = Number(g.population)
    return Number.isFinite(val) ? sum + val : sum
  }, 0)
  const provinceEntries = store.LGUS.filter((g) => typeOf(g.type) === 'province')
  store.totals.provinces = new Set(provinceEntries.map((g) => g.lgu || g.province).filter(Boolean)).size
  const hucEntries = store.LGUS.filter((g) => typeOf(g.type) === 'highly urbanized city')
  store.totals.hucs = new Set(hucEntries.map((g) => g.lgu).filter(Boolean)).size
}

function normalizeName(s: string){
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s*\(capital\)/g,'')
    .replace(/^city of\s+/, '')
    .replace(/[^a-z0-9]+/g, '')
}

function mergePOC(canon: any, pocRows: any[]){
  if (!canon.meta) canon.meta = { audits: {} }
  if (!canon.meta.audits) canon.meta.audits = {}
  if (!canon.meta.audits.POC) {
    canon.meta.audits.POC = {
      years: [2021, 2022, 2023],
      metric: 'score',
      bands: { high_functional: 85, moderate_functional: 50 },
      labels: { band_high: 'High Performing', band_moderate: 'Moderate Performing', band_low: 'Low Performing' },
    }
  }
  const byKey = new Map<string, any>()
  for (const g of canon.lgus || []){
    const k = normalizeName(g.lgu || g.province)
    if (!byKey.has(k)) byKey.set(k, g)
  }
  for (const row of pocRows){
    const prov = row.province || row.Province || ''
    const lgu = row.lgu || row.City || row.Municipality || row["City/Municipality"] || ''
    const key = normalizeName(lgu || prov)
    const rec = byKey.get(key)
    if (!rec) continue
    rec.results = rec.results || {}
    const target = (rec.results.POC = rec.results.POC || {})
    ;['2021','2022','2023'].forEach((y) => {
      const raw = row[y]
      if (raw == null || raw === '') return
      const v = typeof raw === 'number' ? raw : Number(String(raw).replace(/[%\s]+/g,''))
      if (!Number.isNaN(v)) target[y] = v
    })
  }
}

export function setAudit(auditKey: string) {
  const state = store.state
  state.audit = auditKey
  const meta = store.AUDITS[auditKey] || {}
  store.YEARS = (meta.years || []).slice()
  state.startYear = store.YEARS[0] ?? null
  state.endYear = store.YEARS[store.YEARS.length - 1] ?? null

  store.rawRows = store.LGUS.map((g) => {
    const res = g.results?.[auditKey] || {}
    const popVal = Number(g.population)
    const row: Row = {
      region: g.region,
      province: g.province,
      lgu: g.lgu,
      type: g.type,
      psgc: g.psgc,
      income_class: g.income_class || '',
      population: Number.isFinite(popVal) ? popVal : null,
    }
    store.YEARS.forEach((year) => {
      const raw = (res as any)[String(year)] ?? null
      if (metricIsStatus()) {
        row['s' + year] = raw
        const numeric = String(raw ?? '').toLowerCase()
        const val = numeric === 'pass' || numeric === 'passer' || numeric === 'passed' ? 100 : numeric ? 0 : null
        row['y' + year] = val as any
      } else {
        row['y' + year] = raw == null ? null : +raw
      }
    })
    return row
  })
}

export function filterRows(rows = store.rawRows) {
  const s = store.state
  return rows.filter((row) => {
    if (s.region && row.region !== s.region) return false
    if (s.province && row.province !== s.province) return false
    if (s.lgu && row.lgu !== s.lgu) return false
    if (s.type && row.type !== s.type) return false
    return true
  })
}

export function yearsInScope() {
  const { startYear, endYear } = store.state
  return store.YEARS.filter((y) => (startYear == null || y >= startYear) && (endYear == null || y <= endYear))
}

export function statusToNum(status: unknown) {
  if (status == null) return null
  const s = String(status).trim().toLowerCase()
  if (s === 'passer' || s === 'pass' || s === 'passed') return 1
  if (s === 'non-passer' || s === 'nonpasser' || s === 'fail' || s === 'failed') return 0
  return null
}

export function statusShort(status: unknown) {
  const val = statusToNum(status)
  return val == null ? '-' : val === 1 ? 'P' : 'NP'
}

function getAdacBands() {
  const bands = store.AUDITS?.ADAC?.bands || {}
  return { high: bands.high_functional ?? 85, moderate: bands.moderate_functional ?? 50 }
}

import { hsl, HSL } from '@/lib/colors'

export function colorForScore(value: number | null | undefined) {
  if (value == null) return 'transparent'
  if (metricIsStatus()) return value >= 90 ? hsl('green', 0.13) : hsl('red', 0.13)
  if (isADAC()) {
    const { high, moderate } = getAdacBands()
    if (value >= high) return hsl('green', 0.13)
    if (value >= moderate) return hsl('amber', 0.13)
    return hsl('red', 0.13)
  }
  if (isLCPC()) {
    if (value >= 80) return hsl('green', 0.13) // Ideal
    if (value >= 50) return hsl('amber', 0.13) // Mature
    if (value >= 20) return hsl('orange', 0.13) // Progressive
    return hsl('red', 0.13) // Basic
  }
  const bands = store.AUDITS[store.state.audit]?.bands || { elite: 95, compliant: 90, near: 80 }
  if (value >= bands.elite) return hsl('emerald', 0.13)
  if (value >= bands.compliant) return hsl('green', 0.13)
  if (value >= bands.near) return hsl('amber', 0.13)
  return hsl('red', 0.13)
}

export function barColor(value: number) {
  if (metricIsStatus()) return value >= 90 ? hsl('green') : hsl('red')
  if (isADAC()) {
    const { high, moderate } = getAdacBands()
    if (value >= high) return hsl('green')
    if (value >= moderate) return hsl('amber')
    return hsl('red')
  }
  if (isLCPC()) {
    if (value >= 80) return hsl('green')
    if (value >= 50) return hsl('amber')
    if (value >= 20) return hsl('orange')
    return hsl('red')
  }
  const bands = store.AUDITS[store.state.audit]?.bands || { elite: 95, compliant: 90, near: 80 }
  if (value >= bands.elite) return hsl('emerald')
  if (value >= bands.compliant) return hsl('green')
  if (value >= bands.near) return hsl('amber')
  return hsl('red')
}

export function provColor(value: number | null | undefined) {
  if (metricIsStatus()) return (value ?? 0) >= 50 ? hsl('green') : hsl('red')
  if (isADAC()) {
    const { high, moderate } = getAdacBands()
    if (value == null) return '#cbd5e1' // neutral fallback
    if (value >= high) return hsl('blue')
    if (value >= moderate) return hsl('sky')
    return '#cbd5e1'
  }
  if (isLCPC()) {
    if (value == null) return '#cbd5e1'
    if (value >= 80) return hsl('blue')
    if (value >= 50) return hsl('sky')
    if (value >= 20) return '#cbd5e1' // mid tier stays neutral in province ranking
    return '#cbd5e1'
  }
  if (value == null) return '#cbd5e1'
  if (value >= 95) return hsl('blue')
  if (value >= 90) return hsl('sky')
  if (value >= 80) return hsl('cyan')
  return '#cbd5e1'
}

// Bands and thresholds
export function complianceThreshold() {
  if (metricIsStatus()) return 90
  if (isADAC()) return getAdacBands().high
  if (isLCPC()) return 80
  return store.AUDITS[store.state.audit]?.bands?.compliant ?? 90
}

export type BandKey = 'pass' | 'fail' | 'high' | 'moderate' | 'low' | 'elite' | 'compliant' | 'near' | 'below' | 'ideal' | 'mature' | 'progressive' | 'basic'
export function classifyBand(value: number | null | undefined): BandKey | null {
  if (value == null) return null
  if (metricIsStatus()) return value >= 90 ? 'pass' : 'fail'
  if (isADAC()){
    const { high, moderate } = getAdacBands()
    if (value >= high) return 'high'
    if (value >= moderate) return 'moderate'
    return 'low'
  }
  if (isLCPC()){
    if (value >= 80) return 'ideal'
    if (value >= 50) return 'mature'
    if (value >= 20) return 'progressive'
    return 'basic'
  }
  const bands = store.AUDITS[store.state.audit]?.bands || { elite: 95, compliant: 90, near: 80 }
  if (value >= bands.elite) return 'elite'
  if (value >= bands.compliant) return 'compliant'
  if (value >= bands.near) return 'near'
  return 'below'
}

export function classifyBandFor(auditKey: string, value: number | null | undefined): BandKey | null {
  if (value == null) return null
  if (metricIsStatusFor(auditKey)) return value >= 90 ? 'pass' : 'fail'
  if (isADACFor(auditKey)){
    const bands = (store.AUDITS?.ADAC?.bands || {})
    const high = bands.high_functional ?? 85
    const moderate = bands.moderate_functional ?? 50
    if (value >= high) return 'high'
    if (value >= moderate) return 'moderate'
    return 'low'
  }
  if (isLCPCFor(auditKey)){
    if (value >= 80) return 'ideal'
    if (value >= 50) return 'mature'
    if (value >= 20) return 'progressive'
    return 'basic'
  }
  const bands = store.AUDITS[auditKey]?.bands || { elite: 95, compliant: 90, near: 80 }
  if (value >= bands.elite) return 'elite'
  if (value >= bands.compliant) return 'compliant'
  if (value >= bands.near) return 'near'
  return 'below'
}

export function bandLabel(band: BandKey): string {
  switch (band) {
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
    default: return String(band)
  }
}

export function bandLabelFromValue(value: number | null | undefined): string {
  const key = classifyBand(value)
  return key ? bandLabel(key) : '-'
}

export function bandLabelFor(auditKey: string, value: number | null | undefined): string {
  const key = classifyBandFor(auditKey, value)
  if (!key) return '-'
  if (isLCPCFor(auditKey)) {
    // LCPC: plain category names only
    switch (key) {
      case 'ideal': return 'Ideal'
      case 'mature': return 'Mature'
      case 'progressive': return 'Progressive'
      case 'basic': return 'Basic'
      default: return bandLabel(key)
    }
  }
  return bandLabel(key)
}

// Stats helpers
export function lastNonNull(obj: Record<string, any>, years: number[]) {
  for (let i = years.length - 1; i >= 0; i--) {
    const year = years[i]
    const value = obj['y' + year]
    if (value != null) return { year, value }
  }
  return { year: null as number | null, value: null as number | null }
}

export function firstNonNull(obj: Record<string, any>, years: number[]) {
  for (let i = 0; i < years.length; i++){
    const year = years[i]
    const value = obj['y' + year]
    if (value != null) return { year, value }
  }
  return { year: null as number | null, value: null as number | null }
}

export function quantile(sorted: number[], q: number) {
  if (!sorted.length) return null
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sorted[base + 1] !== undefined) return sorted[base] + rest * (sorted[base + 1] - sorted[base])
  return sorted[base]
}

export function computeCoverage(rows: Row[], years: number[]) {
  const lguCount = new Set(rows.map(r => r.lgu)).size
  const denom = lguCount * years.length
  if (!denom) return { percent: 0, present: 0, denom: 0 }
  let present = 0
  for (const r of rows) for (const y of years) if ((r as any)['y' + y] != null) present++
  return { percent: present / denom * 100, present, denom }
}

export const actions = {
  setAuditKey(value: string) {
    setAudit(value)
    // reset filters to avoid stale selections across audits
    actions.resetFilters()
  },
  setRegion(value: string) {
    store.state.region = value
    store.state.province = ''
    store.state.lgu = ''
  },
  setProvince(value: string) {
    store.state.province = value
    store.state.lgu = ''
    try {
      const ev = new CustomEvent('store:province-changed', { detail: { province: value } })
      window.dispatchEvent(ev)
    } catch {}
  },
  setLgu(value: string) {
    store.state.lgu = value
  },
  setType(value: string) {
    store.state.type = value
  },
  setStartYear(value: number | null) {
    store.state.startYear = value
    const { startYear, endYear } = store.state
    if (startYear != null && endYear != null && startYear > endYear) {
      store.state.endYear = startYear
    }
  },
  setEndYear(value: number | null) {
    store.state.endYear = value
    const { startYear, endYear } = store.state
    if (startYear != null && endYear != null && endYear < startYear) {
      store.state.startYear = endYear
    }
  },
  resetFilters() {
    store.state.region = ''
    store.state.province = ''
    store.state.lgu = ''
    store.state.type = ''
    if (store.YEARS.length) {
      store.state.startYear = store.YEARS[0]
      store.state.endYear = store.YEARS[store.YEARS.length - 1]
    }
  },
}

export function toCSV(rows: Row[], years: number[]) {
  const headers = ['REGION', 'PROVINCE', 'LGU', 'TYPE', ...years.map(String)]
  const lines = [headers.join(',')]
  const isStatus = metricIsStatus()
  for (const row of rows) {
    const cells = years.map((y) => {
      if (isStatus) {
        const raw = (row as any)['s' + y]
        return raw != null ? '"' + String(raw).replace(/"/g, '""') + '"' : ''
      }
      const value = (row as any)['y' + y]
      return value == null ? '' : String(value)
    })
    lines.push([
      (row as any).region,
      (row as any).province,
      '"' + String((row as any).lgu).replace(/"/g, '""') + '"',
      (row as any).type,
      ...cells,
    ].join(','))
  }
  return lines.join('\n')
}

export function downloadFilteredCsv() {
  const rows = filterRows(store.rawRows)
  const years = yearsInScope()
  const csv = toCSV(rows, years)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${store.state.audit.toLowerCase()}_filtered.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
