import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {test} from 'node:test';
import {createChatServer} from '../server/chat/http';

test('authenticated players share moderated chat and retries do not duplicate messages',async()=>{
 const botToken='isolated-chat-test-token';
 let now=100_000_000;
 const server=createChatServer({path:':memory:',botToken,sessionKey:'isolated-chat-session-key-at-least-32',moderators:new Set(['2']),clock:()=>now});
 try{
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Missing test address');
  const ask=(route:string,token?:string,body?:unknown)=>fetch(`http://127.0.0.1:${address.port}/chat-api/${route}`,{
   method:body===undefined?'GET':'POST',headers:{
    ...(token?{Authorization:`Bearer ${token}`} : {}),
    ...(body===undefined?{}:{'Content-Type':'application/json'}),
   },body:body===undefined?undefined:JSON.stringify(body),
  });
  async function login(id:number,name:string){
   const raw=new URLSearchParams({auth_date:String(Math.floor(now/1000)),user:JSON.stringify({id,first_name:name})});
   const key=createHmac('sha256','WebAppData').update(botToken).digest();
   raw.set('hash',createHmac('sha256',key).update([...raw].map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex'));
   const response=await ask('auth',undefined,{initData:String(raw)});
   assert.equal(response.status,200);
   return (await response.json() as {token:string}).token;
  }
  assert.equal((await ask('messages')).status,401);
  assert.equal((await ask('auth',undefined,{initData:'user=1'})).status,401);
  const player=await login(1,'Алиса'),moderator=await login(2,'Борис');
  const message={operationId:randomUUID(),text:'  Привет  всем! '};
  assert.equal((await ask('messages',player,{...message,name:'Борис'})).status,400);
  const posted=await ask('messages',player,message);
  assert.equal(posted.status,200);
  const sent=await posted.json() as {id:number;name:string;text:string};
  assert.equal(sent.name,'Алиса');
  assert.equal(sent.text,'Привет всем!');
  assert.deepEqual(await (await ask('messages',player,message)).json(),sent);
  assert.equal((await ask('messages',player,{...message,text:'Другая строка'})).status,409);
  assert.equal((await ask('messages',player,{...message,operationId:randomUUID()})).status,429);
  assert.deepEqual(await (await ask('messages',moderator)).json(),{messages:[sent]});
  assert.equal((await ask('hide',player,{message:sent.id})).status,403);
  assert.equal((await ask('hide',moderator,{message:sent.id})).status,200);
  assert.deepEqual(await (await ask('messages',player)).json(),{messages:[]});
  assert.equal((await ask('messages',player,message)).status,404);
  now+=2000;
  assert.equal((await ask('messages',player,{operationId:randomUUID(),text:'https:\u200b//t.me/example'})).status,400);
  assert.equal((await ask('messages',player,{operationId:randomUUID(),text:'Продолжим игру'})).status,200);
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});
