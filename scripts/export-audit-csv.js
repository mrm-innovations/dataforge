// Export a per-audit CSV from canonical lg-audits.json
// Usage: node scripts/export-audit-csv.js <AUDIT_KEY> [outPath]
// Writes to public/<audit>.csv by default.
const fs = require('fs')
const path = require('path')

const auditKey = (process.argv[2] || '').toUpperCase()
if (!auditKey) {
  console.error('Usage: node scripts/export-audit-csv.js <AUDIT_KEY> [outPath]')
  process.exit(1)
}

const root = process.cwd()
const canonPath = path.join(root, 'public', 'lg-audits.json')
const cfgPath = path.join(root, 'public', 'audits.config.json')
const outPath = process.argv[3] || path.join(root, 'public', `${auditKey.toLowerCase()}.csv`)

if (!fs.existsSync(canonPath)) throw new Error('public/lg-audits.json not found')
const canon = JSON.parse(fs.readFileSync(canonPath, 'utf8'))
let years = (canon.meta?.audits?.[auditKey]?.years || [])
try {
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  const fromCfg = cfg?.[auditKey]?.years
  if ((!years || !years.length) && Array.isArray(fromCfg)) years = fromCfg
} catch {}
if (!years || !years.length) {
  // Derive from present result keys, if any
  const sample = (canon.lgus || []).map(g => Object.keys(g?.results?.[auditKey] || {})).flat()
  years = Array.from(new Set(sample)).map(y => +y).filter(Boolean).sort((a,b)=>a-b)
}

const header = ['Type','Province/HUC','City/Municipality', ...years.map(String)]
const rows = []
for (const g of canon.lgus || []){
  const rec = g.results?.[auditKey] || {}
  const line = [g.type || '', g.province || '', g.lgu || '']
  for (const y of years) line.push(rec?.[String(y)] ?? '')
  rows.push(line)
}

function csvEscape(s){
  const v = String(s)
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v
}

let csv = header.map(csvEscape).join(',') + '\n' + rows.map(r => r.map(csvEscape).join(',')).join('\n') + '\n'
fs.writeFileSync(outPath, csv)
console.log(`Exported ${auditKey} CSV to ${path.relative(root, outPath)} (${rows.length} rows; years: ${years.join(', ')})`)

