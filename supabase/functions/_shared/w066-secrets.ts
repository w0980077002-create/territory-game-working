type Secrets={botToken:string;sessionKey:string};

export function makeSecretReader(project:string,serviceKey:string,explicit:Secrets){
 let cached:Secrets|undefined;
 let expires=0;
 let pending:Promise<Secrets>|undefined;
 return async ():Promise<Secrets>=>{
  if(explicit.botToken&&explicit.sessionKey)return explicit;
  if(cached&&Date.now()<expires)return cached;
  if(!project||!serviceKey)return explicit;
  if(pending)return pending;
  pending=(async()=>{
   try{
    const res=await fetch(project+'/rest/v1/rpc/vvr_auth_secrets',{
     method:'POST',headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},
     body:'{}',signal:AbortSignal.timeout(4000),
    });
    if(!res.ok)return explicit;
    const stored=await res.json() as Partial<Secrets>|null;
    const result={
     botToken:explicit.botToken||(typeof stored?.botToken==='string'?stored.botToken:''),
     sessionKey:explicit.sessionKey||(typeof stored?.sessionKey==='string'?stored.sessionKey:''),
    };
    if(result.botToken&&result.sessionKey){cached=result;expires=Date.now()+60_000}
    return result;
   }catch{return explicit}
  })();
  try{return await pending}finally{pending=undefined}
 };
}
