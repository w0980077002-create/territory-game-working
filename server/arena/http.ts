import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {createHmac} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {extname,join,relative,resolve} from 'node:path';
import {arenaElixirs,arenaHeroes,arenaKits,arenaSkills,zones,
 type ArenaCommand,type ArenaElixir,type ArenaKit,type ArenaSkill,type ArenaZone} from '../../src/arena/protocol';
import {issueSession,readSession,verifyTelegram} from './auth';
import {ArenaError,ArenaService} from './service';
import {readArenaLevels} from './roster';
import {LiveArena} from './live';
import {validArenaBuild} from '../../src/arena/hero';
import {capacities,type ArenaMode,type LiveAction} from '../../src/arena/match';

type Options={dbPath:string;botToken:string;sessionKey:string;webRoot?:string;local?:boolean;clock?:()=>number;rng?:()=>number;
 allowedUsers?:ReadonlySet<string>;testLevels?:string;scorePublisher?:{url:string;token:string}};
const pagesOrigin='https://w0980077002-create.github.io';
const uuid=/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const localPeople={
 alice:{id:1001,first_name:'Алиса'},
 boris:{id:1002,first_name:'Борис'},
} as const;

function fixture(person:keyof typeof localPeople,key:string,now:number){
 const data=new URLSearchParams({auth_date:String(Math.floor(now/1000)),user:JSON.stringify(localPeople[person])});
 const text=[...data].map(([k,v])=>k+'='+v).join('\n');
 const secret=createHmac('sha256','WebAppData').update(key).digest();
 data.set('hash',createHmac('sha256',secret).update(text).digest('hex'));
 return data.toString();
}

function json(res:ServerResponse,status:number,value:unknown){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(JSON.stringify(value));
}

async function body(req:IncomingMessage):Promise<Record<string,unknown>>{
 if(req.headers['content-type']?.split(';')[0]!=='application/json')
  throw new ArenaError(415,'Ожидается JSON');
 if(Number(req.headers['content-length'])>9_000)throw new ArenaError(413,'Запрос слишком большой');
 const chunks:Buffer[]=[];
 let size=0;
 for await(const chunk of req){
  size+=chunk.length;
  if(size>9_000)throw new ArenaError(413,'Запрос слишком большой');
  chunks.push(chunk);
 }
 try{
  const value:unknown=JSON.parse(Buffer.concat(chunks).toString());
  if(value&&typeof value==='object'&&!Array.isArray(value))return value as Record<string,unknown>;
 }catch{/* Malformed JSON. */}
 throw new ArenaError(400,'Некорректный запрос');
}

function exact(input:Record<string,unknown>,...fields:string[]){
 if(Object.keys(input).length!==fields.length||fields.some(key=>!Object.hasOwn(input,key)))
  throw new ArenaError(400,'Некорректные параметры');
}

function parseControl({target,revision}:Record<string,unknown>){
 if(typeof target!=='string'||!uuid.test(target)||typeof revision!=='number'||!Number.isSafeInteger(revision)||revision<0)
  throw new ArenaError(400,'Укажите текущий бой или поиск');
 return {target,revision};
}

function object(value:unknown):value is Record<string,unknown>{
 return !!value&&typeof value==='object'&&!Array.isArray(value);
}
function hasKey<T extends object>(catalog:T,key:unknown):key is keyof T{
 return typeof key==='string'&&Object.hasOwn(catalog,key);
}
function parseCommand(value:unknown):ArenaCommand{
 if(object(value)){
  if(value.kind==='auto'){
   exact(value,'kind','enabled');
   if(typeof value.enabled==='boolean')return {kind:'auto',enabled:value.enabled};
  }else if(value.kind==='item'){
   exact(value,'kind','item');
   if(hasKey(arenaElixirs,value.item))return {kind:'item',item:value.item as ArenaElixir};
  }else if(value.kind==='move'&&object(value.move)){
   exact(value,'kind','move');
   exact(value.move,'attack','blocks','skill');
   const {attack,blocks,skill}=value.move;
   if(hasKey(zones,attack)&&Array.isArray(blocks)&&blocks.length===2&&
      hasKey(zones,blocks[0])&&hasKey(zones,blocks[1])&&blocks[0]!==blocks[1]&&
      (skill===null||arenaSkills.includes(skill as ArenaSkill)))
    return {kind:'move',move:{attack,blocks:blocks as [ArenaZone,ArenaZone],skill:skill as ArenaSkill|null}};
  }
 }
 throw new ArenaError(400,'Некорректное действие');
}

function parseLiveAction(value:unknown):LiveAction{
 if(object(value)){
  if(value.kind==='leave'){exact(value,'kind');return {kind:'leave'}}
  if(value.kind==='chat'){
   exact(value,'kind','text');
   if(typeof value.text==='string'&&value.text.length<=200)return {kind:'chat',text:value.text};
  }
  if(value.kind==='strike'){
   exact(value,'kind','target','attack','blocks');
   const {target,attack,blocks}=value;
   if(typeof target==='string'&&(/^[1-9]\d{0,15}$|^bot-\d{1,2}$/).test(target)&&hasKey(zones,attack)&&
    Array.isArray(blocks)&&blocks.length===2&&hasKey(zones,blocks[0])&&hasKey(zones,blocks[1])&&blocks[0]!==blocks[1])
    return {kind:'strike',target,attack,blocks:[blocks[0],blocks[1]]};
  }
 }
 return parseCommand(value);
}

function scopedLimit(max:number,interval:number){
 const clients=new Map<string,{count:number;until:number}>();
 return (id:string,now:number)=>{
  const entry=clients.get(id);
  if(entry&&entry.until>now){
   if(++entry.count>max)throw new ArenaError(429,'Слишком много запросов');
   return;
  }
  if(clients.size>=4096){
   for(const [key,limit] of clients)if(limit.until<=now)clients.delete(key);
   if(clients.size>=4096)throw new ArenaError(429,'Слишком много запросов');
  }
  clients.set(id,{count:1,until:now+interval});
 };
}

const media:Record<string,string>={
 '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
 '.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2',
 '.mp3':'audio/mpeg','.ogg':'audio/ogg','.json':'application/json',
};

async function staticFile(req:IncomingMessage,res:ServerResponse,pathname:string,dir:string){
 if(req.method!=='GET'&&req.method!=='HEAD')throw new ArenaError(405,'Открывайте приложение через GET');
 let decoded:string;
 try{decoded=decodeURIComponent(pathname)}catch{throw new ArenaError(400,'Некорректный путь')}
 const root=resolve(dir),file=resolve(join(root,decoded==='/'?'index.html':decoded));
 const fromRoot=relative(root,file);
 if(!fromRoot||fromRoot.startsWith('..')||!Object.hasOwn(media,extname(file)))throw new ArenaError(404,'Страница не найдена');
 const info=await stat(file).catch(()=>null);
 if(!info?.isFile())throw new ArenaError(404,'Страница не найдена');
 res.writeHead(200,{
  'Content-Type':media[extname(file)],'Content-Length':info.size,'X-Content-Type-Options':'nosniff',
  'Cache-Control':decoded.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache',
 });
 if(req.method==='HEAD'){res.end();return}
 const stream=createReadStream(file);
 res.on('close',()=>stream.destroy());
 stream.on('error',()=>res.destroy());
 stream.pipe(res);
}

async function readW066Attack(publisher:Options['scorePublisher'],telegram:string,name:string){
 if(!publisher)return;
 try{
  const endpoint=new URL(publisher.url);
  if(!endpoint.pathname.endsWith('/arena-result'))return;
  endpoint.pathname=endpoint.pathname.replace(/arena-result$/,'arena-profile');
  const response=await fetch(endpoint,{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(1500),
   headers:{Authorization:'Bearer '+publisher.token,'Content-Type':'application/json'},
   body:JSON.stringify({telegram,name}),
  });
  if(!response.ok)return;
  const {attack}=await response.json();
  if(Number.isSafeInteger(attack)&&attack>=1&&attack<=1_000_041)return attack as number;
 }catch{/* W066 outages leave local duels available as training. */}
}

export function createArenaServer(options:Options){
 if(options.sessionKey.length<32||!options.botToken||options.botToken===options.sessionKey)
  throw new Error('Arena requires independent Telegram and session credentials');
 // Allowlist is optional: without it any verified Telegram account may join.
 if(options.allowedUsers&&[...options.allowedUsers].some(id=>!/^\d{1,16}$/.test(id)))
  throw new Error('ARENA_TEST_USERS must contain numeric Telegram IDs');

 const rosterIds=options.local?new Set(Object.values(localPeople).map(person=>String(person.id))):options.allowedUsers;
 const service=new ArenaService(options.dbPath,options.rng,readArenaLevels(options.testLevels,rosterIds));
 const live=new LiveArena(options.dbPath,options.rng);
 const clock=options.clock??Date.now;
 const authLimit=scopedLimit(30,60_000),requestLimit=scopedLimit(60,10_000);
 const server=createServer({requestTimeout:10_000,headersTimeout:8_000,maxHeaderSize:16_384},async(req,res)=>{
  try{
   const url=new URL(req.url??'/','http://arena.local');
   const now=clock();
   const {pathname}=url;
   if(pathname.startsWith('/arena-api/')){
    res.setHeader('Vary','Origin');
    if(req.headers.origin===pagesOrigin){
     res.setHeader('Access-Control-Allow-Origin',pagesOrigin);
     if(req.method==='OPTIONS'){
      res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
       'Access-Control-Allow-Headers':'authorization, content-type, x-arena-tab','Access-Control-Max-Age':'600'});
      res.end();return;
     }
    }
   }
   if((pathname==='/health'||pathname==='/arena-api/health')&&req.method==='GET'){json(res,200,{ok:true});return}
   if(pathname==='/arena-api/local'&&req.method==='GET'&&options.local&&req.socket.remoteAddress==='127.0.0.1'&&/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host??'')&&req.headers['sec-fetch-site']!=='cross-site'){
    const user=url.searchParams.get('user');
    if(user==='alice'||user==='boris'){json(res,200,{initData:fixture(user,options.botToken,now)});return}
    throw new ArenaError(400,'Выберите alice или boris');
   }
   if(!pathname.startsWith('/arena-api/')){
    if(!options.webRoot)throw new ArenaError(404,'Страница не найдена');
    await staticFile(req,res,pathname,options.webRoot);return;
   }
   if(pathname==='/arena-api/auth'&&req.method==='POST'){
    authLimit(req.socket.remoteAddress??'unknown',now);
    const input=await body(req);
    exact(input,'initData');
    const identity=typeof input.initData==='string'&&verifyTelegram(input.initData,options.botToken,now);
    if(!identity)throw new ArenaError(401,'Откройте Арену из Telegram');
    if(options.allowedUsers&&!options.allowedUsers.has(identity.id))throw new ArenaError(403,'Этот аккаунт не приглашён на Арену');
    service.authenticate(identity);
    json(res,200,{token:issueSession(identity.id,options.sessionKey,now)});return;
   }
   const bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
   const session=bearer&&readSession(bearer,options.sessionKey,now);
   const tab=req.headers['x-arena-tab'];
   if(!session||typeof tab!=='string'||!uuid.test(tab))throw new ArenaError(401,'Войдите в Арену');
   if(options.allowedUsers&&!options.allowedUsers.has(session.id))throw new ArenaError(403,'Этот аккаунт не приглашён на Арену');
   requestLimit(session.id,now);
   const actor={id:session.id,controller:session.lease+':'+tab};
   if(req.method==='GET'&&pathname==='/arena-api/live/recent'){json(res,200,live.recent(actor,now));return}
   if(req.method==='GET'&&pathname==='/arena-api/live/room'){
    const id=url.searchParams.get('match');
    if(!id||!uuid.test(id))throw new ArenaError(400,'Неизвестный бой');
    const view=live.room(actor,id,now);
    if(!view.battle)throw new ArenaError(404,'Комната недоступна');
    json(res,200,view);return;
   }
   if(req.method==='GET'&&pathname==='/arena-api/live/state'){json(res,200,live.state(actor,now));return}
   if(req.method==='GET'&&pathname==='/arena-api/state'){json(res,200,service.read(actor,now));return}
   if(req.method==='GET'&&pathname==='/arena-api/room'){
    const id=url.searchParams.get('match');
    if(!id||!uuid.test(id))throw new ArenaError(400,'Неизвестный бой');
    json(res,200,service.room(actor,id,now));return;
   }
   if(req.method!=='POST')throw new ArenaError(404,'Действие не найдено');
   const input=await body(req);
   const actionTime=clock();
   switch(pathname){
    case '/arena-api/live/join':{
     exact(input,'mode','build');
     if(!hasKey(capacities,input.mode)||!validArenaBuild(input.build)){
      console.warn(JSON.stringify({event:'arena_build_rejected',player:actor.id}));
      throw new ArenaError(400,'Проверьте характеристики героя и сохранение');
     }
     const name=service.playerName(actor.id);
     const attack=await readW066Attack(options.scorePublisher,actor.id,name);
     json(res,200,live.join(actor,input.mode as ArenaMode,input.build,name,clock(),options.local===true||attack!==undefined));
     return;
    }
    case '/arena-api/live/cancel':
    case '/arena-api/live/resume':{
     exact(input,'target','revision');
     const {target,revision}=parseControl(input);
     json(res,200,pathname.endsWith('cancel')?live.cancel(actor,target,revision,actionTime):live.resume(actor,target,revision,actionTime));
     return;
    }
    case '/arena-api/live/act':{
     exact(input,'target','revision','action','round','sequence');
     const {target,revision}=parseControl(input);
     const {action,round,sequence}=input;
     if(typeof round!=='number'||!Number.isSafeInteger(round)||round<0||round>60||
      typeof sequence!=='number'||!Number.isSafeInteger(sequence)||sequence<=0)throw new ArenaError(400,'Некорректное действие');
     json(res,200,live.act(actor,target,revision,parseLiveAction(action),round,sequence,actionTime));
     return;
    }
    case '/arena-api/join':{
     exact(input,'hero','kit');
     const hero=arenaHeroes.find(value=>value===input.hero);
     if(!hero||!hasKey(arenaKits,input.kit))throw new ArenaError(400,'Выберите класс героя и экипировку');
     const attack=await readW066Attack(options.scorePublisher,actor.id,service.playerName(actor.id));
    json(res,200,service.join(actor,hero,input.kit as ArenaKit,clock(),attack,options.local===true||attack!==undefined));return;
    }
    case '/arena-api/resume':
     exact(input,'target','revision');
     json(res,200,service.takeover(actor,parseControl(input),actionTime));return;
    case '/arena-api/leave':
     exact(input,'target','revision');
     json(res,200,service.leave(actor,parseControl(input),actionTime));return;
    case '/arena-api/act':{
     exact(input,'target','revision','action','round','sequence');
     const control=parseControl(input);
     const {action,round,sequence}=input;
     if(typeof round!=='number'||!Number.isSafeInteger(round)||round<1||round>60||
       typeof sequence!=='number'||!Number.isSafeInteger(sequence)||sequence<=0)throw new ArenaError(400,'Некорректное действие');
     json(res,200,service.act(actor,control,parseCommand(action),round,sequence,actionTime));return;
    }
    case '/arena-api/chat':{
     exact(input,'match','text');
     const {match,text}=input;
     if(typeof match!=='string'||!uuid.test(match)||typeof text!=='string'||text.length>200)
      throw new ArenaError(400,'Допустимо до 200 символов');
     json(res,200,service.chat(actor,match,text,actionTime));return;
    }
    default:throw new ArenaError(404,'Действие не найдено');
   }
  }catch(error){
   if(res.headersSent){res.destroy();return}
   if(error instanceof ArenaError){json(res,error.status,{error:error.message});return}
   console.error('Arena request could not be completed',error instanceof Error?error.name:'UnknownError');
   json(res,503,{error:'Арена временно недоступна'});
  }
 });
 const worker=setInterval(()=>{
  try{const now=clock();service.tick(now);live.tick(now)}catch{console.error('Arena clock could not update its database')}
 },500).unref();
 let publishing=false,closing=false,publishFailed=false;
 const publisher=options.scorePublisher;
 const publication=publisher?setInterval(async()=>{
  if(publishing||closing)return;
  publishing=true;
  try{
   for(const score of [...service.pendingScores(),...live.pending()]){
    const response=await fetch(publisher.url,{
     method:'POST',headers:{Authorization:'Bearer '+publisher.token,'Content-Type':'application/json'},
     body:JSON.stringify(score),redirect:'error',signal:AbortSignal.timeout(4000),
    });
    if(!response.ok)throw new Error('Score delivery was rejected');
    if(closing)break;
    service.confirmScore(score.match);
    live.delivered(score.match);
   }
   const teamUrl=new URL(publisher.url);
   teamUrl.pathname=teamUrl.pathname.replace(/arena-result$/,'arena-team-result');
   if(teamUrl.href!==publisher.url)for(const team of live.pendingTeams()){
    const response=await fetch(teamUrl,{
     method:'POST',headers:{Authorization:'Bearer '+publisher.token,'Content-Type':'application/json'},
     body:team.json,redirect:'error',signal:AbortSignal.timeout(4000),
    });
    if(!response.ok)throw new Error('Team result delivery was rejected');
    if(closing)break;
    live.deliveredTeam(team.id);
   }
   publishFailed=false;
  }catch{
   if(!closing&&!publishFailed)console.error('W066 Arena score delivery will retry');
   publishFailed=true;
  }finally{publishing=false}
 },5000).unref():undefined;
 server.on('close',()=>{closing=true;clearInterval(worker);clearInterval(publication);service.close();live.close()});
 return server;
}
