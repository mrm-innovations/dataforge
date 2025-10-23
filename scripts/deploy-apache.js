// Deploy built dist/ to Apache webroot at C:\xampp\htdocs\scorecard_v6
// Usage: npm run deploy:apache
const fs = require('fs')
const path = require('path')

const root = process.cwd()
const dist = path.join(root, 'dist')
const webroot = root // project is already under htdocs\scorecard_v6

if (!fs.existsSync(dist)) {
  console.error('dist/ not found. Run the build first.')
  process.exit(1)
}

function rmrf(p){
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}
function copyRecursive(src, dest){
  const stat = fs.statSync(src)
  if (stat.isDirectory()){
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src)){
      copyRecursive(path.join(src, entry), path.join(dest, entry))
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  }
}

// 1) Clean existing runtime assets to avoid stale files
rmrf(path.join(webroot, 'assets'))

// 2) Copy everything from dist into webroot (contents only)
for (const entry of fs.readdirSync(dist)){
  if (entry.toLowerCase() === 'src_entry.html') continue // do not overwrite source html
  const from = path.join(dist, entry)
  const to = path.join(webroot, entry)
  copyRecursive(from, to)
}

// 3) If build used src_entry.html as input, promote it to index.html (+404.html)
const srcEntry = path.join(dist, 'src_entry.html')
if (fs.existsSync(srcEntry)) {
  const indexPath = path.join(webroot, 'index.html')
  const fourOhFour = path.join(webroot, '404.html')
  fs.copyFileSync(srcEntry, indexPath)
  fs.copyFileSync(srcEntry, fourOhFour)
}

console.log('Deployed dist/ to Apache webroot. Open http://localhost/scorecard_v6')
