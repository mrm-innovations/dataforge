#!/usr/bin/env node
/**
 * Download SGLG 2024 Social Protection and Sensitivity indicators and build JSON for the app.
 * Source sheet: 1WQqBqqMzOpV46vI6ixvTOGcwddLqTa46mj_yK1tqBPU (gid 0)
 * Output: public/sglg_social_protection_2024.json
 */
const https = require('https')
const fs = require('node:fs')
const path = require('node:path')

const SHEET_ID = '1WQqBqqMzOpV46vI6ixvTOGcwddLqTa46mj_yK1tqBPU'
const GID = '0'
const YEAR = 2024
const CSV_PATH = path.join('datasets', 'sglg_social_protection_2024.csv')
const OUTPUT_PATH = path.join('public', 'sglg_social_protection_2024.json')

const COLUMNS = [
  ['CFLG Awardee Process', 'cflg_awardee', 'CFLG Awardee Process'],
  ['LGU Passing Rate Process', 'lgu_passing_rate', 'LGU Passing Rate Process'],
  ['CFLGA Indicators Compliance Process', 'cflga_indicators_compliance', 'CFLGA Indicators Compliance Process'],
  ['CFLGA Process', 'cflga_process', 'CFLGA Process'],
  ['Updated GAD Code', 'gad_code', 'Updated GAD Code'],
  ['GAD Plan and Budget Process', 'gad_plan_budget', 'GAD Plan and Budget Process'],
  ['GAD Accomplishment Process', 'gad_accomplishment', 'GAD Accomplishment Process'],
  ['GAD Mechanism Process', 'gad_mechanism', 'GAD Mechanism Process'],
  ['VAWC Process', 'vawc_process', 'VAWC Process'],
  ['SFP Process', 'sfp_process', 'SFP Process'],
  ['Local Code for Children Process', 'local_code_children', 'Local Code for Children Process'],
  ['LGU Building Process', 'lgu_building', 'LGU Building Process'],
  ['Health Facilities Process', 'health_facilities', 'Health Facilities Process'],
  ['LGU Tertiary Educ Facility Process', 'tertiary_educ_facility', 'LGU Tertiary Educ Facility Process'],
  ['Compliance with Accessibility Law Process', 'accessibility_law', 'Compliance with Accessibility Law Process'],
  ['PDAO Head Recruitment Process', 'pdao_head_recruitment', 'PDAO Head Recruitment Process'],
  ['PDAO Process', 'pdao_process', 'PDAO Process'],
  ['Sign language interpreter in every LGU Process', 'sign_language_interpreter', 'Sign language interpreter in every LGU Process'],
  ['Established Senior Citizens Center (SCC)', 'senior_citizens_center', 'Established Senior Citizens Center (SCC)'],
  ['Indigenous Peoples Mandatory Representation (IPMR) in the Sanggunian', 'ipmr', 'IPMR in the Sanggunian'],
  ['Absence of illegal dwelling units OR LGU efforts to address informal settlements', 'illegal_dwelling_efforts', 'Absence of illegal dwelling units / efforts to address informal settlements'],
  ['Programs and projects for SCs and PWDs', 'programs_scs_pwds', 'Programs and projects for SCs and PWDs'],
  ['1% of IRA/NTA allocation for LCPC', 'ira_lcpc', '1% of IRA/NTA allocation for LCPC'],
  ['Utilization of funds for the marginalized sectors: SCs/PWDs and LCPC', 'utilization_marginalized', 'Utilization of funds for marginalized sectors'],
  ['LGU-managed residential care facility for the vulnerable sectors', 'residential_care_facility', 'LGU-managed residential care facility for vulnerable sectors'],
  ['4Ps Process', 'four_ps_process', '4Ps Process'],
  ['LSWDO Appointment', 'lswdo_appointment', 'LSWDO Appointment'],
  ['social workers provided with any two the following Magna Carta grant benefits', 'social_workers_benefits', 'Social workers with Magna Carta benefits'],
  ['CBMS', 'cbms', 'CBMS'],
  ['LSWDO', 'lswdo', 'LSWDO'],
  ['LGU efforts on mainstreaming social protection', 'mainstream_social_protection', 'LGU efforts on mainstreaming social protection'],
  ['PESO', 'peso', 'PESO'],
  ['Functional local development council (LDC)', 'functional_ldc', 'Functional LDC'],
  ['Satisfactory participation of civil society organizations (CSOs) in LDC', 'csos_participation_ldc', 'CSO participation in LDC'],
  ['LDC', 'ldc', 'LDC'],
  ['Establishment of Population Office with appointed or designated Population Officer', 'population_office', 'Population Office with appointed/designated officer'],
  ['Teen Center', 'teen_center', 'Teen Center'],
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
      criteria: 'social_protection',
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
