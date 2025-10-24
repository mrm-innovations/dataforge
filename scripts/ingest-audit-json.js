// Ingest a per-audit JSON back into canonical lg-audits.json
// Usage: node scripts/ingest-audit-json.js <AUDIT_KEY> [inPath]
// Expects array rows with fields: { type, province, lgu, <years...> }
const fs = require('fs')
const path = require('path')

const auditKey = (process.argv[2] || '').toUpperCase()
if (!auditKey) {
  console.error('Usage: node scripts/ingest-audit-json.js <AUDIT_KEY> [inPath]')
  process.exit(1)
}

const root = process.cwd()
const canonPath = path.join(root, 'public', 'lg-audits.json')
const inPath = process.argv[3] || path.join(root, 'public', `${auditKey.toLowerCase()}.json`)

function normalize(s){
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

function toNumber(v){
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[%\s]+/g,''))
  return Number.isFinite(n) ? n : null
}

if (!fs.existsSync(canonPath)) throw new Error('public/lg-audits.json not found')
if (!fs.existsSync(inPath)) throw new Error(`input not found: ${inPath}`)
const canon = JSON.parse(fs.readFileSync(canonPath, 'utf8'))
const rows = JSON.parse(fs.readFileSync(inPath, 'utf8').replace(/[\u0000-\u0009\u000B-\u001F]/g,''))

const byKey = new Map()
for (const g of canon.lgus || []){
  const k = normalize(g.lgu || g.province)
  if (!byKey.has(k)) byKey.set(k, g)
}

let matched = 0, total = 0
for (const r of rows){
  total++
  const key = normalize(r.lgu || r.province)
  const rec = byKey.get(key)
  if (!rec) continue
  rec.results = rec.results || {}
  const target = rec.results[auditKey] = rec.results[auditKey] || {}
  for (const k of Object.keys(r)){
    if (/^\d{4}$/.test(k)) target[k] = toNumber(r[k])
  }
  matched++
}

fs.writeFileSync(canonPath, JSON.stringify(canon, null, 2))
console.log(`Ingested ${auditKey}: matched ${matched}/${total} into public/lg-audits.json`)

