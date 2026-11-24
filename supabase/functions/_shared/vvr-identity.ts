// Share this authentication boundary with the W066 world boss Edge function.
const encoder=new TextEncoder();
const decoder=new TextDecoder();
const maxSession=12*60*60_000;
const playerId=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

async function hmacKey(key:string|Uint8Array<ArrayBuffer>){
 return crypto.subtle.importKey('raw',typeof key==='string'?encoder.encode(key):key,
  {name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
const serialize=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const deserialize=(text:string)=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),letter=>letter.charCodeAt(0));

export async function verifyTelegramIdentity(raw:string,botToken:string,now:number){
 if(!botToken||!raw||raw.length>8192)return;
 const params=new URLSearchParams(raw),hash=params.get('hash');
 if(!hash||!/^[a-f\d]{64}$/i.test(hash)||new Set(params.keys()).size!==params.size)return;
 params.delete('hash');
 params.sort();
 const check=[...params].map(([key,value])=>key+'='+value).join('\n');
 const seed=new Uint8Array(await crypto.subtle.sign('HMAC',await hmacKey('WebAppData'),encoder.encode(botToken)));
 const signature=Uint8Array.from(hash.match(/../g)!,byte=>parseInt(byte,16));
 if(!await crypto.subtle.verify('HMAC',await hmacKey(seed),signature,encoder.encode(check)))return;
 const timestamp=params.get('auth_date');
 if(!timestamp||!/^\d+$/.test(timestamp))return;
 const age=Math.floor(now/1000)-Number(timestamp);
 if(age<-30||age>600)return;
 try{
  const {id,first_name}=JSON.parse(params.get('user')??'null');
  if(!Number.isSafeInteger(id)||id<=0)return;
  const name=typeof first_name==='string'?Array.from(first_name.replace(/[\p{Cc}\p{Cf}]/gu,'').trim()).slice(0,32).join(''):'';
  return {telegramId:String(id),displayName:name||'Северный страж'};
 }catch{return undefined;}
}

export async function issueVvrSession(player:string,secret:string,now:number){
 const payload=serialize(encoder.encode(JSON.stringify({version:1,player,expires:now+maxSession})));
 const signature=await crypto.subtle.sign('HMAC',await hmacKey(secret),encoder.encode(payload));
 return payload+'.'+serialize(new Uint8Array(signature));
}

export async function readVvrSession(token:string,secret:string,now:number){
 if(token.length>512||!/^[-\w]+\.[-\w]+$/.test(token))return;
 const [payload,signature]=token.split('.');
 try{
  if(!await crypto.subtle.verify('HMAC',await hmacKey(secret),deserialize(signature),encoder.encode(payload)))return;
  const session=JSON.parse(decoder.decode(deserialize(payload)));
  if(session.version===1&&typeof session.player==='string'&&playerId.test(session.player)&&
     Number.isSafeInteger(session.expires)&&session.expires>now&&session.expires<=now+maxSession)return session.player as string;
 }catch{return undefined;}
}
