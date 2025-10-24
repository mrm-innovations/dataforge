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

export function SettingsView(){
  const [audit, setAudit] = useState<string>('ADAC')
  const [customKey, setCustomKey] = useState<string>('')
  const [log, setLog] = useState<string>('Ready.')
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
    try {
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
      const yearCols = Object.keys(sample).filter((k) => /^\d{4}$/.test(k))
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
        metaRoot.meta.audits[targetAudit] = { years: yearCols.map((y) => Number(y)), metric: 'score', bands: { high_functional: 85, moderate_functional: 50 } }
        ;(store as any).AUDITS[targetAudit] = metaRoot.meta.audits[targetAudit]
        addLog(`Created new audit meta: ${targetAudit} (years: ${yearCols.join(', ')})`)
      }
      let matched = 0, total = 0
      const unmatched: Array<{ province: string; lgu: string; key: string }> = []
      rows.forEach((r: any) => {
        total++
        const prov = r['Province/HUC'] || r['Province'] || r['province'] || ''
        const lgu = r['City/Municipality'] || r['LGU'] || r['lgu'] || ''
        const key = normalizeName(lgu || prov)
        const rec = byKey.get(key)
        if (!rec){ unmatched.push({ province: prov, lgu, key }); return }
        rec.results = rec.results || {}
        const target = rec.results[targetAudit] = rec.results[targetAudit] || {}
        yearCols.forEach((y) => { target[y] = toNumber(r[y]) })
        matched++
      })

      addLog(`Ingested ${targetAudit}: matched ${matched}/${total}. Unmatched: ${unmatched.length}.`)
      if (unmatched.length){
        const lines = unmatched.map(u => `${u.province}\t${u.lgu}\t(${u.key})`).join('\n')
        const blob = new Blob([lines], { type: 'text/plain' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${targetAudit.toLowerCase()}-unmatched.txt`
        a.click()
      }
      // Offer updated canonical JSON for download
      const canonBlob = new Blob([JSON.stringify(store.CANON, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(canonBlob)
      a.download = 'lg-audits.updated.json'
      a.click()
    } catch (err: any) {
      addLog('Import failed: ' + (err?.message || String(err)))
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium">Settings</h2>
      </div>
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
        <label className="text-sm ml-4">Import (CSV/JSON)</label>
        <input ref={inputRef} type="file" accept=".csv,.json" onChange={onImportFileChange} className="text-sm" />
      </div>
      <div className="border rounded bg-white">
        <div className="px-3 py-2 text-xs text-muted-foreground border-b">Logs</div>
        <pre className="p-3 text-xs whitespace-pre-wrap max-h-64 overflow-auto">{log}</pre>
      </div>
    </div>
  )
}
