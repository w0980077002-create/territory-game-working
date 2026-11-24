declare const __ARENA_STAGING__:boolean;
export const arenaStaging=typeof __ARENA_STAGING__!=='undefined'&&__ARENA_STAGING__;

export function localArenaActor(){
 if(typeof window==='undefined'||window.location.hostname!=='127.0.0.1')return;
 const actor=new URLSearchParams(window.location.search).get('arenaLocal');
 if(actor==='alice'||actor==='boris')return actor;
}
