import {useEffect,useRef,useState} from 'react';
import {community} from '../community/client';
import type {TonConnectUI} from '@tonconnect/ui';
import {commentBoc} from '../core/tonComment';

type History={at:string;kind:'stars'|'transfer';title?:string;stars?:number;gems:number;status:string};
type Wallet={address:string|null;verified?:boolean;owner?:boolean;treasury?:string|null;history:History[]};
const proofText:Record<string,string>={proof_expired:'Подтверждение устарело · подключите кошелёк ещё раз',
 proof_domain:'Кошелёк подписал другой сайт · подключение отклонено',proof_signature:'Подпись кошелька не прошла проверку',
 proof_inactive_wallet:'Кошелёк ещё не активирован в сети TON · сделайте в нём первую операцию и подключите снова'};
/** USDT jetton master on TON mainnet. */
const USDT='EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';
let ui:Promise<{connect:TonConnectUI;friendly:(raw:string)=>string}>|undefined;
/** The wallet SDK is loaded only when a player opens this section. */
function tonConnect(){
 ui??=import('@tonconnect/ui').then(({TonConnectUI,toUserFriendlyAddress})=>({
  connect:new TonConnectUI({manifestUrl:new URL('tonconnect-manifest.json',document.baseURI).href}),friendly:(raw:string)=>toUserFriendlyAddress(raw)}));
 return ui;
}
async function balances(raw:string){
 const base='https://toncenter.com/api/v3/';
 const [ton,usdt]=await Promise.all([
  fetch(base+'account?address='+encodeURIComponent(raw)).then(r=>r.ok?r.json():null).catch(()=>null),
  fetch(base+'jetton/wallets?limit=1&owner_address='+encodeURIComponent(raw)+'&jetton_address='+USDT).then(r=>r.ok?r.json():null).catch(()=>null),
 ]);
 return {ton:ton?.balance!==undefined?Number(ton.balance)/1e9:undefined,
  usdt:usdt?.jetton_wallets?Number(usdt.jetton_wallets[0]?.balance??0)/1e6:undefined};
}
const historyTitle=(h:History)=>h.kind==='transfer'?`Перенос герою · ${h.gems} самоцветов`:
 `Покупка за Stars · ⭐ ${h.stars}${h.gems?` · ${h.gems} самоцветов`:''}${h.status==='refunded'?' · возвращена':''}`;

/** Optional TON wallet: address, TON/USDT balances and the player's game payment history. Not required to play. */
export function TonWallet(){
 const [wallet,setWallet]=useState<Wallet>();
 const [friendly,setFriendly]=useState('');
 const [funds,setFunds]=useState<{ton?:number;usdt?:number}>();
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 const opened=useRef(false);
 async function open(){
  if(opened.current)return;
  opened.current=true;
  try{
   const [state,sdk]=await Promise.all([community<Wallet>('ton_wallet',{action:'get'}),tonConnect()]);
   setWallet(state);
   sdk.connect.onStatusChange(async connected=>{
    const raw=connected?.account.address;
    const item=connected?.connectItems?.tonProof;
    if(!raw)return;
    // Only a fresh ton_proof links a wallet: the server checks the signature against the wallet's on-chain key.
    if(!item||!('proof' in item)){setNotice('Чтобы привязать кошелёк к аккаунту, отключите его и подключите снова');return}
    try{
     const result=await community<Wallet&{status?:string}>('ton_wallet',{action:'link',address:raw,proof:item.proof});
     if(result.status){setNotice(proofText[result.status]??'Подключение отклонено');return}
     setWallet(result);setNotice('Кошелёк подключён и подтверждён');
    }catch{setNotice('Не удалось сохранить адрес кошелька');}
   });
  }catch{setNotice('Кошелёк временно недоступен');opened.current=false;}
 }
 useEffect(()=>{
  const raw=wallet?.address;
  if(!raw){setFriendly('');setFunds(undefined);return}
  void tonConnect().then(sdk=>setFriendly(sdk.friendly(raw)));
  void balances(raw).then(setFunds);
 },[wallet?.address]);
 async function connect(){
  setBusy(true);setNotice('');
  try{
   const [sdk,{payload}]=await Promise.all([tonConnect(),community<{payload:string}>('ton_proof_payload')]);
   sdk.connect.setConnectRequestParameters({state:'ready',value:{tonProof:payload}});
   await sdk.connect.openModal();
  }catch{setNotice('Не удалось открыть выбор кошелька');}
  finally{setBusy(false)}
 }
 const [amount,setAmount]=useState('0.01');
 /** Owner-only test transfer to the treasury. The wallet asks the owner to confirm; nothing is sent automatically. */
 async function testTransfer(){
  const ton=Number(amount);
  if(!wallet?.treasury||!(ton>=0.01&&ton<=1))return setNotice('Сумма теста — от 0.01 до 1 TON');
  if(!window.confirm(`Отправить ${ton} TON в казну? Кошелёк попросит подтверждение.`))return;
  setBusy(true);
  try{
   const sdk=await tonConnect();
   await sdk.connect.sendTransaction({validUntil:Math.floor(Date.now()/1000)+300,
    messages:[{address:wallet.treasury,amount:String(Math.round(ton*1e9)),payload:commentBoc('vvr-test-'+Date.now().toString(36))}]});
   setNotice('Перевод отправлен · проверьте поступление в админке → Финансы');
  }catch{setNotice('Перевод отменён или не прошёл');}
  finally{setBusy(false)}
 }
 async function disconnect(){
  setBusy(true);
  try{
   await (await tonConnect()).connect.disconnect().catch(()=>undefined);
   setWallet(await community<Wallet>('ton_wallet',{action:'unlink'}));
   setNotice('Кошелёк отключён');
  }catch{setNotice('Не удалось отключить кошелёк');}
  finally{setBusy(false)}
 }
 return <details className="saga-disclosure" onToggle={event=>{if((event.target as HTMLDetailsElement).open)void open()}}>
  <summary>Кошелёк TON</summary>
  <div className="admin-analytics">
   <p className="hint">Необязателен для игры. Покупки в игре — только за Telegram Stars; кошелёк нужен для будущих наград и истории операций.</p>
   {wallet&&(wallet.address?<>
    <p>Адрес · <code>{friendly?friendly.slice(0,6)+'…'+friendly.slice(-6):'…'}</code> · {wallet.verified?'подтверждён ✓':'не подтверждён — отключите и подключите снова'}</p>
    <p>Баланс · {funds?.ton!==undefined?funds.ton.toFixed(3)+' TON':'— TON'} · {funds?.usdt!==undefined?funds.usdt.toFixed(2)+' USDT':'— USDT'}</p>
    {wallet.owner&&wallet.verified&&wallet.treasury&&<details className="saga-disclosure"><summary>Тестовый перевод в казну (владелец)</summary>
     <label>Сумма, TON<input inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)}/></label>
     <button type="button" className="action secondary" disabled={busy} onClick={()=>void testTransfer()}>Отправить тест</button>
    </details>}
    <button type="button" className="action secondary" disabled={busy} onClick={()=>void disconnect()}>Отключить кошелёк</button>
   </>:<button type="button" className="action secondary" disabled={busy} onClick={()=>void connect()}>Подключить кошелёк</button>)}
   {wallet&&<details className="saga-disclosure"><summary>История операций · {wallet.history.length}</summary>
    {wallet.history.length?wallet.history.map((h,i)=><p key={i}>{new Date(h.at).toLocaleDateString()} · {historyTitle(h)}</p>):<p>Операций пока нет.</p>}
   </details>}
   {notice&&<p role="status">{notice}</p>}
  </div>
 </details>;
}
