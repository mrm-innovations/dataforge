#!/usr/bin/env node
/**
 * Download SGLG 2024 Sustainable Education indicators and build JSON for the app.
 * Source sheet: 1NBbiAPkMN0Uhr4sUB5EFzaNwGP0UEtppHiXCPYKyQMQ (gid 0)
 * Output: public/sglg_sustainable_education_2024.json
 */
const https = require('https')
const fs = require('node:fs')
const path = require('node:path')

const SHEET_ID = '1NBbiAPkMN0Uhr4sUB5EFzaNwGP0UEtppHiXCPYKyQMQ'
const GID = '0'
const YEAR = 2024
const CSV_PATH = path.join('datasets', 'sglg_sustainable_education_2024.csv')
const OUTPUT_PATH = path.join('public', 'sglg_sustainable_education_2024.json')

const COLUMNS = [
  ['LSB Process', 'lsb_process', 'LSB Process'],
  ['Special Education Fund Process', 'special_education_fund_process', 'Special Education Fund Process'],
  ['Support to programs and projects that promote inclusive education in CY 2022', 'inclusive_education_support', 'Support to programs and projects that promote inclusive education in CY 2022'],
  ['ECCD Process', 'eccd_process', 'ECCD Process'],
  ['TVET Process', 'tvet_process', 'TVET Process'],
  ['Overall Process', 'overall_process', 'Overall Process'],
]

function fetchCsv(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} fetching CSV`))
          return
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      })
      .on('error', reject)
  })
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') {
        row.push(field)
        field = ''
      } else if (ch === '\r') {
        continue
      } else if (ch === '\n') {
        row.push(field)
        rows.push(row)
        row = []
        field = ''
      } else {
        field += ch
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function normStatusFromValue(val) {
  const n = Number(val)
  if (!Number.isFinite(n)) return { value: null, status: null }
  if (n === 0) return { value: n, status: 'failed' }
  if (n === 1) return { value: n, status: 'met' }
  if (n === 2) return { value: n, status: 'consideration' }
  if (n === 3) return { value: n, status: 'na' }
  return { value: n, status: null }
}

async function main() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`
  console.log('Downloading CSV...')
  const csvText = await fetchCsv(url)
  fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true })
  fs.writeFileSync(CSV_PATH, csvText, 'utf8')
  console.log(`Saved ${CSV_PATH}`)

  const rows = parseCsv(csvText)
  if (!rows.length) throw new Error('CSV empty')
  const [headerRowRaw, ...dataRows] = rows
  const headers = headerRowRaw.map((h) => h.replace(/\s+/g, ' ').trim())
  const idx = (name) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase())
  const get = (r, name) => {
    const i = idx(name)
    return i >= 0 ? r[i] : ''
  }

  const records = []
  for (const r of dataRows) {
    const lgu = (get(r, 'LGU NAME') || '').trim()
    const province = (get(r, 'PROVINCE') || '').trim()
    if (!lgu) continue
    const type = (get(r, 'LGU TYPE') || '').trim()

    const indicators = COLUMNS.map(([col, key, label]) => {
      const { value, status } = normStatusFromValue(get(r, col))
      return { key, label, value, status }
    }).filter((x) => x.value !== null)

    records.push({
      province,
      lgu,
      type,
      year: YEAR,
      criteria: 'sustainable_education',
      indicators,
    })
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(records, null, 2), 'utf8')
  console.log(`Wrote ${records.length} records to ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
