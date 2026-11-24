declare const __ARENA_STAGING__:boolean;
export const arenaStaging=typeof __ARENA_STAGING__!=='undefined'&&__ARENA_STAGING__;

// A public Pages build uses the same Arena API without switching save profiles.
export const arenaApiOrigin=(import.meta.env?.VITE_ARENA_API_ORIGIN as string|undefined)?.replace(/\/$/,'')??'';
export const onlineArenaEnabled=arenaStaging||!!arenaApiOrigin;
