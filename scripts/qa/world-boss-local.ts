/**
 * Local world boss server for QA: the same handler as the Edge Function, backed by a scratch PostgreSQL
 * (VVR_PG_HOST/VVR_PG_PORT, migration already applied). Never points at a live database.
 *   WB_PORT=18790 VVR_PG_HOST=... VVR_PG_PORT=... npx tsx scripts/qa/world-boss-local.ts
 * GET /local/init?id=123&name=Bjorn signs Telegram-format initData with a throw-away bot token (localhost only).
 */
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {handle,signInitData} from '../../supabase/functions/_shared/worldBoss.ts';
const host=process.env.VVR_PG_HOST!,port=process.env.VVR_PG_PORT??'5432',db=process.env.VVR_PG_DB??'postgres',listen=Number(process.env.WB_PORT??18790);
const botToken='local-qa-token';
if(!host)throw new Error('VVR_PG_HOST is required');
/** RPC through psql variables: arguments are passed as quoted literals, never spliced as SQL. */
async function rpc(name:string,args:Record<string,unknown>){
 if(!/^vvr_world_boss_[a-z_]+$/.test(name))throw new Error('bad rpc');
 const keys=Object.keys(args),vars=keys.flatMap((k,i)=>['-v',`a${i}=${args[k]===null?'':typeof args[k]==='object'?JSON.stringify(args[k]):String(args[k])}`]);
 const call=keys.map((k,i)=>`${k}=>${args[k]===null?'null':`:'a${i}'`}`).join(',');
 return new Promise((resolve,reject)=>{
  const p=spawn('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',host,'-p',port,'-U','postgres','-d',db,...vars]);
  let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);
  p.on('close',code=>code===0?resolve(JSON.parse(out.trim())):reject(new Error(err)));
  p.stdin.end(`select public.${name}(${call});`);
 });
}
createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','content-type');
 if(req.method==='OPTIONS'){res.writeHead(204).end();return}
 const url=new URL(req.url??'/','http://localhost');
 if(req.method==='GET'&&url.pathname==='/local/init'){
  const id=Number(url.searchParams.get('id')??'1');
  res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({initData:await signInitData({id,first_name:url.searchParams.get('name')??'Северный страж'},botToken,Date.now())}));
  return;
 }
 let raw='';for await(const chunk of req)raw+=chunk;
 let input:unknown=null;try{input=JSON.parse(raw)}catch{/* bad request */}
 const reply=await handle(input,{botToken,rpc});
 res.writeHead(reply.status,{'Content-Type':'application/json'}).end(JSON.stringify(reply.body));
}).listen(listen,'127.0.0.1',()=>console.log('world boss local server on http://127.0.0.1:'+listen));
