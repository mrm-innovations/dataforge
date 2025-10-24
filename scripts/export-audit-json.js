// Export a per-audit JSON from canonical lg-audits.json
// Usage: node scripts/export-audit-json.js <AUDIT_KEY> [outPath]
// Writes to public/<audit>.json by default.
const fs = require('fs')
const path = require('path')

const auditKey = (process.argv[2] || '').toUpperCase()
if (!auditKey) {
  console.error('Usage: node scripts/export-audit-json.js <AUDIT_KEY> [outPath]')
  process.exit(1)
}

const root = process.cwd()
const canonPath = path.join(root, 'public', 'lg-audits.json')
const cfgPath = path.join(root, 'public', 'audits.config.json')
const outPath = process.argv[3] || path.join(root, 'public', `${auditKey.toLowerCase()}.json`)

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

const rows = []
for (const g of canon.lgus || []){
  const t = String(g.type || '').toLowerCase()
  // include both province/huc and lgu rows
  const rec = g.results?.[auditKey] || {}
  const out = {
    type: g.type,
    province: g.province,
    lgu: g.lgu,
  }
  for (const y of years) out[String(y)] = rec?.[String(y)] ?? null
  rows.push(out)
}

fs.writeFileSync(outPath, JSON.stringify(rows, null, 2))
console.log(`Exported ${auditKey} to ${path.relative(root, outPath)} (${rows.length} rows; years: ${years.join(', ')})`)

