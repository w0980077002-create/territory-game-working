import postgres from 'postgres';
import {PlayerSaves} from './store';

export function saveDatabaseUrl(raw:string,ref:string|undefined,local:boolean){
 let url:URL|undefined;
 try{url=new URL(raw)}catch{/* Keep credentials out of errors. */}
 if(!url||url.protocol!=='postgresql:'||!url.password||url.search||url.hash)
  throw new Error('VVR_DB_URL must be a PostgreSQL URL without query parameters');
 if(local){
  if(url.hostname!=='127.0.0.1'||url.username!=='vvr_save_login')throw new Error('Local VVR saves require a loopback database and vvr_save_login');
 }else{
  const project=ref&&/^[a-z0-9]{20}$/.test(ref);
  const direct=url.hostname===`db.${ref}.supabase.co`&&url.username==='vvr_save_login';
  const pooler=/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)&&url.username===`vvr_save_login.${ref}`;
  if(!project||!(direct||pooler)||(url.port&&url.port!=='5432')||url.pathname!=='/postgres')
   throw new Error('VVR saves require the dedicated VVR project and its restricted session connection');
 }
 return url.toString();
}

export function openPlayerSaves(url:string|undefined,ref:string|undefined,local:boolean){
 if(!url)return;
 return new PlayerSaves(postgres(saveDatabaseUrl(url,ref,local),{
  ssl:local?false:{rejectUnauthorized:true},max:4,prepare:false,connect_timeout:5,idle_timeout:20,
 }));
}
