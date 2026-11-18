/** One local writer per save profile. Browser-owned locks survive background pauses and expire on crash. */
let writable=typeof window==='undefined'||typeof navigator==='undefined'||!navigator.locks;
if(typeof window!=='undefined'&&typeof navigator!=='undefined'&&navigator.locks){
 const params=new URLSearchParams(window.location.search),requested=params.get('hero')??params.get('testProfile');
 const profile=requested&&/^[a-z0-9_-]{1,32}$/.test(requested)?requested:'owner';
 const acquire=()=>{
  void navigator.locks.request(`lootborn-profile:${profile}`,async()=>{
   writable=true;
   await new Promise<void>(resolve=>window.addEventListener('pagehide',()=>{writable=false;resolve()},{once:true}));
  }).catch(()=>{writable=false});
 };
 acquire();
 window.addEventListener('pageshow',event=>{if(event.persisted)acquire()});
}
export const realmSessionWritable=()=>writable;
