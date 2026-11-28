import {botApi, handleWebhook, webhookSecret} from './stars.ts';

type Rpc = (name: string, body: unknown) => Promise<{ok: boolean; data: unknown}>;
type Reply = (status: number, body: unknown) => Response;
const encoder = new TextEncoder();

type Checkout = {pre_checkout_query?: {id?: string}; message?: {
  chat?: {id?:number;type?:string};
  successful_payment?: {currency?:string;total_amount?:unknown};
  refunded_payment?: {currency?:string;total_amount?:unknown;invoice_payload?:string;telegram_payment_charge_id?:string};
}};

export async function assortmentWebhook(request: Request, session: string, bot: string, rpc: Rpc) {
  if(request.headers.get('x-telegram-bot-api-secret-token')!==await webhookSecret(session)) {
    return new Response('{}',{status:401});
  }
  const update=await request.clone().json().catch(()=>null) as Checkout|null;
  const refund=update?.message?.refunded_payment;
  const chat=update?.message?.chat;
  if(refund?.currency==='XTR'&&chat?.type==='private'&&Number.isSafeInteger(refund.total_amount)&&
     /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(refund.invoice_payload??'')) {
    const result=await rpc('vvr_assortment_refunded',{p_order:refund.invoice_payload,p_telegram:String(chat.id),
      p_stars:refund.total_amount,p_charge:refund.telegram_payment_charge_id??''});
    if(!result.ok||result.data!==null)return new Response('{}',{status:result.ok?200:500});
  }
  return handleWebhook(request, session, bot, async (name, body) => {
    if (name === 'vvr_stars_precheck' || name === 'vvr_shipyard_precheck') {
      const check = await rpc('vvr_assortment_precheck', {...body as object,p_query:update?.pre_checkout_query?.id ?? ''});
      if (!check.ok || check.data !== null) return check;
    }
    if (name==='vvr_stars_paid') {
      const payment=update?.message?.successful_payment;
      if (payment?.currency!=='XTR' || !Number.isSafeInteger(payment.total_amount)) {
        return {ok:true,data:{status:'invalid_currency'}};
      }
    }
    return rpc(name, body);
  });
}

export async function validAdReceipt(secret: string, attempt: string, receipt: string, signature: string): Promise<boolean> {
  if (!secret || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const bytes = Uint8Array.from(signature.match(/../g)!, pair => parseInt(pair,16));
  return crypto.subtle.verify('HMAC',key,bytes,encoder.encode('vvr-ad:'+attempt+':'+receipt));
}

function adUrl(base: string|undefined): URL|null {
  if (!base) return null;
  try {
    const url = new URL(base);
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch { return null; }
}

export async function assortmentAction(kind:string, body:Record<string,unknown>, player:string, bot:string,
  rpc:Rpc, reply:Reply, adBase:string|undefined, adSecret:string|undefined) {
  if (kind==='assortment') {
    const state = await rpc('vvr_assortment_state',{p_player:player});
    if (!state.ok || !state.data || typeof state.data!=='object') return reply(503,{error:'unavailable'});
    const data = state.data as {adsOpen?:boolean};
    return reply(200,{...data,adsReady:!!data.adsOpen && !!adSecret && !!adUrl(adBase)});
  }
  if (kind==='rewarded_ad') {
    const url = adUrl(adBase);
    if (!url || !adSecret) return reply(200,{status:'unavailable'});
    const result = await rpc('vvr_rewarded_ad_begin',{p_player:player});
    if (!result.ok || typeof result.data!=='string') return reply(200,{status:'unavailable'});
    url.searchParams.set('attempt',result.data);
    return reply(200,{status:'ok',url:url.href});
  }
  const result = await rpc('vvr_assortment_order',{p_player:player,p_sku:body.sku});
  if (!result.ok || !result.data || typeof result.data!=='object') return reply(503,{error:'unavailable'});
  const order = result.data as {status:string; order?:string;title?:string;stars?:number};
  if (order.status!=='ok') return reply(200,order);
  const invoice = await botApi(bot,'createInvoiceLink',{title:order.title,
    description:'Игровое оформление и удобства VIKING VS ROME. Возврат: /paysupport.',
    payload:order.order,currency:'XTR',prices:[{label:order.title,amount:order.stars}]});
  return invoice.ok ? reply(200,{status:'ok',link:invoice.result}) : reply(503,{error:'invoice_failed'});
}
