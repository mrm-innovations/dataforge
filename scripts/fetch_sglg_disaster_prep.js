#!/usr/bin/env node
/**
 * Download SGLG 2024 Disaster Preparedness indicators and build JSON for the app.
 * Source sheet: 1hSiIggm7N20b7ORT9EJUFk9ivRkvjP9ShxYjvPtFMFQ (gid 0)
 * Output: public/sglg_disaster_prep_2024.json
 */
const https = require('https')
const fs = require('node:fs')
const path = require('node:path')

const SHEET_ID = '1hSiIggm7N20b7ORT9EJUFk9ivRkvjP9ShxYjvPtFMFQ'
const GID = '0'
const YEAR = 2024
const CSV_PATH = path.join('datasets', 'sglg_disaster_prep_2024.csv')
const OUTPUT_PATH = path.join('public', 'sglg_disaster_prep_2024.json')

const COLUMNS = [
  ['2023 National Gawad Kalasag (GK)', 'gk_2023', '2023 National Gawad Kalasag'],
  ['LDRRMC Composition Process', 'ldrrmc_composition', 'LDRRMC Composition Process'],
  ['LDRMMC Meetings Process', 'ldrrmc_meetings', 'LDRRMC Meetings Process'],
  ['Functional LDRRMC Process', 'functional_ldrrmc', 'Functional LDRRMC Process'],
  ['LDRRM Officer Process', 'ldrrm_officer', 'LDRRM Officer Process'],
  ['LDRRMO Staff Complement Process', 'ldrrmo_staff', 'LDRRMO Staff Complement Process'],
  ['LDRRMO Workspace', 'ldrrmo_workspace', 'LDRRMO Workspace'],
  ['LDRRMO SAR/ER', 'ldrrmo_sar_er', 'LDRRMO SAR/ER'],
  ['LDRRMO Process', 'ldrrmo_process', 'LDRRMO Process'],
  ['CLUP Processs', 'clup_process', 'CLUP Process'],
  ['LDRRM PLAN', 'ldrrm_plan', 'LDRRM Plan'],
  ['LCCAP', 'lccap', 'LCCAP'],
  ['Contingency Plan (Top 1 hazzard)', 'contingency_plan_top1', 'Contingency Plan (Top 1 hazard)'],
  ['Contingency Plan (Top 2 hazzard)', 'contingency_plan_top2', 'Contingency Plan (Top 2 hazard)'],
  ['Contingency Plan Process', 'contingency_plan_process', 'Contingency Plan Process'],
  ['LDRRM Fund Process', 'ldrrm_fund_process', 'LDRRM Fund Process'],
  ['EWS Process', 'ews_process', 'EWS Process'],
  ['pre-emptive and forced evacuation mechanism', 'evacuation_mechanism', 'Pre-emptive/Forced Evacuation Mechanism'],
  ['EVAC Facilities', 'evac_facilities', 'Evac Facilities'],
  ['Evac Center Process', 'evac_center_process', 'Evac Center Process'],
  ['Prepositioned goods, resources, and services Process', 'prepositioned_goods', 'Prepositioned goods/resources/services'],
  ['Evac Management process Process', 'evac_management_process', 'Evac Management Process'],
  ['LDRRM Operations Center', 'ldrrm_operations_center', 'LDRRM Operations Center'],
  ['Incident Command System Process', 'ics_process', 'Incident Command System Process'],
  ['CBDRRM PLAN Process', 'cbddrm_plan_process', 'CBDRRM Plan Process'],
  ['GK SEAL Process', 'gk_seal_process', 'GK Seal Process'],
  ['DP PROCESSING', 'dp_processing', 'DP Processing'],
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
  const headerRow = headerRowRaw.map((h) => h.replace(/\s+/g, ' ').trim())
  const headers = headerRow
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
      criteria: 'disaster_prep',
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
