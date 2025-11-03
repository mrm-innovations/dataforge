// Deploy built dist/ to Apache webroot (project root), keep runtime assets in /dist/assets
// Usage: npm run deploy:apache
const fs = require('fs')
const path = require('path')

const root = process.cwd()
const dist = path.join(root, 'dist')
const webroot = root // deploy to project root

if (!fs.existsSync(dist)) {
  console.error('dist/ not found. Run the build first.')
  process.exit(1)
}

function rmrf(p){ if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }) }

// 1) Clean old runtime assets at root (we keep assets only under dist/)
rmrf(path.join(webroot, 'assets'))
rmrf(path.join(webroot, 'live'))

// 2) Ensure dist has assets
if (!fs.existsSync(path.join(dist, 'assets'))) {
  console.warn('Warning: dist/assets missing — build may have failed.')
}

// 3) Promote dist/src_entry.html to root index.html (+404.html)
const srcEntry = path.join(dist, 'src_entry.html')
if (fs.existsSync(srcEntry)) {
  const indexPath = path.join(webroot, 'index.html')
  const fourOhFour = path.join(webroot, '404.html')
  fs.copyFileSync(srcEntry, indexPath)
  fs.copyFileSync(srcEntry, fourOhFour)
  console.log('Wrote root index.html and 404.html from dist/src_entry.html')
} else {
  console.warn('dist/src_entry.html not found; nothing written to root index.html')
}

console.log('Deployed. Open http://localhost/scorecard_v6/ (assets are under /dist/assets)')
