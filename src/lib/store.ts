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
  // Optional audit meta overrides (thresholds/labels)
  await loadAuditConfig(canon, base)
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
  // Handle common mojibake (Ã‘ -> n) then strip accents and punctuation
  const fixed = String(s || '')
    .replace(/Ã‘|Ã±/g, 'n')
    .replace(/â€™|’|‘/g, "'")
  return fixed
    .toLowerCase()
    // remove parenthetical notes e.g., (Capital), (DADIANGAS)
    .replace(/\s*\([^\)]*\)/g, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s*\(capital\)/g,'')
    .replace(/^city of\s+/, '')
    .replace(/[^a-z0-9]+/g, '')
}

async function loadAuditConfig(canon: any, base: string){
  try {
    const r = await fetch(`${base}audits.config.json`, { cache: 'no-store' })
    if (!r.ok) return
    const cfg = await r.json()
    canon.meta = canon.meta || {}
    canon.meta.audits = canon.meta.audits || {}
    for (const [key, meta] of Object.entries(cfg || {})){
      const cur = (canon.meta.audits as any)[key] || {}
      ;(canon.meta.audits as any)[key] = { ...cur, ...meta }
    }
  } catch {}
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

export type Band = { key: string; label: string; min: number; color?: string }

export function bandsArrayFor(auditKey: string): Band[] | null {
  const meta = (store.AUDITS || {})[auditKey] || {}
  const b = (meta as any).bands
  if (Array.isArray(b)) return b as Band[]
  if (b && typeof b === 'object' && (b.high_functional != null || b.moderate_functional != null)){
    const high = Number(b.high_functional ?? 85)
    const moderate = Number(b.moderate_functional ?? 50)
    return [
      { key: 'high', label: 'High Functional', min: high, color: hsl('green') },
      { key: 'moderate', label: 'Moderate Functional', min: moderate, color: hsl('amber') },
      { key: 'low', label: 'Low Functional', min: -Infinity, color: hsl('red') },
    ]
  }
  if (String(auditKey).toUpperCase() === 'LCPC'){
    return [
      { key: 'ideal', label: 'Ideal', min: 80, color: hsl('green') },
      { key: 'mature', label: 'Mature', min: 50, color: hsl('amber') },
      { key: 'progressive', label: 'Progressive', min: 20, color: hsl('orange') },
      { key: 'basic', label: 'Basic', min: -Infinity, color: hsl('red') },
    ]
  }
  return null
}

function bandForValue(auditKey: string, value: number | null | undefined): Band | null {
  if (value == null) return null
  const bands = bandsArrayFor(auditKey)
  if (!bands || !bands.length) return null
  const sorted = bands.slice().sort((a, b) => b.min - a.min)
  for (const band of sorted){
    if (value >= band.min) return band
  }
  return sorted[sorted.length - 1] || null
}

export function colorForScore(value: number | null | undefined) {
  if (value == null) return 'transparent'
  if (metricIsStatus()) return value >= 90 ? hsl('green', 0.13) : hsl('red', 0.13)
  const b = bandForValue(store.state.audit, value)
  if (b?.color) return b.color
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

function softFromColor(raw: string, alpha = 0.13){
  const s = String(raw || '').trim()
  if (!s) return 'transparent'
  if (/^hsl\(/i.test(s)){
    const inner = s.replace(/^hsl\(/i,'').replace(/\)$/,'').trim()
    return `hsl(${inner} / ${alpha})`
  }
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)){
    const hex = s.substring(1)
    const n = hex.length === 3 ? hex.split('').map(ch => ch+ch).join('') : hex
    const r = parseInt(n.substring(0,2),16)
    const g = parseInt(n.substring(2,4),16)
    const b = parseInt(n.substring(4,6),16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  // Fallback: return as-is; browser may handle other css color formats
  return s
}

export function colorForPill(value: number | null | undefined, alpha = 0.13) {
  if (value == null) return 'transparent'
  if (metricIsStatus()) return value >= 90 ? hsl('green', alpha) : hsl('red', alpha)
  const b = bandForValue(store.state.audit, value)
  if (b?.color) return softFromColor(b.color, alpha)
  // fallbacks mirroring colorForScore
  if (isADAC()) {
    const { high, moderate } = getAdacBands()
    if (value >= high) return hsl('green', alpha)
    if (value >= moderate) return hsl('amber', alpha)
    return hsl('red', alpha)
  }
  if (isLCPC()) {
    if (value >= 80) return hsl('green', alpha)
    if (value >= 50) return hsl('amber', alpha)
    if (value >= 20) return hsl('orange', alpha)
    return hsl('red', alpha)
  }
  const bands = store.AUDITS[store.state.audit]?.bands || { elite: 95, compliant: 90, near: 80 }
  if (value >= bands.elite) return hsl('emerald', alpha)
  if (value >= bands.compliant) return hsl('green', alpha)
  if (value >= bands.near) return hsl('amber', alpha)
  return hsl('red', alpha)
}

export function barColor(value: number) {
  if (metricIsStatus()) return value >= 90 ? hsl('green') : hsl('red')
  const b = bandForValue(store.state.audit, value)
  if (b?.color) return b.color
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
  const b = bandForValue(store.state.audit, value ?? null)
  if (b?.color) return b.color
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
  // Prefer array-based band metadata when available
  const arr = bandsArrayFor(store.state.audit)
  if (arr && arr.length){
    const sorted = arr.slice().sort((a,b) => (b.min - a.min))
    for (const b of sorted){ if (value >= b.min) return b.key as BandKey }
    return sorted[sorted.length-1]?.key as BandKey
  }
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
  const arr = bandsArrayFor(auditKey)
  if (arr && arr.length){
    const sorted = arr.slice().sort((a,b) => (b.min - a.min))
    for (const b of sorted){ if (value >= b.min) return b.key as BandKey }
    return sorted[sorted.length-1]?.key as BandKey
  }
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

function stripParen(label: string){
  return String(label || '').replace(/\s*\([^)]*\)\s*$/, '').trim()
}

export function bandLabelFor(auditKey: string, value: number | null | undefined): string {
  const key = classifyBandFor(auditKey, value)
  if (!key) return '-'
  const meta = (store.AUDITS || {})[auditKey] || {}
  const labels = (meta as any).labels || {}
  const labelsShort = (meta as any).labels_short || {}
  // Prefer audit-specific labels if provided
  const directShort = (labelsShort as any)[key]
  if (directShort) return String(directShort)
  const direct = (labels as any)[key]
  if (direct) return stripParen(String(direct))
  // Support ADAC-like label keys band_high/band_moderate/band_low
  if (key === 'high' && (labels as any)['band_high']) return stripParen(String((labels as any)['band_high']))
  if (key === 'moderate' && (labels as any)['band_moderate']) return stripParen(String((labels as any)['band_moderate']))
  if (key === 'low' && (labels as any)['band_low']) return stripParen(String((labels as any)['band_low']))
  if (isLCPCFor(auditKey)) {
    // LCPC defaults: plain names
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
