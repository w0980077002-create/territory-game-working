import {telegramAccountId} from './telegram';

const params=new URLSearchParams(typeof window==='undefined'?'':window.location?.search??'');
const requested=params.get('hero')??params.get('testProfile');
export const isolatedProfile=!!requested&&/^[a-z0-9_-]{1,32}$/.test(requested);
export const LEGACY_SAVE_KEY='lootborn-codex-v1';
export const telegramProfile=isolatedProfile?undefined:telegramAccountId();
export const SAVE_KEY=LEGACY_SAVE_KEY+(isolatedProfile?':test:'+requested:telegramProfile?':telegram:'+telegramProfile:'');
export const saveLockProfile=isolatedProfile?requested:telegramProfile?'telegram:'+telegramProfile:'owner';
