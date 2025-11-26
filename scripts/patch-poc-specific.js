const fs=require('fs');
const canon=JSON.parse(fs.readFileSync('public/lg-audits.json','utf8'));
const poc=JSON.parse(fs.readFileSync('public/poc.json','utf8').replace(/[\u0000-\u0009\u000B-\u001F]/g,''));
function n(s){ if (s==null||s==='') return null; const v = typeof s==='number'?s:Number(String(s).replace(/[%\s]+/g,'')); return isNaN(v)?null:v }
function getRow(name){ return poc.find(r => String(r['City/Municipality']||'').toLowerCase().startsWith(name.toLowerCase())) }
function setPOC(matchFn, row){ const rec = canon.lgus.find(matchFn); if (!rec||!row) return false; rec.results=rec.results||{}; const t = rec.results.POC = rec.results.POC || {}; t['2021']=n(row['2021']); t['2022']=n(row['2022']); t['2023']=n(row['2023']); return true }
const ok1 = setPOC(g=>g.lgu==='City of General Santos', getRow('CITY OF GENERAL SANTOS'));
const ok2 = setPOC(g=>g.lgu==='Lambayong', poc.find(r=> String(r['City/Municipality']).startsWith('LAMBAYONG')));
const ok3 = (function(){ const row = poc.find(r=> (r['City/Municipality']||'')==='' && String(r.province||'').match(/COTABATO/)); return setPOC(g=>g.type==='Province' && g.lgu==='Cotabato', row) })();
fs.writeFileSync('public/lg-audits.json', JSON.stringify(canon,null,2));
console.log('patched City of General Santos:', ok1, 'Lambayong:', ok2, 'Cotabato Province:', ok3);
