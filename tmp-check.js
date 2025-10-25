const fs=require('fs');
function normalize(s){return String(s||'').replace(/Ñ|ñ/g,'n').replace(/’|�|�/g,"'").toLowerCase().replace(/\s*\([^)]*\)/g,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s*\(capital\)/g,'').replace(/^city of\s+/,'').replace(/[^a-z0-9]+/g,'');}
const canon=JSON.parse(fs.readFileSync('public/lg-audits.json','utf8'));
const poc=JSON.parse(fs.readFileSync('public/poc.json','utf8').replace(/[\u0000-\u0009\u000B-\u001F]/g,''));
const keys=new Set(canon.lgus.map(g=>normalize(g.lgu||g.province)));
let unmatched=[];
for(const row of poc){ const prov=row.province||row.Province||''; const lgu=row.lgu||row.City||row.Municipality||row['City/Municipality']||''; const key=normalize(lgu||prov); if(!keys.has(key)) unmatched.push({lgu,prov,key}); }
console.log(JSON.stringify(unmatched,null,2));
