// Generic ingest for audits: JSON or CSV
// Usage: node scripts/ingest-audit.js <AUDIT_KEY> <path-to-file.{json|csv}>
// Merges values into public/lg-audits.json using canonical LGU names.
const fs = require('fs')
const path = require('path')

const auditKey = (process.argv[2] || '').toUpperCase()
const inPath = process.argv[3]
if (!auditKey || !inPath) {
  console.error('Usage: node scripts/ingest-audit.js <AUDIT_KEY> <path-to-file.{json|csv}>')
  process.exit(1)
}

const root = process.cwd()
const canonPath = path.join(root, 'public', 'lg-audits.json')
if (!fs.existsSync(canonPath)) throw new Error('public/lg-audits.json not found')

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

function parseCSV(str){
  const rows=[]; let field=''; let row=[]; let inQuotes=false; let i=0; const push=()=>{ row.push(field); field='' }
  while (i < str.length){
    const c = str[i]
    if (inQuotes){
      if (c === '"'){
        if (str[i+1] === '"'){ field+='"'; i++ } else { inQuotes=false }
      } else { field += c }
    } else {
      if (c === '"') { inQuotes=true }
      else if (c === ',') { push() }
      else if (c === '\r') { /* ignore */ }
      else if (c === '\n') { push(); rows.push(row); row=[] }
      else { field += c }
    }
    i++
  }
  push(); rows.push(row)
  // trim any trailing empty line
  if (rows.length && rows[rows.length-1].length===1 && rows[rows.length-1][0]==='') rows.pop()
  const header = rows.shift() || []
  return { header, rows }
}

function asObjects(header, rows){
  return rows.map(r => {
    const o={}; for (let i=0;i<header.length;i++) o[header[i]] = r[i] ?? ''; return o
  })
}

function readInput(p){
  const ext = path.extname(p).toLowerCase()
  const raw = fs.readFileSync(p, 'utf8').replace(/[\u0000-\u0009\u000B-\u001F]/g,'')
  if (ext === '.json') return JSON.parse(raw)
  if (ext === '.csv') {
    const { header, rows } = parseCSV(raw)
    return asObjects(header, rows)
  }
  throw new Error('Unsupported input format: ' + ext)
}

const canon = JSON.parse(fs.readFileSync(canonPath, 'utf8'))
const rows = readInput(inPath)

// Detect year columns
const sample = rows[0] || {}
const yearCols = Object.keys(sample).filter(k => /^\d{4}$/.test(k))

// Build index by normalized LGU/province
const byKey = new Map()
for (const g of canon.lgus || []){
  const k = normalize(g.lgu || g.province)
  if (!byKey.has(k)) byKey.set(k, g)
}

let matched=0, total=0
for (const r of rows){
  total++
  const prov = r['Province/HUC'] || r['Province'] || r['province'] || ''
  const lgu = r['City/Municipality'] || r['LGU'] || r['lgu'] || ''
  const key = normalize(lgu || prov)
  const rec = byKey.get(key)
  if (!rec) continue
  rec.results = rec.results || {}
  const target = rec.results[auditKey] = rec.results[auditKey] || {}
  for (const y of yearCols){ target[y] = toNumber(r[y]) }
  matched++
}

fs.writeFileSync(canonPath, JSON.stringify(canon, null, 2))
console.log(`Ingested ${auditKey} from ${path.basename(inPath)}: matched ${matched}/${total} rows into lg-audits.json`)

