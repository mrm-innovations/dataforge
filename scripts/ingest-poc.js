// Merge public/poc.json into public/lg-audits.json as audit "POC"
// Usage: node scripts/ingest-poc.js
const fs = require('fs')
const path = require('path')

const root = process.cwd()
const canonPath = path.join(root, 'public', 'lg-audits.json')
const pocPath = path.join(root, 'public', 'poc.json')

function normalize(s){
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s*\(capital\)/g,'')
    .replace(/^city of\s+/, '')
    .replace(/[^a-z0-9]+/g, '')
}

function loadJson(p){ return JSON.parse(fs.readFileSync(p, 'utf8').replace(/[\u0000-\u0009\u000B-\u001F]/g, '')) }

if (!fs.existsSync(canonPath)) throw new Error('public/lg-audits.json not found')
if (!fs.existsSync(pocPath)) throw new Error('public/poc.json not found')

const canon = loadJson(canonPath)
const pocRows = loadJson(pocPath)

canon.meta = canon.meta || {}
canon.meta.audits = canon.meta.audits || {}
canon.meta.audits.POC = canon.meta.audits.POC || {
  years: [2021, 2022, 2023],
  metric: 'score',
  bands: { high_functional: 85, moderate_functional: 50 },
  labels: { band_high: 'High Performing', band_moderate: 'Moderate Performing', band_low: 'Low Performing' },
}

const byKey = new Map()
for (const g of canon.lgus || []){
  const k = normalize(g.lgu || g.province)
  if (!byKey.has(k)) byKey.set(k, g)
}

let matched = 0
for (const row of pocRows){
  const prov = row.province || row.Province || ''
  const lgu = row.lgu || row.City || row.Municipality || row['City/Municipality'] || ''
  const key = normalize(lgu || prov)
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
  matched++
}

fs.writeFileSync(canonPath, JSON.stringify(canon, null, 2))
console.log(`Merged POC rows into lg-audits.json (matched ${matched}/${pocRows.length})`)


