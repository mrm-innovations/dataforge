// Sync dist assets to static hosting locations and update index.html hashes
// Usage: node scripts/sync-static.js
const fs = require('fs')
const path = require('path')

const root = process.cwd()
const distHtml = path.join(root, 'dist', 'src_entry.html')
const indexHtml = path.join(root, 'index.html')
const distAssets = path.join(root, 'dist', 'assets')
const staticAssets = path.join(root, 'assets')

if (!fs.existsSync(distHtml)) throw new Error('dist/src_entry.html not found. Build first.')
const dist = fs.readFileSync(distHtml, 'utf8')

// Extract the hashed JS and CSS from dist HTML
const jsMatch = dist.match(/<script[^>]+src="([^"]*src_entry-[^"]+\.js)"/)
const cssMatch = dist.match(/<link[^>]+href="([^"]*src_entry-[^"]+\.css)"/)
if (!jsMatch) throw new Error('Could not find hashed JS in dist HTML')
if (!cssMatch) throw new Error('Could not find hashed CSS in dist HTML')

const jsPath = jsMatch[1]
const cssPath = cssMatch[1]

// Update index.html to reference the latest assets
let idx = fs.readFileSync(indexHtml, 'utf8')
idx = idx.replace(/<script[^>]+src="[^"]*src_entry-[^"]+\.js"[^>]*><\/script>/, `<script type="module" crossorigin src="${jsPath}"></script>`)
idx = idx.replace(/<link[^>]+href="[^"]*src_entry-[^"]+\.css"[^>]*>/, `<link rel="stylesheet" crossorigin href="${cssPath}">`)
fs.writeFileSync(indexHtml, idx, 'utf8')

// Copy dist/assets/* -> assets/
fs.mkdirSync(staticAssets, { recursive: true })
for (const entry of fs.readdirSync(distAssets)) {
  fs.copyFileSync(path.join(distAssets, entry), path.join(staticAssets, entry))
}

console.log('Synced index.html and copied dist/assets to assets/')

