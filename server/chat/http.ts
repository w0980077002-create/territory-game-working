import {createServer} from 'node:http';
import {JsonInputError,readJsonObject,sendJson} from '../api/json';
import {issueSession,readSession,verifyTelegram} from '../arena/auth';
import {ChatError,ChatRoom} from './room';

export function createChatServer({path,botToken,sessionKey,moderators,clock=Date.now}:{
 path:string;botToken:string;sessionKey:string;moderators:ReadonlySet<string>;clock?:()=>number;
}){
 if(!botToken||sessionKey.length<32||botToken===sessionKey)throw new Error('Chat requires separate Telegram and session credentials');
 const room=new ChatRoom(path,moderators);
 const server=createServer(async(req,res)=>{
  const url=req.url?.split('?')[0],method=req.method,now=clock();
  try{
   if(method==='POST'&&url==='/chat-api/auth'){
    const body=await readJsonObject(req,10_000);
    const identity=typeof body.initData==='string'&&verifyTelegram(body.initData,botToken,now);
    if(!identity){sendJson(res,401,{error:'telegram_required'});return;}
    room.authenticate(identity);
    sendJson(res,200,{token:issueSession(identity.id,sessionKey,now)});
    return;
   }
   const state=method==='GET'&&url==='/chat-api/messages';
   const post=method==='POST'&&url==='/chat-api/messages';
   const hide=method==='POST'&&url==='/chat-api/hide';
   if(!state&&!post&&!hide){sendJson(res,404,{error:'not_found'});return;}
   const auth=req.headers.authorization;
   const session=auth?.startsWith('Bearer ')?readSession(auth.slice(7),sessionKey,now):undefined;
   if(!session){sendJson(res,401,{error:'session_required'});return;}
   if(state){sendJson(res,200,{messages:room.messages()});return;}
   const body=await readJsonObject(req,2048);
   if(hide&&typeof body.message==='number'&&Object.keys(body).length===1){
    room.hide(session.id,body.message,now);
    sendJson(res,200,{hidden:true});
    return;
   }
   if(post&&typeof body.operationId==='string'&&typeof body.text==='string'&&Object.keys(body).length===2){
    sendJson(res,200,room.send(session.id,body.operationId,body.text,now));
    return;
   }
   throw new ChatError(400);
  }catch(error){
   if(error instanceof ChatError)sendJson(res,error.status,{error:'chat_request_rejected'});
   else if(error instanceof JsonInputError)sendJson(res,400,{error:'invalid'});
   else sendJson(res,500,{error:'chat_unavailable'});
  }
 });
 server.once('close',()=>room.close());
 return server;
}
