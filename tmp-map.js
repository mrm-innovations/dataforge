const fs=require('fs');
function normalize(s){return String(s||'').replace(/Ã‘|Ã±/g,'n').replace(/â€™|’|‘/g,"'").toLowerCase().replace(/\s*\([^)]*\)/g,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s*\(capital\)/g,'').replace(/^city of\s+/,'').replace(/[^a-z0-9]+/g,'');}
const canon=JSON.parse(fs.readFileSync('public/lg-audits.json','utf8'));
const byKey=new Map();
for(const g of canon.lgus){ const k=normalize(g.lgu||g.province); if(!byKey.has(k)) byKey.set(k,g) }
for (const nm of ['CITY OF GENERAL SANTOS (DADIANGAS)','LAMBAYONG (MARIANO MARCOS)','Cotabato']){
  const key=normalize(nm);
  const rec=byKey.get(key);
  console.log(nm,'=> key=',key,'found=',!!rec, rec?rec.lgu+ ' type='+rec.type:'');
}
