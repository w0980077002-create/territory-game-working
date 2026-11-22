import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';

export type ArenaIdentity={id:string;name:string};
export type ArenaSession={id:string;lease:string;expires:number};
const INIT_MAX_AGE=10*60;
const SESSION_MS=12*60*60_000;

const mac=(key:string|Buffer,text:string)=>createHmac('sha256',key).update(text).digest();
const equal=(expected:Buffer,actual:Buffer)=>expected.length===actual.length&&timingSafeEqual(expected,actual);

export function verifyTelegram(raw:string,botToken:string,now:number):ArenaIdentity|undefined{
 if(!botToken||!raw||raw.length>8192)return;
 const fields=new URLSearchParams(raw),hash=fields.get('hash');
 if(!hash||!/^[a-f\d]{64}$/i.test(hash)||new Set(fields.keys()).size!==fields.size)return;
 fields.delete('hash');
 const text=[...fields].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,value])=>key+'='+value).join('\n');
 if(!equal(mac(mac('WebAppData',botToken),text),Buffer.from(hash,'hex')))return;
 const date=fields.get('auth_date');
 if(!date||!/^\d+$/.test(date))return;
 const age=Math.floor(now/1000)-Number(date);
 if(age<-30||age>INIT_MAX_AGE)return;
 try{
  const {id,first_name}=JSON.parse(fields.get('user')??'null');
  if(Number.isSafeInteger(id)&&id>0){
   const name=typeof first_name==='string'?first_name.replace(/[\p{Cc}\p{Cf}]/gu,'').trim().slice(0,32):'';
   return {id:String(id),name:name||'Северный страж'};
  }
 }catch{/* A malformed user has no identity. */}
}

export function issueSession(id:string,key:string,now:number){
 const data=Buffer.from(JSON.stringify({id,lease:randomUUID(),expires:now+SESSION_MS})).toString('base64url');
 return data+'.'+mac(key,data).toString('base64url');
}

export function readSession(token:string,key:string,now:number):ArenaSession|undefined{
 if(token.length>1024||!/^[-\w]+\.[-\w]+$/.test(token))return;
 const [data,signature]=token.split('.');
 if(!equal(mac(key,data),Buffer.from(signature,'base64url')))return;
 try{
  const session=JSON.parse(Buffer.from(data,'base64url').toString('utf8')) as ArenaSession;
  if(/^\d+$/.test(session.id)&&typeof session.lease==='string'&&session.expires>now)return session;
 }catch{/* Only valid signed sessions are accepted. */}
}
