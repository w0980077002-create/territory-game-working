/* English coverage report (informational, never fails CI): every Russian UI string in src/ should have an
 * entry in src/i18n/en.json (exact or {0}-pattern). Run: node scripts/i18n/extract.cjs */
const ts=require('typescript');const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'../../src');const out=new Map();
const cyr=/[А-Яа-яЁё]/;
function add(s,kind,file){s=s.replace(/\s+/g,' ').trim();if(!s||!cyr.test(s))return;const k=kind+'\u0000'+s;if(!out.has(k))out.set(k,{ru:s,kind,file:path.relative(root,file)})}
function walk(dir){for(const f of fs.readdirSync(dir)){const p=path.join(dir,f);if(fs.statSync(p).isDirectory())walk(p);else if(/\.(tsx?|json)$/.test(f))scan(p)}}
function scan(file){
 const text=fs.readFileSync(file,'utf8');
 if(file.endsWith('.json')){const visit=v=>{if(typeof v==='string')add(v,'exact',file);else if(v&&typeof v==='object')Object.values(v).forEach(visit)};try{visit(JSON.parse(text))}catch{};return}
 const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const v=n=>{
  if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))add(n.text,'exact',file);
  else if(ts.isTemplateExpression(n)){let s=n.head.text,i=0;for(const sp of n.templateSpans){s+='{'+(i++)+'}'+sp.literal.text}add(s,'pattern',file);
   // fragments as standalone too
   for(const t of [n.head.text,...n.templateSpans.map(sp=>sp.literal.text)])add(t,'exact',file)}
  else if(ts.isJsxText(n))add(n.text,'exact',file);
  ts.forEachChild(n,v)};
 v(sf)}
walk(root);
const list=[...out.values()].filter(x=>!x.file.startsWith('i18n'));
const dict=JSON.parse(fs.readFileSync(path.join(root,'i18n/en.json'),'utf8'));
// Template fragments are covered when the whole {0}-pattern they belong to is translated.
const patterns=list.filter(x=>x.kind==='pattern'&&dict[x.ru]);
const covered=x=>dict[x.ru]||x.kind==='exact'&&patterns.some(p=>p.file===x.file&&p.ru.includes(x.ru.trim()));
const missing=list.filter(x=>!covered(x));
if(process.argv.includes('--json'))console.log(JSON.stringify(missing,null,1));
else{console.log(`English coverage: ${list.length-missing.length}/${list.length} strings`);for(const m of missing.slice(0,60))console.log('  '+m.file+' · '+m.ru.slice(0,90));}
