// Telegram Stars for the W066 community function: invoices, the signed bot webhook and owner tools.
// The bot token never leaves the server; Telegram reaches the webhook with a secret derived from the session key.
type Rpc=(name:string,body:unknown)=>Promise<{ok:boolean;data:unknown}>;
type Reply=(status:number,body:unknown)=>Response;
const encoder=new TextEncoder();

export async function webhookSecret(sessionKey:string){
 const key=await crypto.subtle.importKey('raw',encoder.encode(sessionKey),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode('vvr-stars-webhook')));
 return Array.from(mac,b=>b.toString(16).padStart(2,'0')).join('');
}

export async function botApi(botToken:string,method:string,body:object={}):Promise<{ok:boolean;result?:unknown;description?:string}>{
 const response=await fetch(`https://api.telegram.org/bot${botToken}/${method}`,{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
 return await response.json();
}

const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const terms='Покупки в VIKING VS ROME оплачиваются Telegram Stars и дают игровые самоцветы. Неиспользованную покупку можно вернуть в течение 14 дней: напишите /paysupport. Добровольная поддержка проекта не даёт игровых преимуществ.';

/** Telegram → bot webhook. Non-200 makes Telegram retry, so database failures on payment return 500. */
export async function handleWebhook(request:Request,sessionKey:string,botToken:string,rpc:Rpc){
 const ok=()=>new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});
 if(request.headers.get('x-telegram-bot-api-secret-token')!==await webhookSecret(sessionKey))return new Response('{}',{status:401});
 let update:unknown;
 try{update=await request.json();}catch{return ok();}
 if(!isRecord(update))return ok();
 const query=update.pre_checkout_query;
 if(isRecord(query)&&isRecord(query.from)){
  const order=String(query.invoice_payload??''),amount=Number(query.total_amount);
  const valid=query.currency==='XTR'&&uuid.test(order)&&Number.isSafeInteger(amount)&&
   (await rpc('vvr_stars_precheck',{p_order:order,p_telegram:String(query.from.id),p_stars:amount})).data===true;
  await botApi(botToken,'answerPreCheckoutQuery',valid?{pre_checkout_query_id:query.id,ok:true}:
   {pre_checkout_query_id:query.id,ok:false,error_message:'Заказ устарел. Откройте Лавку и повторите покупку.'});
  return ok();
 }
 const message=update.message;
 if(!isRecord(message)||!isRecord(message.from))return ok();
 const chat=isRecord(message.chat)?message.chat.id:message.from.id;
 const payment=message.successful_payment;
 if(isRecord(payment)){
  const result=await rpc('vvr_stars_paid',{p_order:uuid.test(String(payment.invoice_payload))?payment.invoice_payload:null,
   p_telegram:String(message.from.id),p_stars:Number(payment.total_amount),p_charge:String(payment.telegram_payment_charge_id??'')});
  if(!result.ok)return new Response('{}',{status:500});
  const data=isRecord(result.data)?result.data:{};
  await botApi(botToken,'sendMessage',{chat_id:chat,text:data.status==='ok'&&Number(data.gems)>0
   ?`Спасибо! Начислено ${data.gems} самоцветов. Откройте Лавку в игре, чтобы перенести их герою.`
   :'Спасибо за поддержку VIKING VS ROME!'}).catch(()=>undefined);
  return ok();
 }
 const text=typeof message.text==='string'?message.text.trim():'';
 if(text.startsWith('/terms'))await botApi(botToken,'sendMessage',{chat_id:chat,text:terms});
 else if(text.startsWith('/paysupport')){
  await botApi(botToken,'sendMessage',{chat_id:chat,text:'Обращение передано команде игры. Опишите покупку одним сообщением: что купили и когда.'});
  const owner=(await rpc('vvr_stars_owner_telegram',{})).data;
  if(typeof owner==='string')await botApi(botToken,'sendMessage',{chat_id:owner,
   text:`Платёжная поддержка: игрок ${message.from.id} пишет: ${text.slice(0,500)}`});
 }else if(text.startsWith('/start'))await botApi(botToken,'sendMessage',{chat_id:chat,
  text:'VIKING VS ROME — нажмите кнопку «Играть» внизу чата. /terms — условия покупок, /paysupport — помощь с оплатой.'});
 return ok();
}

/** Player and owner actions routed from the community function after the session check. */
export async function handleStarsAction(action:string,body:Record<string,unknown>,player:string,botToken:string,
 sessionKey:string,project:string,rpc:Rpc,reply:Reply,rpcError:(d:unknown)=>number){
 if(action==='stars_offers'){
  const r=await rpc('vvr_stars_offers',{p_player:player});
  return r.ok?reply(200,r.data):reply(rpcError(r.data),{error:'stars_unavailable'});
 }
 if(action==='stars_invoice'){
  const r=await rpc('vvr_stars_order',{p_player:player,p_sku:body.sku});
  if(!r.ok)return reply(rpcError(r.data),{error:'stars_unavailable'});
  const order=r.data as {status:string;order?:string;title?:string;stars?:number;gems?:number;kind?:string};
  if(order.status!=='ok')return reply(200,order);
  const link=await botApi(botToken,'createInvoiceLink',{title:order.title,
   description:order.kind==='support'?'Добровольная поддержка разработки игры.':`${order.gems} самоцветов на аккаунт VIKING VS ROME.`,
   payload:order.order,currency:'XTR',prices:[{label:order.title,amount:order.stars}]});
  return link.ok?reply(200,{status:'ok',link:link.result,order:order.order}):reply(503,{error:'invoice_failed'});
 }
 if(action==='premium_transfer'){
  const r=await rpc('vvr_premium_transfer',{p_player:player,p_operation:body.operationId,p_amount:body.amount});
  return r.ok?reply(200,r.data):reply(rpcError(r.data),{error:'transfer_rejected'});
 }
 if(action==='admin_finance'){
  const r=await rpc('vvr_finance_report',{p_actor:player,p_days:body.days??30});
  return r.ok?reply(200,r.data):reply(rpcError(r.data),{error:'admin_request_rejected'});
 }
 // Owner tools reuse the admin status check (role + password unlock) before touching the bot.
 const status=await rpc('vvr_admin_status',{p_actor:player,p_before:null});
 if(!status.ok)return reply(rpcError(status.data),{error:'admin_request_rejected'});
 const owner=isRecord(status.data)&&status.data.role==='owner';
 if(action==='admin_bot'){
  const url=project+'/functions/v1/vvr-community/stars-webhook';
  const info=await botApi(botToken,'getWebhookInfo');
  const current=isRecord(info.result)?String(info.result.url??''):'';
  if(body.connect===true){
   if(!owner)return reply(403,{error:'owner_required'});
   if(current&&current!==url)return reply(200,{status:'webhook_in_use',current});
   const set=await botApi(botToken,'setWebhook',{url,secret_token:await webhookSecret(sessionKey),
    allowed_updates:['message','pre_checkout_query']});
   await botApi(botToken,'setMyCommands',{commands:[{command:'start',description:'Играть'},
    {command:'terms',description:'Условия покупок'},{command:'paysupport',description:'Помощь с оплатой'}]}).catch(()=>undefined);
   if(!set.ok)return reply(200,{status:'failed',error:set.description});
  }
  const [me,after,balance]=await Promise.all([botApi(botToken,'getMe'),botApi(botToken,'getWebhookInfo'),
   botApi(botToken,'getMyStarBalance').catch(()=>({ok:false}))]);
  const hook=isRecord(after.result)?after.result:{};
  return reply(200,{status:'ok',bot:isRecord(me.result)?me.result.username:null,
   webhook:{ours:hook.url===url,url:hook.url?String(hook.url).replace(/bot[^/]*$/,''):'',pending:hook.pending_update_count??0,
    lastError:hook.last_error_message??null},
   stars:balance.ok?balance.result:null});
 }
 if(action==='admin_stars_refund'){
  if(!owner)return reply(403,{error:'owner_required'});
  const begin=await rpc('vvr_stars_refund_begin',{p_actor:player,p_order:body.order});
  if(!begin.ok)return reply(rpcError(begin.data),{error:'admin_request_rejected'});
  const b=begin.data as {status:string;telegram?:string;charge?:string};
  if(b.status!=='ok')return reply(200,b);
  const refund=await botApi(botToken,'refundStarPayment',{user_id:Number(b.telegram),telegram_payment_charge_id:b.charge}).catch(()=>({ok:false}));
  const finish=await rpc('vvr_stars_refund_finish',{p_actor:player,p_order:body.order,p_ok:refund.ok===true});
  return finish.ok?reply(200,finish.data):reply(rpcError(finish.data),{error:'admin_request_rejected'});
 }
 return reply(400,{error:'invalid_request'});
}
