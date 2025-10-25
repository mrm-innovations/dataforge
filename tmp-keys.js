const fs=require('fs');
function normalize(s){return String(s||'').replace(/Ã‘|Ã±/g,'n').replace(/â€™|’|‘/g,"'").toLowerCase().replace(/\s*\([^)]*\)/g,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s*\(capital\)/g,'').replace(/^city of\s+/,'').replace(/[^a-z0-9]+/g,'');}
const canon=JSON.parse(fs.readFileSync('public/lg-audits.json','utf8'));
const poc=JSON.parse(fs.readFileSync('public/poc.json','utf8').replace(/[\u0000-\u0009\u000B-\u001F]/g,''));
const keys=new Set(canon.lgus.map(g=>normalize(g.lgu||g.province)));
for(const row of poc){ if(String(row['City/Municipality']).startsWith('LAMBAYONG')){ const k=normalize(row['City/Municipality']); console.log('pocKey=',k,'has=',keys.has(k)); } }
for(const g of canon.lgus){ if(g.lgu==='Lambayong'){ console.log('canonKey=',normalize(g.lgu)); break; } }
