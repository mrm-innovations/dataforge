import React, { useEffect, useMemo, useRef, useState } from 'react'
import { store, filterRows } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RecordsTable } from '@/components/RecordsTable'
import * as Popover from '@radix-ui/react-popover'
import { hsl, HSL } from '@/lib/colors'
import { bandsArrayFor } from '@/lib/store'

function normalizeName(s: string){
  return String(s || '')
    .replace(/Ã‘|Ã±/g, 'n')
    .replace(/â€™|’|‘/g, "'")
    .toLowerCase()
    .replace(/\s*\([^\)]*\)/g, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s*\(capital\)/g,'')
    .replace(/^city of\s+/, '')
    .replace(/[^a-z0-9]+/g, '')
}

function toNumber(v: any){
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[%\s]+/g,''))
  return Number.isFinite(n) ? n : null
}

function parseCSV(raw: string){
  const rows: string[][] = []
  let field = '', row: string[] = [], inQuotes = false
  for (let i=0; i<raw.length; i++){
    const c = raw[i]
    if (inQuotes){
      if (c === '"'){
        if (raw[i+1] === '"'){ field+='"'; i++ } else { inQuotes=false }
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field='' }
      else if (c === '\r') { /* ignore */ }
      else if (c === '\n') { row.push(field); field=''; rows.push(row); row=[] }
      else field += c
    }
  }
  row.push(field); rows.push(row)
  const header = rows.shift() || []
  return { header, rows }
}

function asObjects(header: string[], rows: string[][]){
  return rows.map(r => {
    const o: any = {}
    for (let i=0;i<header.length;i++) o[header[i]] = r[i] ?? ''
    return o
  })
}

function getVal(row: any, candidates: string[]): string {
  if (!row) return ''
  const lowerMap = new Map<string, string>()
  for (const k of Object.keys(row)) lowerMap.set(k.toLowerCase(), row[k])
  for (const key of candidates) {
    const v = lowerMap.get(key.toLowerCase())
    if (v != null && String(v).trim() !== '') return String(v)
  }
  return ''
}

export function SettingsView(){
  // Admin auth gate
  const [adminAuthed, setAdminAuthed] = useState<boolean>(false)
  const [adminApiAvailable, setAdminApiAvailable] = useState<boolean>(true)
  const [adminUser, setAdminUser] = useState<string>('')
  const [adminPass, setAdminPass] = useState<string>('')
  const [audit, setAudit] = useState<string>('ADAC')
  const [customKey, setCustomKey] = useState<string>('')
  const [log, setLog] = useState<string>('Ready.')
  const [uploading, setUploading] = useState<boolean>(false)
  const [picked, setPicked] = useState<string>('')
  // Column mapping + parsed data
  const [headers, setHeaders] = useState<string[]>([])
  const [provinceCol, setProvinceCol] = useState<string>('')
  const [lguCol, setLguCol] = useState<string>('')
  const [parsedRows, setParsedRows] = useState<any[]>([])
  const [yearCols, setYearCols] = useState<string[]>([])
  const [detectedYears, setDetectedYears] = useState<string[]>([])
  const [includeProvinceRows, setIncludeProvinceRows] = useState<boolean>(false)
  const [aliases, setAliases] = useState<Record<string, string>>({})
  const [suggestThreshold, setSuggestThreshold] = useState<number>(0.85)
  // Legacy metric inputs (kept for backward compat in code paths, not shown in UI)
  const [metric, setMetric] = useState<'score' | 'status'>('score')
  const [highThr, setHighThr] = useState<string>('85')
  const [modThr, setModThr] = useState<string>('50')
  const [passThr, setPassThr] = useState<string>('50')
  const [inferYears, setInferYears] = useState<boolean>(true)
  const [customYears, setCustomYears] = useState<string>('')
  const [unmatched, setUnmatched] = useState<Array<{ province: string; lgu: string; key: string; suggest?: string; score?: number }>>([])
  const [lastAuditKey, setLastAuditKey] = useState<string>('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Metric editor state
  const [editOpen, setEditOpen] = useState<boolean>(false)
  const [editMetric, setEditMetric] = useState<'score'|'status'>('score')
  const [editBands, setEditBands] = useState<Array<{ key: string; label: string; min: string; color?: string }>>([
    { key: 'high', label: 'High Functional', min: '85', color: 'hsl(142.1 76.2% 36.3%)' },
    { key: 'moderate', label: 'Moderate Functional', min: '50', color: 'hsl(38 92% 50%)' },
    { key: 'low', label: 'Low Functional', min: '-Infinity', color: 'hsl(0 72% 51%)' },
  ])
  const [editPassLabels, setEditPassLabels] = useState<{ pass: string; nonpass: string }>({ pass: 'Passer', nonpass: 'Non-Passer' })
  const [editPassThr, setEditPassThr] = useState<string>('50')

  function ColorPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }){
    const resolved = String(value || '')
    const swatches = ['green','emerald','blue','sky','indigo','violet','cyan','teal','amber','orange','red','pink'] as const
    const fallbackHex = '#16a34a'
    const current = /^#/.test(resolved) ? resolved : ''
    return (
      <Popover.Root>
        <Popover.Trigger asChild>
          <button className="h-8 px-2 border rounded inline-flex items-center gap-2" title={resolved || 'Pick color'}>
            <span className="inline-block w-4 h-4 rounded" style={{ background: resolved || fallbackHex }} />
            <span className="text-xs text-muted-foreground truncate max-w-28">{resolved || 'Pick'}</span>
          </button>
        </Popover.Trigger>
        <Popover.Content className="z-50 rounded border bg-white p-2 shadow-md w-72" sideOffset={6}>
          <div className="flex items-center gap-2 mb-2">
            <input type="color" className="w-10 h-8 p-0 border rounded" value={current || fallbackHex} onChange={(e)=> onChange(e.target.value)} />
            <Input className="h-8" value={resolved} onChange={(e)=> onChange(e.target.value)} placeholder="#16a34a or hsl(...)" />
            <Button size="sm" variant="ghost" onClick={() => onChange('')}>Clear</Button>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {swatches.map((k) => {
              const c = hsl((HSL as any)[k] ? k : String(k))
              return (
                <button key={String(k)} className="w-8 h-8 rounded border" style={{ background: c }} title={String(k)} onClick={() => onChange(c)} />
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Root>
    )
  }

  const [audits, setAudits] = useState<string[]>(Object.keys(store.AUDITS || {}))

  // With HttpOnly cookie sessions, we stay authed for the tab lifecycle after login.

  // No external auth script needed for basic login

  function addLog(line: string){ setLog((l) => l + "\n" + line) }

  // Build API base path anchored at site root (strip /dist/ from Vite base)
  function apiBase(){
    const base = ((import.meta as any).env?.BASE_URL ?? '/').toString()
    return base.replace(/\/+$/, '/').replace(/\/dist\/$/, '/')
  }

  // Detect if admin API endpoints are reachable (for static hosts, hide publish actions)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(apiBase() + 'api/login.php', { method: 'GET', credentials: 'include' })
        // Any HTTP response means the endpoint exists; network failure => unavailable
        setAdminApiAvailable(true)
      } catch {
        setAdminApiAvailable(false)
      }
    })()
  }, [])

  // Basic username/password login removed; Google Sign-In only

  // No Google initialization

  function openMetricEditor(){
    const meta: any = (store.AUDITS || {})[audit] || {}
    const metricType: 'score'|'status' = meta.metric === 'status' ? 'status' : 'score'
    setEditMetric(metricType)
    if (metricType === 'status'){
      const vals = Array.isArray(meta.status_values) && meta.status_values.length >= 2 ? meta.status_values : ['Passer','Non-Passer']
      setEditPassLabels({ pass: String(vals[0]||'Passer'), nonpass: String(vals[1]||'Non-Passer') })
      setEditPassThr(String((meta.pass_threshold ?? passThr) || '50'))
    } else {
      if (Array.isArray(meta.bands)){
        setEditBands(meta.bands.map((b: any) => ({ key: String(b.key||''), label: String(b.label||b.key||''), min: String(b.min), color: b.color })))
      } else if (meta?.bands?.high_functional != null || meta?.bands?.moderate_functional != null) {
        setEditBands([
          { key: 'high', label: 'High Functional', min: String(meta.bands.high_functional ?? 85), color: 'hsl(142.1 76.2% 36.3%)' },
          { key: 'moderate', label: 'Moderate Functional', min: String(meta.bands.moderate_functional ?? 50), color: 'hsl(38 92% 50%)' },
          { key: 'low', label: 'Low Functional', min: '-Infinity', color: 'hsl(0 72% 51%)' },
        ])
      } else if (String(audit).toUpperCase() === 'LCPC'){
        setEditBands([
          { key: 'ideal', label: 'Ideal', min: '80', color: 'hsl(142.1 76.2% 36.3%)' },
          { key: 'mature', label: 'Mature', min: '50', color: 'hsl(38 92% 50%)' },
          { key: 'progressive', label: 'Progressive', min: '20', color: 'hsl(24 95% 53%)' },
          { key: 'basic', label: 'Basic', min: '-Infinity', color: 'hsl(0 72% 51%)' },
        ])
      } else {
        setEditBands([
          { key: 'high', label: 'High', min: '85' },
          { key: 'moderate', label: 'Moderate', min: '50' },
          { key: 'low', label: 'Low', min: '-Infinity' },
        ])
      }
    }
    setEditOpen(true)
  }

  function applyMetricEditor(){
    try {
      const metaRoot: any = (store.CANON as any)
      metaRoot.meta = metaRoot.meta || { audits: {} }
      metaRoot.meta.audits = metaRoot.meta.audits || {}
      const years = (store.AUDITS?.[audit]?.years || [])
      if (editMetric === 'status'){
        const entry = { metric: 'status', years, status_values: [editPassLabels.pass, editPassLabels.nonpass], pass_threshold: Number(editPassThr) || undefined }
        metaRoot.meta.audits[audit] = { ...(metaRoot.meta.audits[audit]||{}), ...entry }
        ;(store as any).AUDITS[audit] = metaRoot.meta.audits[audit]
        addLog(`Updated metrics for ${audit}: Status (${editPassLabels.pass}/${editPassLabels.nonpass}); pass≥${editPassThr}%`)
      } else {
        // Clean and sort bands by min desc; last band can be -Infinity
        const bands = editBands
          .filter(b => String(b.key||'').trim() && String(b.label||'').trim())
          .map(b => ({ key: String(b.key).trim(), label: String(b.label).trim(), min: (String(b.min).trim()===''||String(b.min).trim()==='-Infinity') ? -Infinity : Number(b.min), color: b.color }))
          .sort((a,b) => (b.min===-Infinity? -1 : a.min===-Infinity? 1 : (b.min - a.min)))
        const entry = { metric: 'score', years, bands }
        metaRoot.meta.audits[audit] = { ...(metaRoot.meta.audits[audit]||{}), ...entry }
        ;(store as any).AUDITS[audit] = metaRoot.meta.audits[audit]
        addLog(`Updated metrics for ${audit}: ${bands.length} band(s).`)
      }
      setEditOpen(false)
    } catch (e: any) { addLog('Failed to apply metric changes: ' + (e?.message || String(e))) }
  }

  function resetMetricToDefault(){
    if (editMetric === 'status'){
      setEditPassLabels({ pass: 'Passer', nonpass: 'Non-Passer' })
      setEditPassThr('50')
    } else {
      setEditBands([
        { key: 'high', label: 'High Functional', min: '85' },
        { key: 'moderate', label: 'Moderate Functional', min: '50' },
        { key: 'low', label: 'Low Functional', min: '-Infinity' },
      ])
    }
  }

  async function deleteCurrentAudit(){
    const key = (customKey || audit).trim().toUpperCase() || audit
    if (!key) { addLog('No audit selected to delete.'); return }
    const confirmText = window.prompt(`Type the audit key to delete to confirm: ${key}`)
    if (!confirmText || confirmText.trim().toUpperCase() !== key){ addLog('Delete cancelled or key mismatch.'); return }
    try {
      const canon: any = store.CANON
      if (!canon) throw new Error('Canonical data not loaded')
      canon.meta = canon.meta || {}
      canon.meta.audits = canon.meta.audits || {}
      delete (canon.meta.audits as any)[key]
      delete (store as any).AUDITS[key]
      // Remove results for this audit from each LGU
      ;(canon.lgus || []).forEach((g: any) => { if (g?.results) delete g.results[key] })
      // Refresh audits list and switch to a remaining audit
      const list = Object.keys(store.AUDITS || {})
      setAudits(list)
      const next = list[0] || ''
      if (next) setAudit(next)
      setLastAuditKey('')
      setUnmatched([])
      addLog(`Deleted audit ${key}. Use Publish Data to persist changes.`)
    } catch (e:any) {
      addLog('Delete failed: ' + (e?.message || String(e)))
    }
  }

  // Initialize per-audit defaults when switching audits
  useEffect(() => {
    const meta: any = (store.AUDITS || {})[audit] || {}
    if (meta.metric) setMetric(meta.metric)
    if (meta.bands) {
      if (meta.bands.high_functional != null) setHighThr(String(meta.bands.high_functional))
      if (meta.bands.moderate_functional != null) setModThr(String(meta.bands.moderate_functional))
    }
  }, [audit])

  function exportJSON(){
    try {
      const years = (store.AUDITS?.[audit]?.years || []) as number[]
      const rows = (store.CANON?.lgus || []).map((g: any) => {
        const rec = (g.results?.[audit] || {}) as Record<string, any>
        const o: any = { type: g.type, province: g.province, lgu: g.lgu }
        years.forEach((y) => { o[String(y)] = rec[String(y)] ?? null })
        return o
      })
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${audit.toLowerCase()}.json`
      a.click()
    } catch (e: any) { addLog('Export JSON failed: ' + (e?.message || String(e))) }
  }

  function exportCSV(){
    try {
      const years = (store.AUDITS?.[audit]?.years || []) as number[]
      const header = ['Type','Province/HUC','City/Municipality', ...years.map(String)]
      const rows = (store.CANON?.lgus || []).map((g: any) => {
        const rec = (g.results?.[audit] || {}) as Record<string, any>
        const line: any[] = [g.type || '', g.province || '', g.lgu || '']
        years.forEach((y) => line.push(rec[String(y)] ?? ''))
        return line
      })
      const esc = (s: any) => { const v = String(s); return /[",\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v }
      const csv = header.map(esc).join(',') + '\n' + rows.map(r => r.map(esc).join(',')).join('\n') + '\n'
      const blob = new Blob([csv], { type: 'text/csv' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${audit.toLowerCase()}.csv`
      a.click()
    } catch (e: any) { addLog('Export CSV failed: ' + (e?.message || String(e))) }
  }

  function autoDetectColumns(hdrs: string[]){
    // heuristics for column names
    const find = (cands: string[]) => {
      const map = new Map(hdrs.map(h => [h.toLowerCase(), h]))
      for (const key of cands){
        const v = map.get(key.toLowerCase())
        if (v) return v
      }
      // fallback by substring
      for (const h of hdrs){
        const l = h.toLowerCase()
        if (cands.some(c => l.includes(c.toLowerCase()))) return h
      }
      return ''
    }
    const prov = find(['province/huc','province','prov','huc'])
    const lgu = find(['city/municipality','city/mun','city','municipality','lgu'])
    return { prov, lgu }
  }

  function runMatchWithState(aliasesOverride?: Record<string, string>){
    if (!parsedRows.length) return
    const useYears = yearCols.length ? yearCols : detectedYears
    return runMatch(parsedRows, provinceCol, lguCol, useYears, includeProvinceRows, aliasesOverride)
  }

  async function onImportFileChange(e: React.ChangeEvent<HTMLInputElement>){
    const f = e.target.files?.[0]
    if (!f) return
    setPicked(f.name)
    try {
      setUploading(true)
      const text = await f.text()
      const ext = f.name.toLowerCase().split('.').pop()
      let rows: any[] = []
      let localProv = ''
      let localLgu = ''
      if (ext === 'json') {
        rows = JSON.parse(text.replace(/[\u0000-\u0009\u000B-\u001F]/g,''))
        setParsedRows(rows)
      } else if (ext === 'csv') {
        const { header, rows: data } = parseCSV(text)
        setHeaders(header)
        const { prov, lgu } = autoDetectColumns(header)
        setProvinceCol(prov)
        setLguCol(lgu)
        localProv = prov
        localLgu = lgu
        rows = asObjects(header, data)
        setParsedRows(rows)
      } else {
        throw new Error('Unsupported file type: ' + ext)
      }
      // Detect years
      const sample = rows[0] || {}
      let detected = Object.keys(sample).filter((k) => /^\d{4}$/.test(k))
      if (!inferYears) {
        const parsed = (customYears || '').split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
        if (parsed.length) detected = parsed
      }
      setDetectedYears(detected)
      setYearCols(detected)

      // Auto-run a first match using detected columns
      await runMatch(rows, provinceCol || localProv, lguCol || localLgu, detected, includeProvinceRows)
    } catch (err: any) {
      addLog('Import failed: ' + (err?.message || String(err)))
    } finally {
      if (inputRef.current) inputRef.current.value = ''
      setUploading(false)
    }
  }

  async function runMatch(rows: any[], provCol: string, lguColName: string, years: string[], includeProvRows: boolean, aliasesOverride?: Record<string, string>){
    const byKey = new Map<string, any>()
    const canonList: Array<{ key: string; display: string }> = []
    ;(store.CANON?.lgus || []).forEach((g: any) => {
      const display = g.lgu || g.province
      const k = normalizeName(display)
      if (!byKey.has(k)) byKey.set(k, g)
      canonList.push({ key: k, display: String(display) })
    })
    function lev(a: string, b: string){
      const m = a.length, n = b.length
      if (!m) return n; if (!n) return m
      const dp: number[][] = Array.from({length: m+1}, (_,i)=>Array(n+1).fill(0))
      for (let i=0;i<=m;i++) dp[i][0]=i
      for (let j=0;j<=n;j++) dp[0][j]=j
      for (let i=1;i<=m;i++){
        for (let j=1;j<=n;j++){
          const cost = a[i-1]===b[j-1]?0:1
          dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost)
        }
      }
      return dp[m][n]
    }
    function suggestFor(key: string){
      let best = { s: '', score: -Infinity }
      for (const c of canonList){
        if (c.key === key) return { s: c.display, score: 1 }
        const d = lev(key, c.key)
        const sim = 1 - d/Math.max(key.length, c.key.length, 1)
        const sub = (c.key.includes(key) || key.includes(c.key)) ? 0.05 : 0
        const score = sim + sub
        if (score > best.score) best = { s: c.display, score }
      }
      return best
    }
    ;(store.CANON?.lgus || []).forEach((g: any) => {
      const k = normalizeName(g.lgu || g.province)
      if (!byKey.has(k)) byKey.set(k, g)
    })
    const targetAudit = (customKey || audit).trim().toUpperCase()
    if (!targetAudit) throw new Error('Audit key is required (choose from list or enter a new key)')
    // Ensure meta exists for new audits
    const metaRoot: any = (store.CANON as any)
    metaRoot.meta = metaRoot.meta || { audits: {} }
    metaRoot.meta.audits = metaRoot.meta.audits || {}
    if (!metaRoot.meta.audits[targetAudit]){
      // Seed with sensible defaults; user can adjust via Edit Metrics
      metaRoot.meta.audits[targetAudit] = {
        years: years.map((y:any) => Number(y)),
        metric: 'score',
        bands: [
          { key: 'high', label: 'High Functional', min: 85, color: 'hsl(142.1 70.6% 45.3%)' },
          { key: 'moderate', label: 'Moderate Functional', min: 50, color: 'hsl(37.7 92.1% 50.2%)' },
          { key: 'low', label: 'Low Functional', min: -Infinity, color: 'hsl(0 84.2% 60.2%)' },
        ],
      }
      ;(store as any).AUDITS[targetAudit] = metaRoot.meta.audits[targetAudit]
      addLog(`Created new audit meta: ${targetAudit} (metric: score; years: ${years.join(', ')})`)
      // Refresh audit list in dropdown without hard reload
      setAudits(Object.keys(store.AUDITS || {}))
    }
    // Always refresh audits in case years/metric changed
    setAudits(Object.keys(store.AUDITS || {}))
    const auditMeta: any = (store.AUDITS || {})[targetAudit] || {}
    const metricUsed: 'score' | 'status' = auditMeta.metric === 'status' ? 'status' : 'score'
    const passThrUsed: number = Number(auditMeta.pass_threshold ?? 50)
    let matched = 0, total = 0
    const miss: Array<{ province: string; lgu: string; key: string; suggest?: string; score?: number }> = []
    rows.forEach((r: any) => {
      total++
      const prov = provCol ? String(r[provCol] ?? '') : getVal(r, ['Province/HUC','PROVINCE/HUC','Province','PROVINCE','Prov','HUC','province','province/huc'])
      const lgu  = lguColName ? String(r[lguColName] ?? '') : getVal(r, ['City/Municipality','CITY/MUNICIPALITY','City/MUN','CITY/MUN','City','CITY','Municipality','MUNICIPALITY','LGU','lgu','city','municipality'])
      if (!includeProvRows && prov && !lgu) return // skip province-level totals if toggled off
      const keyRaw = lgu || prov
      const key = normalizeName(keyRaw)
      const aliasMap = aliasesOverride || aliases
      const alias = aliasMap[key]
      const useKey = alias ? normalizeName(alias) : key
      const rec = byKey.get(useKey)
      if (!rec){ const s = suggestFor(key); miss.push({ province: prov, lgu, key, suggest: s.s, score: s.score }); return }
      rec.results = rec.results || {}
      const target = rec.results[targetAudit] = rec.results[targetAudit] || {}
      years.forEach((y:any) => {
        if (metricUsed === 'status'){
          const raw = r[String(y)]
          const s = String(raw ?? '').trim().toLowerCase()
          let val: 'Passer' | 'Non-Passer' | '' = ''
          if (s === 'passer' || s === 'pass' || s === 'passed') val = 'Passer'
          else if (s === 'non-passer' || s === 'fail' || s === 'failed') val = 'Non-Passer'
          else {
            const n = Number(String(raw ?? '').replace(/[%\s]+/g,''))
            if (Number.isFinite(n)) val = n >= passThrUsed ? 'Passer' : 'Non-Passer'
          }
          target[String(y)] = val
        } else {
          target[String(y)] = toNumber(r[y])
        }
      })
      matched++
    })
    setUnmatched(miss)
    setLastAuditKey(targetAudit)
    setAudit(targetAudit)
    addLog(`Ingested ${targetAudit}: matched ${matched}/${total}. Unmatched: ${miss.length}.`)
  }

  function downloadUnmatched(){
    if (!unmatched.length || !lastAuditKey) return
    const lines = unmatched.map(u => `${u.province}\t${u.lgu}\t(${u.key})`).join('\n')
    const blob = new Blob([lines], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${lastAuditKey.toLowerCase()}-unmatched.txt`
    a.click()
  }

  function downloadCanonical(){
    const canonBlob = new Blob([JSON.stringify(store.CANON, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(canonBlob)
    a.download = 'lg-audits.updated.json'
    a.click()
  }

  async function publishCanonToServer(){
    try {
      const url = `${apiBase()}api/save-json.php?file=dist/lg-audits.json`
      const data = JSON.stringify(store.CANON, null, 2)
      const resp = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: data })
      if (!resp.ok) {
        const msg = await resp.text()
        throw new Error(`HTTP ${resp.status}: ${msg}`)
      }
      addLog('Published lg-audits.json to server successfully.')

      // Also publish per-audit dataset JSON for the current audit, if available
      const key = (lastAuditKey || audit || '').trim().toUpperCase()
      if (key){
        const years = (store.AUDITS?.[key]?.years || []) as number[]
        const rows = (store.CANON?.lgus || []).map((g: any) => {
          const rec = (g.results?.[key] || {}) as Record<string, any>
          const o: any = { type: g.type, province: g.province, lgu: g.lgu }
          years.forEach((y) => { o[String(y)] = rec[String(y)] ?? null })
          return o
        })
        const datasetUrl = `${apiBase()}api/save-json.php?file=${encodeURIComponent('datasets/' + key.toLowerCase() + '.json')}`
        const r2 = await fetch(datasetUrl, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rows, null, 2) })
        if (!r2.ok) {
          const msg = await r2.text()
          throw new Error(`Dataset publish failed (HTTP ${r2.status}): ${msg}`)
        }
        addLog(`Published dataset ${key.toLowerCase()}.json to server (datasets/).`)
      }

      alert('Published data to server.')
    } catch (e:any) {
      addLog('Publish failed: ' + (e?.message || String(e)))
      alert('Publish failed. See Logs for details.')
    }
  }

  async function publishAuditConfigToServer(){
    try {
      const url = `${apiBase()}api/save-json.php?file=dist/audits.config.json`
      const audits = (store.CANON as any)?.meta?.audits || (store.AUDITS || {})
      const data = JSON.stringify(audits, null, 2)
      const resp = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: data })
      if (!resp.ok) {
        const msg = await resp.text()
        throw new Error(`HTTP ${resp.status}: ${msg}`)
      }
      addLog('Published audits.config.json to server successfully.')
      alert('Published audits.config.json to server.')
    } catch (e:any) {
      addLog('Publish audits.config.json failed: ' + (e?.message || String(e)))
      alert('Publish failed. See Logs for details.')
    }
  }

  async function adminLogin(){
    try {
      const url = `${apiBase()}api/login.php`
      const r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: adminUser, password: adminPass }) })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || !data?.ok) throw new Error(data?.error || `HTTP ${r.status}`)
      setAdminAuthed(true)
      addLog('Admin authenticated.')
    } catch (e:any) {
      alert('Login failed: ' + (e?.message || String(e)))
    }
  }

  if (!adminAuthed){
    return (
      <div className="p-4">
        <div className="max-w-md mx-auto border rounded bg-white p-4">
          <h2 className="font-medium mb-2">Admin Login</h2>
          <p className="text-xs text-muted-foreground mb-3">Enter the admin account to access Settings.</p>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Username</Label>
              <Input value={adminUser} onChange={(e)=>setAdminUser(e.target.value)} placeholder="admin" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Password</Label>
              <Input type="password" value={adminPass} onChange={(e)=>setAdminPass(e.target.value)} placeholder="••••••••" />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Button size="sm" onClick={adminLogin}>Sign In</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium">Settings</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={openMetricEditor}>Edit Metrics</Button>
          {adminApiAvailable && (
            <Button size="sm" variant="destructive" onClick={deleteCurrentAudit} title="Delete this audit from the canonical JSON (requires Publish to persist)">Delete Audit</Button>
          )}
          {adminApiAvailable && (<Button size="sm" variant="ghost" onClick={async () => {
            try { await fetch(apiBase() + 'api/logout.php', { method: 'POST', credentials: 'include' }) } catch {}
            setAdminAuthed(false)
          }}>Sign out</Button>)}
        </div>
      </div>
      {editOpen && (
        <div className="mb-3 rounded border bg-white p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Edit Metrics for {audit}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditOpen(false)}>Close</Button>
              <Button size="sm" variant="outline" onClick={resetMetricToDefault}>Reset to Default</Button>
              <Button size="sm" onClick={applyMetricEditor}>Apply to Current Audit</Button>
              <Button size="sm" variant="outline" onClick={() => {
                try {
                  const meta: any = (store.CANON as any)?.meta?.audits?.[audit] || (store.AUDITS as any)[audit] || {}
                  const cfg: any = { [audit]: meta }
                  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = 'audits.config.json'
                  a.click()
                } catch (e:any){ addLog('Export audits.config.json failed: ' + (e?.message||String(e))) }
              }}>Download Metrics</Button>
              {adminApiAvailable && (<Button size="sm" variant="default" onClick={publishAuditConfigToServer}>Publish Metrics</Button>)}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div className="flex flex-col gap-1 w-40">
              <Label className="text-xs">Metric Type</Label>
              <Select value={editMetric} onValueChange={(v) => setEditMetric(v as any)}>
                <SelectTrigger><SelectValue placeholder="Metric" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="score">Score (bands)</SelectItem>
                  <SelectItem value="status">Status (Pass/Non-Pass)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {editMetric === 'status' ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1 w-44">
                <Label className="text-xs">Pass label</Label>
                <Input value={editPassLabels.pass} onChange={(e) => setEditPassLabels({ ...editPassLabels, pass: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1 w-44">
                <Label className="text-xs">Non-Pass label</Label>
                <Input value={editPassLabels.nonpass} onChange={(e) => setEditPassLabels({ ...editPassLabels, nonpass: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1 w-32">
                <Label className="text-xs">Pass threshold %</Label>
                <Input value={editPassThr} onChange={(e) => setEditPassThr(e.target.value)} placeholder="50" />
              </div>
            </div>
          ) : (
            <div className="overflow-auto">
              <div className="text-xs text-muted-foreground mb-2">Min threshold is the lower bound for the band. The first band where value ≥ min applies. Leave the last band blank or set -Infinity.</div>
              <div className="flex items-center gap-2 mb-2 text-xs">
                <span className="text-muted-foreground">Presets:</span>
                <Button size="sm" variant="outline" onClick={() => {
                  setEditBands([
                    { key: 'high', label: 'High Functional', min: '85', color: '#16a34a' },
                    { key: 'moderate', label: 'Moderate Functional', min: '50', color: '#f59e0b' },
                    { key: 'low', label: 'Low Functional', min: '', color: '#ef4444' },
                  ])
                }}>ADAC 3-band (85/50)</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  setEditBands([
                    { key: 'ideal', label: 'Ideal', min: '80', color: '#16a34a' },
                    { key: 'mature', label: 'Mature', min: '50', color: '#f59e0b' },
                    { key: 'progressive', label: 'Progressive', min: '20', color: '#f97316' },
                    { key: 'basic', label: 'Basic', min: '', color: '#ef4444' },
                  ])
                }}>LCPC 4-band (80/50/20)</Button>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="text-left p-2 border-b">Order</th>
                    <th className="text-left p-2 border-b">Key</th>
                    <th className="text-left p-2 border-b">Label</th>
                    <th className="text-left p-2 border-b">Min threshold</th>
                    <th className="text-left p-2 border-b">Color</th>
                    <th className="text-left p-2 border-b">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {editBands.map((b, i) => (
                    <tr key={i} className="odd:bg-white even:bg-zinc-50">
                      <td className="p-2 border-b">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => {
                            if (i === 0) return; const arr = editBands.slice(); const t = arr[i-1]; arr[i-1]=arr[i]; arr[i]=t; setEditBands(arr)
                          }}>↑</Button>
                          <Button size="sm" variant="ghost" onClick={() => {
                            if (i === editBands.length-1) return; const arr = editBands.slice(); const t = arr[i+1]; arr[i+1]=arr[i]; arr[i]=t; setEditBands(arr)
                          }}>↓</Button>
                        </div>
                      </td>
                      <td className="p-2 border-b"><Input value={b.key} onChange={(e)=>{
                        const arr = editBands.slice(); arr[i] = { ...b, key: e.target.value }; setEditBands(arr)
                      }} /></td>
                      <td className="p-2 border-b"><Input value={b.label} onChange={(e)=>{
                        const arr = editBands.slice(); arr[i] = { ...b, label: e.target.value }; setEditBands(arr)
                      }} /></td>
                      <td className="p-2 border-b"><Input value={b.min} onChange={(e)=>{
                        const arr = editBands.slice(); arr[i] = { ...b, min: e.target.value }; setEditBands(arr)
                      }} placeholder="e.g. 85 or -Infinity" /></td>
                      <td className="p-2 border-b">
                        <div className="flex items-center gap-2">
                          <Input className="w-40" value={b.color || ''} onChange={(e)=>{
                            const arr = editBands.slice(); arr[i] = { ...b, color: e.target.value }; setEditBands(arr)
                          }} placeholder="CSS color (optional)" />
                          <ColorPicker value={b.color || ''} onChange={(v)=>{
                            const arr = editBands.slice(); arr[i] = { ...b, color: v }; setEditBands(arr)
                          }} />
                        </div>
                      </td>
                      <td className="p-2 border-b">
                        <Button size="sm" variant="outline" onClick={() => {
                          const arr = editBands.slice(); arr.splice(i,1); setEditBands(arr)
                        }}>Remove</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 flex items-center gap-4">
                <Button size="sm" variant="outline" onClick={() => {
                  setEditBands([...editBands, { key: 'band'+(editBands.length+1), label: 'Label', min: '0' }])
                }}>Add Category</Button>
                <div className="text-xs text-muted-foreground">Examples: 40 → {(() => { const arr = editBands.slice().sort((a,b)=> (parseFloat(b.min||'-Infinity')||-Infinity) - (parseFloat(a.min||'-Infinity')||-Infinity)); const f=(v:number)=>{const b=arr.find(x=> (x.min===''||x.min==='-Infinity')? true : v>=Number(x.min)); return b?.label||'-'}; return `${f(40)}` })()} | 60 → {(() => { const arr = editBands.slice().sort((a,b)=> (parseFloat(b.min||'-Infinity')||-Infinity) - (parseFloat(a.min||'-Infinity')||-Infinity)); const f=(v:number)=>{const b=arr.find(x=> (x.min===''||x.min==='-Infinity')? true : v>=Number(x.min)); return b?.label||'-'}; return `${f(60)}` })()} | 90 → {(() => { const arr = editBands.slice().sort((a,b)=> (parseFloat(b.min||'-Infinity')||-Infinity) - (parseFloat(a.min||'-Infinity')||-Infinity)); const f=(v:number)=>{const b=arr.find(x=> (x.min===''||x.min==='-Infinity')? true : v>=Number(x.min)); return b?.label||'-'}; return `${f(90)}` })()}</div>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Finalize actions when everything matches */}
      {lastAuditKey && unmatched.length === 0 && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded border p-2 bg-white">
          <div className="text-sm">Finalize Import for <b>{lastAuditKey}</b> — all rows matched.</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              // Save per‑audit JSON (prompt if key missing)
              let key = (customKey || lastAuditKey || audit).trim().toUpperCase()
              if (!key) { const k = window.prompt('Enter audit key'); if (!k) return; key = k.trim().toUpperCase() }
              try {
                const years = (store.AUDITS?.[key]?.years || []) as number[]
                const rows = (store.CANON?.lgus || []).map((g: any) => {
                  const rec = (g.results?.[key] || {}) as Record<string, any>
                  const o: any = { type: g.type, province: g.province, lgu: g.lgu }
                  years.forEach((y) => { o[String(y)] = rec[String(y)] ?? null })
                  return o
                })
                const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = `${key.toLowerCase()}.json`
                a.click()
                
              } catch (e: any) { addLog('Save Audit JSON failed: ' + (e?.message || String(e))) }
            }}>Save Audit JSON</Button>
            <Button variant="default" size="sm" onClick={async () => {
              if (!window.confirm('Persist current canonical lg-audits.json to a file on disk?')) return;
              const data = JSON.stringify(store.CANON, null, 2);
              // @ts-ignore
              if (window.showSaveFilePicker){
                try {
                  // @ts-ignore
                  const handle = await window.showSaveFilePicker({ suggestedName: 'lg-audits.json', types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
                  const w = await handle.createWritable(); await w.write(new Blob([data], { type: 'application/json' })); await w.close();
                  addLog('Saved canonical JSON via File System Access API.');
                } catch (e:any) { addLog('Save cancelled or failed: ' + (e?.message||String(e))) }
              } else {
                const blob = new Blob([data], { type: 'application/json' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lg-audits.json'; a.click();
                addLog('Browser does not support File System Access; downloaded file instead.');
              }
            }}>Download Data</Button>
            {adminApiAvailable && (<Button variant="default" size="sm" onClick={publishCanonToServer}>Publish Data</Button>)}
          </div>
        </div>
      )}
      {lastAuditKey && unmatched.length === 0 && (
        <div className="mb-3 rounded border bg-white p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm">Preview: Detailed Records for <b>{lastAuditKey}</b></div>
            <div className="text-xs text-muted-foreground">Top 200 rows (sorted by latest year)</div>
          </div>
          <div className="max-h-[480px] overflow-auto rounded border">
            <RecordsTable rows={filterRows().slice(0, 200)} />
          </div>
        </div>
      )}
      {/* Metrics summary and year options */}
      <div className="flex flex-wrap items-end gap-4 mb-3">
        <div className="flex flex-col gap-1 min-w-56">
          <Label className="text-xs">Current Metrics</Label>
          <div className="text-xs border rounded p-2 bg-white">
            {(() => {
              const meta: any = (store.AUDITS || {})[audit] || {}
              if (meta.metric === 'status'){
                const vals = Array.isArray(meta.status_values) && meta.status_values.length >= 2 ? meta.status_values : ['Passer','Non-Passer']
                const thr = meta.pass_threshold ?? 50
                return (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-zinc-100">Status</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border">
                      <span className="w-3 h-3 rounded" style={{ background: hsl('green') }} />
                      <span>{vals[0]}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border">
                      <span className="w-3 h-3 rounded" style={{ background: hsl('red') }} />
                      <span>{vals[1]}</span>
                    </span>
                    <span className="text-muted-foreground">pass ≥ {thr}%</span>
                  </div>
                )
              }
              const resolved = bandsArrayFor(audit) || (Array.isArray(meta.bands) ? meta.bands : null) || (
                meta?.bands?.high_functional != null || meta?.bands?.moderate_functional != null
                  ? [
                      { label: 'High Functional', min: meta.bands.high_functional, color: hsl('green') },
                      { label: 'Moderate Functional', min: meta.bands.moderate_functional, color: hsl('amber') },
                      { label: 'Low Functional', min: -Infinity, color: hsl('red') },
                    ]
                  : [
                      { label: 'High', min: 85, color: hsl('green') },
                      { label: 'Moderate', min: 50, color: hsl('amber') },
                      { label: 'Low', min: -Infinity, color: hsl('red') },
                    ]
              )
              const sorted = resolved.slice().sort((a:any,b:any)=> (b.min===-Infinity? -1 : a.min===-Infinity? 1 : (b.min - a.min)))
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-zinc-100">Score (bands)</span>
                  {sorted.map((b:any, i:number) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded border">
                      <span className="w-3 h-3 rounded" style={{ background: b.color || hsl('sky') }} />
                      <span>{b.label}</span>
                      <span className="text-muted-foreground">{b.min===-Infinity ? 'else' : `≥ ${b.min}`}</span>
                    </span>
                  ))}
                </div>
              )
            })()}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs inline-flex items-center gap-1 mb-1">
            <input type="checkbox" checked={inferYears} onChange={(e) => setInferYears(e.target.checked)} />
            Infer years from file
          </label>
          {!inferYears && (
            <div className="flex flex-col gap-1 w-48">
              <Label className="text-xs">Years (comma-separated)</Label>
              <Input value={customYears} onChange={(e) => setCustomYears(e.target.value)} placeholder="2021,2022,2024" />
            </div>
          )}
        </div>
      </div>
      {/* Column mapping and year selection */}
      {headers.length > 0 && (
        <div className="mb-3 border rounded bg-white p-3 flex flex-col gap-2">
          <div className="text-xs font-medium">Column Mapping</div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 w-56">
              <Label className="text-xs">Province column</Label>
              <Select value={provinceCol} onValueChange={(v) => setProvinceCol(v)}>
                <SelectTrigger><SelectValue placeholder="Select province column" /></SelectTrigger>
                <SelectContent>
                  {headers.map((h) => (<SelectItem key={h} value={h}>{h}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 w-56">
              <Label className="text-xs">City/Municipality column</Label>
              <Select value={lguCol} onValueChange={(v) => setLguCol(v)}>
                <SelectTrigger><SelectValue placeholder="Select LGU column" /></SelectTrigger>
                <SelectContent>
                  {headers.map((h) => (<SelectItem key={h} value={h}>{h}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <label className="text-xs inline-flex items-center gap-1 mb-1">
              <input type="checkbox" checked={includeProvinceRows} onChange={(e) => setIncludeProvinceRows(e.target.checked)} />
              Include province rows
            </label>
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs">Year columns</div>
            <div className="flex flex-wrap gap-3 items-center">
              {(detectedYears.length ? detectedYears : yearCols).map((y) => {
                const checked = yearCols.includes(y)
                return (
                  <label key={y} className="text-xs inline-flex items-center gap-1">
                    <input type="checkbox" checked={checked} onChange={(e) => {
                      setYearCols((prev) => e.target.checked ? Array.from(new Set([...prev, y])) : prev.filter((x) => x !== y))
                    }} />
                    {y}
                  </label>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => runMatchWithState()}>Re-run Match</Button>
            {!!unmatched.length && (
              <>
                <div className="text-xs text-muted-foreground">Suggestions ≥</div>
                <Input className="w-20 h-8" value={String(Math.round(suggestThreshold*100))} onChange={(e) => {
                  const v = Math.max(0, Math.min(100, Number(e.target.value)||0))/100
                  setSuggestThreshold(v)
                }} />
                <div className="text-xs">%</div>
                <Button size="sm" variant="outline" onClick={() => {
                  const applyable = unmatched.filter(u => !!u.key && !!u.suggest && (u.score ?? 0) >= suggestThreshold)
                  if (!applyable.length) { addLog('No suggestions meet the threshold to apply.'); return }
                  const next = { ...aliases }
                  for (const u of applyable){ next[u.key] = u.suggest || '' }
                  setAliases(next)
                  runMatchWithState(next)
                  addLog(`Applied ${applyable.length} alias(es) via Accept All.`)
                }}>Accept All Suggestions</Button>
                <div className="text-xs text-muted-foreground">
                  {unmatched.filter(u => !!u.key && !!u.suggest && (u.score ?? 0) >= suggestThreshold).length} ready
                </div>
                <Button size="sm" variant="outline" onClick={() => {
                  // Export alias CSV
                  const lines = ['unmatched_key,province,lgu,suggested,confidence']
                  unmatched.forEach(u => {
                    const conf = u.score != null ? (u.score*100).toFixed(0) + '%' : ''
                    const esc = (s: any) => {
                      const v = String(s ?? '')
                      return /[",\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v
                    }
                    lines.push([u.key, u.province, u.lgu, u.suggest||'', conf].map(esc).join(','))
                  })
                  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = `${(customKey||audit||'audit').toLowerCase()}-aliases.csv`
                  a.click()
                }}>Export Alias CSV</Button>
                <label className="text-xs inline-flex items-center gap-2">
                  <input type="file" accept=".csv" className="hidden" onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    const txt = await f.text()
                    const { header, rows } = parseCSV(txt)
                    const objs = asObjects(header, rows)
                    const keyCol = header.find(h => h.toLowerCase().includes('unmatched')) || header[0]
                    const sugCol = header.find(h => h.toLowerCase().includes('suggest')) || header[1]
                    const map: Record<string, string> = {}
                    objs.forEach((r: any) => {
                      const k = normalizeName(r[keyCol] || '')
                      const s = String(r[sugCol] || '')
                      if (k && s) map[k] = s
                    })
                    setAliases(prev => ({ ...prev, ...map }))
                    runMatchWithState()
                    // reset input
                    ;(e.target as HTMLInputElement).value = ''
                  }} />
                  <Button size="sm" variant="outline" onClick={(ev) => {
                    const input = (ev.currentTarget.previousSibling as HTMLInputElement)
                    if (input && input.tagName === 'INPUT') input.click()
                  }}>Import Alias CSV</Button>
                </label>
              </>
            )}
          </div>
        </div>
      )}

      {/* Data export/publish actions handled in Finalize banner only */}
      {unmatched.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm">Unmatched preview ({unmatched.length} rows)</div>
            <div />
          </div>
          <div className="overflow-auto border rounded">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="text-left p-2 border-b">Province/HUC</th>
                  <th className="text-left p-2 border-b">City/Municipality</th>
                  <th className="text-left p-2 border-b">Match Key</th>
                  <th className="text-left p-2 border-b">Suggested</th>
                  <th className="text-left p-2 border-b">Action</th>
                </tr>
              </thead>
              <tbody>
                {unmatched.slice(0, 100).map((u, i) => (
                  <tr key={i} className="odd:bg-white even:bg-zinc-50">
                    <td className="p-2 border-b align-top">{u.province}</td>
                    <td className="p-2 border-b align-top">{u.lgu}</td>
                    <td className="p-2 border-b align-top text-muted-foreground">{u.key}</td>
                    <td className="p-2 border-b align-top">{u.suggest} {u.score!=null && (<span className="text-muted-foreground">({Math.round((u.score||0)*100)}%)</span>)}</td>
                    <td className="p-2 border-b align-top">
                      {u.suggest && u.key ? (
                        <Button size="sm" variant="outline" onClick={() => {
                          const next = { ...aliases, [u.key]: u.suggest || '' }
                          setAliases(next)
                          runMatchWithState(next)
                        }}>Apply</Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div className="flex flex-col gap-1 min-w-40">
          <Label className="text-xs">Audit</Label>
          <Select value={audit} onValueChange={(v) => setAudit(v)}>
            <SelectTrigger><SelectValue placeholder="Select audit" /></SelectTrigger>
            <SelectContent>
              {audits.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-56">
          <Label className="text-xs">Or New Audit Key (optional)</Label>
          <Input value={customKey} onChange={(e) => setCustomKey(e.target.value)} placeholder="e.g., POC-2025" />
        </div>
        <Button onClick={exportJSON} variant="outline" size="sm">Export JSON</Button>
        <Button onClick={exportCSV} variant="outline" size="sm">Export CSV</Button>
        <Button onClick={() => inputRef.current?.click()} size="sm">{uploading ? 'Importing…' : 'Import (CSV/JSON)'}</Button>
        {picked && <div className="text-xs text-muted-foreground">{picked}</div>}
        <input ref={inputRef} type="file" accept=".csv,.json" onChange={onImportFileChange} className="hidden" />
      </div>
      {uploading && (<div className="h-1 w-full bg-blue-500/60 animate-pulse rounded mb-2" />)}
      <div className="border rounded bg-white">
        <div className="px-3 py-2 text-xs text-muted-foreground border-b">Logs</div>
        <pre className="p-3 text-xs whitespace-pre-wrap max-h-64 overflow-auto">{log}</pre>
      </div>
    </div>
  )
}







