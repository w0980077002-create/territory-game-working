/**
 * Russian / English. The game is authored in Russian; English is applied as a thin layer:
 * a RU→EN dictionary (exact strings and {0}-patterns) translates DOM text, accessible labels and the
 * battle canvas. Components stay untouched, so new Russian text simply shows until it is translated.
 * Default is Russian; English comes from the saved choice or the Telegram user's language.
 * The dictionary is loaded only for English players.
 */
export type Lang='ru'|'en';
const KEY='vvr-lang';
function telegramLanguage(){
 try{return (window as unknown as {Telegram?:{WebApp?:{initDataUnsafe?:{user?:{language_code?:string}}}}}).Telegram?.WebApp?.initDataUnsafe?.user?.language_code}catch{return undefined}
}
export function detectLang():Lang{
 if(typeof window==='undefined')return 'ru';
 try{const saved=localStorage.getItem(KEY);if(saved==='ru'||saved==='en')return saved}catch{/* storage blocked */}
 const tg=telegramLanguage();
 if(tg)return /^(ru|uk|be|kk|ky|uz|tg|hy|az|ka)/i.test(tg)?'ru':'en';
 return 'ru';
}
export const lang:Lang=detectLang();
export function setLang(next:Lang){
 try{localStorage.setItem(KEY,next)}catch{/* storage blocked */}
 location.reload();
}

type Pattern={re:RegExp;out:string;size:number};
let exact=new Map<string,string>(),patterns:Pattern[]=[];
const cache=new Map<string,string>();
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function loadDictionary(dict:Record<string,string>){
 exact=new Map();patterns=[];cache.clear();
 for(const [ru,en] of Object.entries(dict)){
  if(typeof en!=='string'||!en)continue;
  if(/\{\d+\}/.test(ru)){
   const parts=ru.split(/\{(\d+)\}/),order:number[]=[];let src='^';
   parts.forEach((part,i)=>{if(i%2){order.push(+part);src+='(.+?)'}else src+=escape(part)});
   const literal=parts.filter((_,i)=>i%2===0).join('').length;
   if(literal<2)continue; // a bare "{0}" would match everything
   patterns.push({re:new RegExp(src+'$'),out:en,size:literal});
   void order;
  }else exact.set(ru,en);
 }
 patterns.sort((a,b)=>b.size-a.size);
}
const cyr=/[А-Яа-яЁё]/;
/** Translates one string; whitespace around it is preserved. Unknown text is returned unchanged. */
export const tr=(text:string)=>lang==='en'?translate(text):text;
/** Dictionary lookup regardless of the active language (used by tr and tests). */
export function translate(text:string):string{
 if(!text||!cyr.test(text))return text;
 const hit=cache.get(text);if(hit!==undefined)return hit;
 const lead=/^\s*/.exec(text)![0],tail=/\s*$/.exec(text)![0],core=text.trim().replace(/\s+/g,' ');
 let out=exact.get(core);
 if(out===undefined){
  for(const p of patterns){
   const m=p.re.exec(core);if(!m)continue;
   out=p.out.replace(/\{(\d+)\}/g,(_,n)=>{const v=m[+n+1]??'';return cyr.test(v)?translate(v):v});
   break;
  }
 }
 if(out===undefined&&core.includes(' · ')){const parts=core.split(' · ').map(translate);if(parts.some((x,i)=>x!==core.split(' · ')[i]))out=parts.join(' · ')}
 const result=out===undefined?text:lead+out+tail;
 if(cache.size>4000)cache.clear();
 cache.set(text,result);
 return result;
}

const ATTRS=['aria-label','title','placeholder','alt'];
function translateNode(node:Node){
 if(node.nodeType===Node.TEXT_NODE){
  const parent=node.parentElement;
  if(parent&&(parent.tagName==='SCRIPT'||parent.tagName==='STYLE'))return;
  const v=node.nodeValue??'',t=tr(v);if(t!==v)node.nodeValue=t;
  return;
 }
 if(node.nodeType!==Node.ELEMENT_NODE)return;
 const el=node as Element;
 for(const a of ATTRS){const v=el.getAttribute(a);if(v){const t=tr(v);if(t!==v)el.setAttribute(a,t)}}
 const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
 for(let n=walker.nextNode();n;n=walker.nextNode()){
  if(n.nodeType===Node.TEXT_NODE){const v=n.nodeValue??'',t=tr(v);if(t!==v)n.nodeValue=t}
  else for(const a of ATTRS){const e=n as Element,v=e.getAttribute(a);if(v){const t=tr(v);if(t!==v)e.setAttribute(a,t)}}
 }
}
function patchCanvas(){
 const proto=CanvasRenderingContext2D.prototype;
 for(const name of ['fillText','strokeText','measureText'] as const){
  const original=proto[name] as (...args:unknown[])=>unknown;
  (proto as unknown as Record<string,unknown>)[name]=function(this:CanvasRenderingContext2D,text:unknown,...rest:unknown[]){
   return original.call(this,typeof text==='string'?tr(text):text,...rest);
  };
 }
}
/** Starts English translation of the whole page. No effect for Russian. */
export async function startTranslation(){
 if(lang!=='en'||typeof document==='undefined')return;
 document.documentElement.lang='en';
 const dict=(await import('./en.json')).default as Record<string,string>;
 loadDictionary(dict);
 patchCanvas();
 translateNode(document.body);
 document.title=tr(document.title);
 new MutationObserver(records=>{
  for(const r of records){
   if(r.type==='characterData')translateNode(r.target);
   else if(r.type==='attributes'&&r.attributeName){const e=r.target as Element,v=e.getAttribute(r.attributeName);if(v){const t=tr(v);if(t!==v)e.setAttribute(r.attributeName,t)}}
   else r.addedNodes.forEach(translateNode);
  }
 }).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS});
}
