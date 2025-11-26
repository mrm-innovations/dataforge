// Update public/lg-audits.json to add LCPC audit and results
// Usage: node scripts/add-lcpc.js

const fs = require('fs')
const path = require('path')

const file = path.resolve(process.cwd(), 'public', 'lg-audits.json')
const raw = fs.readFileSync(file, 'utf8')
const canon = JSON.parse(raw)

// LCPC meta
canon.meta = canon.meta || {}
canon.meta.audits = canon.meta.audits || {}
canon.meta.audits.LCPC = {
  years: [2022, 2023, 2024],
  metric: 'score',
  // Map to app's generic thresholds: red/orange/green
  // red: < near (20), orange: [20..compliant-1]=[20..79], green: >= compliant (80)
  bands: { near: 20, compliant: 80, elite: 100 },
  labels: {
    below: 'Basic (<20%)',
    near: 'Progressive (≥20%)',
    compliant: 'Mature (≥50%)',
    elite: 'Ideal (≥80%)'
  }
}

// Normalization helper to match user-provided names to dataset
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ñ/g, 'n')
    .replace(/nio/gi, 'nino')
    .replace(/^city of\s+/,'')
    .replace(/\scity$/,'')
    .replace(/\bpres\.?\b/g, 'president')
    .replace(/\bsto\.?\b/g, 'santo')
    .replace(/[^a-z0-9]+/g, '')
}

function applyAliases(n) {
  // handle known spelling variants
  if (n === 'pigcawayan') return 'pigkawayan'
  return n
}

// Build index of LGUs and Province rows
const entries = canon.lgus || []
const byNormLgu = new Map()
const byNormProvince = new Map()
for (const g of entries) {
  const lguName = g.lgu || ''
  const provName = g.province || ''
  const type = String(g.type || '').toLowerCase()
  if (lguName) byNormLgu.set(norm(lguName), g)
  // Province rows (type: Province) use lgu as the province name in this file
  if (type === 'province') {
    byNormProvince.set(norm(lguName || provName), g)
  }
}

// LCPC values from user
const rows = [
  // Province/HUC header groups are mixed; we just map by name
  { name: 'COTABATO', y2022: 81.69, y2023: 82.83, y2024: 87.63 },
  { name: 'Alamada', y2022: 92.86, y2023: 90.00, y2024: 97.66 },
  { name: 'Aleosan', y2022: 81.11, y2023: 95.26, y2024: 92.91 },
  { name: 'Antipas', y2022: 58.17, y2023: 62.00, y2024: 85.23 },
  { name: 'Arakan', y2022: 87.26, y2023: 97.66, y2024: 89.26 },
  { name: 'Banisilan', y2022: 59.86, y2023: 58.14, y2024: 76.31 },
  { name: 'Carmen', y2022: 72.23, y2023: 76.09, y2024: 81.69 },
  { name: 'Kabacan', y2022: 87.46, y2023: 86.00, y2024: 94.11 },
  { name: 'Kidapawan City', y2022: 87.20, y2023: 94.00, y2024: 90.23 },
  { name: 'Libungan', y2022: 57.00, y2023: 84.83, y2024: 100.00 },
  { name: 'Magpet', y2022: 88.26, y2023: 88.26, y2024: 80.03 },
  { name: 'Makilala', y2022: 86.46, y2023: 86.86, y2024: 82.94 },
  { name: 'Matalam', y2022: 51.06, y2023: 84.71, y2024: 80.57 },
  { name: 'Midsayap', y2022: 95.26, y2023: 94.00, y2024: 83.51 },
  { name: 'Mlang', y2022: 82.06, y2023: 86.26, y2024: 96.46 },
  { name: 'Pigcawayan', y2022: 88.23, y2023: 96.46, y2024: 96.40 },
  { name: 'Pikit', y2022: 80.26, y2023: 92.26, y2024: 96.46 },
  { name: 'Pres. Roxas', y2022: 74.83, y2023: 85.23, y2024: 92.31 },
  { name: 'Tulunan', y2022: 85.77, y2023: 92.51, y2024: 93.03 },

  { name: 'SARANGANI', y2022: 67.14, y2023: 67.14, y2024: 70.71 },
  { name: 'Alabel', y2022: 76.00, y2023: 71.74, y2024: 57.17 },
  { name: 'Glan', y2022: 54.20, y2023: 65.94, y2024: 78.25 },
  { name: 'Kiamba', y2022: 50.00, y2023: 56.40, y2024: 64.20 },
  { name: 'Maasim', y2022: 59.70, y2023: 72.34, y2024: 65.28 },
  { name: 'Maitum', y2022: 60.00, y2023: 60.65, y2024: 65.57 },
  { name: 'Malapatan', y2022: 82.90, y2023: 90.68, y2024: 94.17 },
  { name: 'Malungon', y2022: 65.00, y2023: 72.94, y2024: 84.17 },

  { name: 'SOUTH COTABATO', y2022: 69.46, y2023: 69.46, y2024: 82.23 },
  { name: 'Banga', y2022: 39.00, y2023: 43.80, y2024: 37.49 },
  { name: 'Koronadal City', y2022: 89.00, y2023: 78.10, y2024: 82.54 },
  { name: 'Lake Sebu', y2022: 39.00, y2023: 43.20, y2024: 94.06 },
  { name: 'Norala', y2022: 53.00, y2023: 76.50, y2024: 66.57 },
  { name: 'Polomolok', y2022: 76.00, y2023: 83.60, y2024: 82.37 },
  { name: 'Sto Niño', y2022: 64.00, y2023: 60.60, y2024: 90.51 },
  { name: 'Surallah', y2022: 76.00, y2023: 82.00, y2024: 85.77 },
  { name: 'Tampakan', y2022: 53.00, y2023: 66.60, y2024: 94.17 },
  { name: 'Tantangan', y2022: 65.00, y2023: 70.20, y2024: 66.51 },
  { name: 'Tboli', y2022: 0.00, y2023: 56.20, y2024: 86.31 },
  { name: 'Tupi', y2022: 77.00, y2023: 75.10, y2024: 68.94 },

  { name: 'SULTAN KUDARAT', y2022: 84.83, y2023: 84.83, y2024: 83.09 },
  { name: 'Bagumbayan', y2022: 95.26, y2023: 93.40, y2024: 94.06 },
  { name: 'Columbio', y2022: 79.31, y2023: 80.34, y2024: 80.71 },
  { name: 'Esperanza', y2022: 52.80, y2023: 66.20, y2024: 82.49 },
  { name: 'Isulan', y2022: 57.66, y2023: 67.51, y2024: 77.63 },
  { name: 'Kalamansig', y2022: 83.34, y2023: 90.46, y2024: 92.26 },
  { name: 'Lambayong', y2022: 63.71, y2023: 86.86, y2024: 85.06 },
  { name: 'Lebak', y2022: 66.11, y2023: 75.31, y2024: 89.46 },
  { name: 'Lutayan', y2022: 83.60, y2023: 82.86, y2024: 83.74 },
  { name: 'Palimbang', y2022: 75.26, y2023: 87.46, y2024: 92.26 },
  { name: 'Pres. Quirino', y2022: 80.37, y2023: 82.60, y2024: 89.91 },
  { name: 'Sen. Ninoy Aquino', y2022: 76.86, y2023: 64.46, y2024: 81.26 },
  { name: 'Tacurong City', y2022: 66.00, y2023: 81.63, y2024: 74.49 },

  { name: 'GENERAL SANTOS CITY', y2022: 63.97, y2023: 63.97, y2024: 72.77 },
]

function setLcpcResult(g, y2022, y2023, y2024) {
  g.results = g.results || {}
  const rec = g.results.LCPC || {}
  if (y2022 != null) rec['2022'] = +y2022
  if (y2023 != null) rec['2023'] = +y2023
  if (y2024 != null) rec['2024'] = +y2024
  g.results.LCPC = rec
}

const missing = []
for (const r of rows) {
  const key = applyAliases(norm(r.name))
  let target = byNormLgu.get(key) || byNormProvince.get(key)
  if (!target) {
    // Try mapping common variants
    let alt = key
    // city name variants
    if (!alt.includes('city')) {
      const withCity = alt + 'city'
      target = byNormLgu.get(withCity)
    }
  }
  if (!target) {
    missing.push(r.name)
    continue
  }
  setLcpcResult(target, r.y2022, r.y2023, r.y2024)
}

if (missing.length) {
  console.warn('LCPC: Did not match these names (check spelling/aliases):', missing)
}

fs.writeFileSync(file, JSON.stringify(canon, null, 2) + '\n', 'utf8')
console.log('LCPC audit added/updated in public/lg-audits.json')
