import React, { useMemo, useRef, useState } from 'react'
import { store } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
  const [audit, setAudit] = useState<string>('ADAC')
  const [customKey, setCustomKey] = useState<string>('')
  const [log, setLog] = useState<string>('Ready.')
  const [uploading, setUploading] = useState<boolean>(false)
  const [picked, setPicked] = useState<string>('')
  // New-audit options
  const [metric, setMetric] = useState<'score' | 'status'>('score')
  const [highThr, setHighThr] = useState<string>('85')
  const [modThr, setModThr] = useState<string>('50')
  const [passThr, setPassThr] = useState<string>('50')
  const [inferYears, setInferYears] = useState<boolean>(true)
  const [customYears, setCustomYears] = useState<string>('')
  const [unmatched, setUnmatched] = useState<Array<{ province: string; lgu: string; key: string }>>([])
  const [lastAuditKey, setLastAuditKey] = useState<string>('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const audits = useMemo(() => Object.keys(store.AUDITS || {}), [])

  function addLog(line: string){ setLog((l) => l + "\n" + line) }

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

  async function onImportFileChange(e: React.ChangeEvent<HTMLInputElement>){
    const f = e.target.files?.[0]
    if (!f) return
    setPicked(f.name)
    try {
      setUploading(true)
      const text = await f.text()
      const ext = f.name.toLowerCase().split('.').pop()
      let rows: any[] = []
      if (ext === 'json') {
        rows = JSON.parse(text.replace(/[\u0000-\u0009\u000B-\u001F]/g,''))
      } else if (ext === 'csv') {
        const { header, rows: data } = parseCSV(text)
        rows = asObjects(header, data)
      } else {
        throw new Error('Unsupported file type: ' + ext)
      }

      const sample = rows[0] || {}
      let yearCols = Object.keys(sample).filter((k) => /^\d{4}$/.test(k))
      if (!inferYears) {
        const parsed = (customYears || '').split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
        if (parsed.length) yearCols = parsed
      }
      const byKey = new Map<string, any>()
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
        metaRoot.meta.audits[targetAudit] = metric === 'status'
          ? { years: yearCols.map((y:any) => Number(y)), metric: 'status', status_values: ['Passer','Non-Passer'] }
          : { years: yearCols.map((y:any) => Number(y)), metric: 'score', bands: { high_functional: Number(highThr) || 85, moderate_functional: Number(modThr) || 50 } }
        ;(store as any).AUDITS[targetAudit] = metaRoot.meta.audits[targetAudit]
        addLog(`Created new audit meta: ${targetAudit} (metric: ${metric}; years: ${yearCols.join(', ')})`)
      }
      let matched = 0, total = 0
      const miss: Array<{ province: string; lgu: string; key: string }> = []
      rows.forEach((r: any) => {
        total++
        const prov = getVal(r, ['Province/HUC','PROVINCE/HUC','Province','PROVINCE','Prov','HUC','province','province/huc'])
        const lgu  = getVal(r, ['City/Municipality','CITY/MUNICIPALITY','City/MUN','CITY/MUN','City','CITY','Municipality','MUNICIPALITY','LGU','lgu','city','municipality'])
        const key = normalizeName(lgu || prov)
        const rec = byKey.get(key)
        if (!rec){ miss.push({ province: prov, lgu, key }); return }
        rec.results = rec.results || {}
        const target = rec.results[targetAudit] = rec.results[targetAudit] || {}
        yearCols.forEach((y:any) => {
          if (metric === 'status'){
            const raw = r[String(y)]
            const s = String(raw ?? '').trim().toLowerCase()
            let val: 'Passer' | 'Non-Passer' | '' = ''
            if (s === 'passer' || s === 'pass' || s === 'passed') val = 'Passer'
            else if (s === 'non-passer' || s === 'fail' || s === 'failed') val = 'Non-Passer'
            else {
              const n = Number(String(raw ?? '').replace(/[%\s]+/g,''))
              if (Number.isFinite(n)) val = n >= (Number(passThr)||50) ? 'Passer' : 'Non-Passer'
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
    } catch (err: any) {
      addLog('Import failed: ' + (err?.message || String(err)))
    } finally {
      if (inputRef.current) inputRef.current.value = ''
      setUploading(false)
    }
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

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium">Settings</h2>
      </div>
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
            }}>Persist lg-audits.json</Button>
          </div>
        </div>
      )}
      {/* New-audit options */}
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div className="flex flex-col gap-1 w-40">
          <Label className="text-xs">Metric</Label>
          <Select value={metric} onValueChange={(v) => setMetric(v as any)}>
            <SelectTrigger><SelectValue placeholder="Metric" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Score (thresholds)</SelectItem>
              <SelectItem value="status">Status (Passer/Non-Passer)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {metric === 'score' ? (
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1 w-28">
              <Label className="text-xs">High ≥</Label>
              <Input value={highThr} onChange={(e) => setHighThr(e.target.value)} placeholder="85" />
            </div>
            <div className="flex flex-col gap-1 w-28">
              <Label className="text-xs">Moderate ≥</Label>
              <Input value={modThr} onChange={(e) => setModThr(e.target.value)} placeholder="50" />
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1 w-36">
              <Label className="text-xs">Pass threshold %</Label>
              <Input value={passThr} onChange={(e) => setPassThr(e.target.value)} placeholder="50" />
            </div>
          </div>
        )}
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
      {/* Persist canonical JSON to disk via File System Access API */}
      <div className="mb-3">
        <Button variant="outline" size="sm" onClick={async () => {
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
        }}>Persist lg-audits.json</Button>
      </div>
      {unmatched.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm">Unmatched preview ({unmatched.length} rows)</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={downloadUnmatched}>Download Unmatched</Button>
              <Button variant="outline" size="sm" onClick={downloadCanonical}>Download Canonical JSON</Button>
            </div>
          </div>
          <div className="overflow-auto border rounded">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="text-left p-2 border-b">Province/HUC</th>
                  <th className="text-left p-2 border-b">City/Municipality</th>
                  <th className="text-left p-2 border-b">Match Key</th>
                </tr>
              </thead>
              <tbody>
                {unmatched.slice(0, 100).map((u, i) => (
                  <tr key={i} className="odd:bg-white even:bg-zinc-50">
                    <td className="p-2 border-b align-top">{u.province}</td>
                    <td className="p-2 border-b align-top">{u.lgu}</td>
                    <td className="p-2 border-b align-top text-muted-foreground">{u.key}</td>
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
