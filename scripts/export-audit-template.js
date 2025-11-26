// Export a CSV template for a given audit with official LGU names
// Usage: node scripts/export-audit-template.js POC
const fs = require('fs')
const path = require('path')

const auditKey = process.argv[2]
if (!auditKey) {
  console.error('Usage: node scripts/export-audit-template.js <AUDIT_KEY>')
  process.exit(1)
}

const canon = JSON.parse(fs.readFileSync(path.join(process.cwd(),'public','lg-audits.json'),'utf8'))
const meta = (canon.meta?.audits || {})[auditKey]
if (!meta) {
  console.error(`Audit ${auditKey} not found in lg-audits.json meta`)
  process.exit(1)
}
const years = (meta.years || []).map(String)
const header = ['Province/HUC','City/Municipality', ...years]
const rows = []
for (const g of canon.lgus || []){
  const type = String(g.type || '').toLowerCase()
  if (type === 'province') continue // export LGU-level rows
  const rec = g.results?.[auditKey] || {}
  const vals = years.map((y)=> rec[y] ?? '')
  rows.push([g.province || '', g.lgu || '', ...vals])
}
let csv = header.join(',') + '\n' + rows.map(r => r.map(v => {
  const s = String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s
}).join(',')).join('\n') + '\n'

const outDir = path.join(process.cwd(),'exports')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, `${auditKey}_template.csv`)
fs.writeFileSync(outPath, csv)
console.log(`Wrote ${outPath} (${rows.length} rows)`) 

