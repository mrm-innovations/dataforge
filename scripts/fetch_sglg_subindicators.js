#!/usr/bin/env node
/**
 * Download SGLG 2024 subindicator data from Google Sheets and build JSON for the app.
 * Output: public/sglg_subindicators_2024.json
 */
const https = require('https')
const fs = require('node:fs')
const path = require('node:path')

const SHEET_ID = '1GmO5gJDu4bY-s97WzvlR5E_lXSc9Sv9Twi3pwn_78TE'
const GID = '0'
const CSV_PATH = path.join('datasets', 'sglg_subindicators_2024.csv')
const OUTPUT_PATH = path.join('public', 'sglg_subindicators_2024.json')
const YEAR = 2024

const CATEGORY_MAP = [
  ['FINANCIAL ADMIN', 'financial_admin', 'Financial Administration'],
  ['DISASTER PREP', 'disaster_prep', 'Disaster Preparedness'],
  ['SOCIAL PROTECTION', 'social_protection', 'Social Protection'],
  ['HEALTH COMPLIANCE', 'health_compliance', 'Health Compliance'],
  ['SUSTAINABLE EDUCATION', 'sustainable_education', 'Sustainable Education'],
  ['BUSINESS FRIENDLINESS', 'business_friendliness', 'Business Friendliness'],
  ['SAFETY PEACE AND ORDER', 'peace_order', 'Safety, Peace, and Order'],
  ['ENVIRONMENTAL MANAGEMENT', 'environment', 'Environmental Management'],
  [
    'TOURISM, HERITAGE DEVELOPMENT, CULTURE AND THE ARTS',
    'tourism_culture_arts',
    'Tourism, Heritage Dev, Culture and the Arts',
  ],
  ['YOUTH DEVELOPMENT', 'youth_dev', 'Youth Development'],
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
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
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
  // flush last field
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function normStatus(value) {
  if (!value) return null
  const s = String(value).trim().toLowerCase()
  if (!s) return null
  if (s.startsWith('pass')) return 'passed'
  if (s.startsWith('fail')) return 'failed'
  return s
}

async function main() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`
  console.log('Downloading CSV...')
  const csvText = await fetchCsv(url)
  fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true })
  fs.writeFileSync(CSV_PATH, csvText, 'utf8')
  console.log(`Saved ${CSV_PATH}`)

  const rows = parseCsv(csvText)
  if (!rows.length) throw new Error('CSV was empty')
  const [headerRow, ...dataRows] = rows
  const headers = headerRow.map((h) => h.trim())

  const records = []
  const headerIndex = (name) => headers.indexOf(name)

  for (const r of dataRows) {
    const get = (name) => {
      const idx = headerIndex(name)
      return idx >= 0 ? r[idx] : ''
    }
    const lgu = (get('LGU NAME') || '').trim()
    if (!lgu) continue
    const region = (get('REGION') || '').trim()
    const province = (get('PROVINCE') || '').trim()
    const passedAreasRaw = (get('No.s of passed areas') || get('No. of passed areas') || '').trim()
    const passed_areas = passedAreasRaw && !isNaN(Number(passedAreasRaw)) ? Number(passedAreasRaw) : null

    const categories = CATEGORY_MAP.map(([header, key, label]) => {
      const status = normStatus(get(header))
      return status ? { key, label, status } : null
    }).filter(Boolean)

    records.push({
      region,
      province,
      lgu,
      year: YEAR,
      overall: normStatus(get('OVERALL RESULT')),
      passed_areas,
      categories,
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
