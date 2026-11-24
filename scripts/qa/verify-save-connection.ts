import {createSaveConnection} from '../../server/saves/config';

async function verify(){
 const url=process.env.VVR_DB_URL;
 if(!url)throw new Error('missing VVR_DB_URL');
 const sql=createSaveConnection(url,process.env.VVR_DB_PROJECT_REF,false);
 try{
  const [result]=await sql<{
   expectedRole:boolean;tls:boolean;readWrite:boolean;
   privileged:boolean;foreignRowsVisible:boolean;revisionIndex:boolean;major:number;
  }[]>`
   select
    current_user = 'vvr_save_login' as "expectedRole",
    coalesce((select ssl from pg_stat_ssl where pid=pg_backend_pid()),false) as tls,
    has_column_privilege(current_user,'vvr.players','telegram_id','INSERT')
      and has_table_privilege(current_user,'vvr.solo_snapshots','SELECT')
      and has_table_privilege(current_user,'vvr.solo_snapshots','INSERT') as "readWrite",
    exists (select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
      or has_table_privilege(current_user,'vvr.solo_snapshots','UPDATE')
      or has_table_privilege(current_user,'vvr.solo_snapshots','DELETE')
      or has_table_privilege(current_user,'vvr.resource_receipts','SELECT')
      or has_table_privilege(current_user,'vvr.resource_receipts','INSERT')
      or has_function_privilege(current_user,'vvr.issue_resource(uuid,text,uuid,text,integer)','EXECUTE')
      as privileged,
    exists(select 1 from vvr.players) or exists(select 1 from vvr.solo_snapshots) as "foreignRowsVisible",
    to_regclass('vvr.solo_snapshots_player_id_restored_from_idx') is not null as "revisionIndex",
    current_setting('server_version_num')::int/10000 as major`;
  if(!result?.expectedRole||!result.tls||!result.readWrite||result.privileged||
    result.foreignRowsVisible||!result.revisionIndex||result.major!==17)
   throw new Error('cloud privileges, RLS, TLS or migration check failed');
  console.log('VVR cloud check passed: verified TLS, PostgreSQL 17, restricted role and private saves.');
 }finally{
  await sql.end({timeout:5});
 }
}

verify().catch(error=>{
 const code=(error as {code?:unknown}).code;
 const expected=['ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','ENOTFOUND','ETIMEDOUT','CONNECT_TIMEOUT','28P01','28000',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','ERR_TLS_CERT_ALTNAME_INVALID','42501'];
 console.error('VVR cloud check failed'+(typeof code==='string'&&expected.includes(code)?' ('+code+')':'')+
  '. Check the server secret, VVR project, role, TLS trust and network.');
 process.exitCode=1;
});
