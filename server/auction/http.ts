import {createServer,type IncomingMessage} from 'node:http';
import {JsonInputError,readJsonObject,sendJson} from '../api/json';
import {readSession} from '../arena/auth';
import {AuctionLedger,TradeError,type TradeCommand} from './ledger';

const errors={invalid:400,unavailable:409,forbidden:403,funds:409,operation_conflict:409};

async function readTrade(req:IncomingMessage):Promise<{operationId:string;command:TradeCommand}>{
 const row=await readJsonObject(req,2048);
 const {operationId,kind,itemId,price,listingId}=row;
 if(typeof operationId!=='string')throw new TradeError('invalid');
 if(kind==='list'&&typeof itemId==='string'&&typeof price==='number'&&Object.keys(row).length===4)
  return {operationId,command:{kind,itemId,price}};
 if((kind==='buy'||kind==='cancel')&&typeof listingId==='string'&&Object.keys(row).length===3)
  return {operationId,command:{kind,listingId}};
 throw new TradeError('invalid');
}

/** The session issuer is responsible for authenticating Telegram initData. */
export function createAuctionServer({path,sessionKey,clock=Date.now}:{path:string;sessionKey:string;clock?:()=>number}){
 if(sessionKey.length<32)throw new Error('Auction requires a strong session key');
 const ledger=new AuctionLedger(path);
 const server=createServer(async(req,res)=>{
  const url=req.url?.split('?')[0];
  const state=req.method==='GET'&&url==='/auction-api/state';
  const trade=req.method==='POST'&&url==='/auction-api/trade';
  if(!state&&!trade){sendJson(res,404,{error:'not_found'});return;}
  const now=clock(),auth=req.headers.authorization;
  const session=auth?.startsWith('Bearer ')?readSession(auth.slice(7),sessionKey,now):undefined;
  if(!session){sendJson(res,401,{error:'session_required'});return;}
  try{
   if(state){
    ledger.provisionWallet(session.id);
    sendJson(res,200,{balance:ledger.balance(session.id),items:ledger.ownedItems(session.id),listings:ledger.openListings(),history:ledger.history(session.id)});
    return;
   }
   const {operationId,command}=await readTrade(req);
   sendJson(res,200,ledger.transact(session.id,operationId,command,now));
  }catch(error){
   if(error instanceof TradeError)sendJson(res,errors[error.code],{error:error.code});
   else if(error instanceof JsonInputError)sendJson(res,400,{error:'invalid'});
   else sendJson(res,500,{error:'trade_failed'});
  }
 });
 server.once('close',()=>ledger.close());
 return server;
}
