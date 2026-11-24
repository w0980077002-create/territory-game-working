import {arenaStaging,localArenaActor} from '../arena/staging';
import {telegramAccountId,tg} from './telegram';

const params=new URLSearchParams(typeof window==='undefined'?'':window.location?.search??'');
const launch=new URLSearchParams(tg()?.initData).get('start_param');
const acceptanceLaunch=/^carnival_acceptance_([1-8])$/.exec(launch??'');
const requested=params.get('hero')??params.get('testProfile')
  ??(launch==='mail_acceptance'?'mail-acceptance':acceptanceLaunch?'carnival-acceptance':null);
const acceptanceDay=requested==='carnival-acceptance'?(params.get('carnivalDay')??acceptanceLaunch?.[1]):undefined;
const acceptanceStart=acceptanceDay&&/^[1-8]$/.test(acceptanceDay)?Date.UTC(2026,11,Number(acceptanceDay)):undefined;
const dayMs=86_400_000;
/** Only the explicitly selected local acceptance hero uses a simulated carnival date. */
export const carnivalNow=(now=Date.now())=>acceptanceStart===undefined?now:acceptanceStart+now%dayMs;
export const isolatedProfile=!!requested&&/^[a-z0-9_-]{1,32}$/.test(requested);
export const mailAcceptanceProfile=requested==='mail-acceptance';
export const LEGACY_SAVE_KEY=arenaStaging?'lootborn-arena-staging-v1':'lootborn-codex-v1';
export const telegramProfile=isolatedProfile||arenaStaging?undefined:telegramAccountId();
// The old shared staging key is left intact: its Telegram owner cannot be inferred.
const arenaOwner=arenaStaging?(telegramAccountId()??localArenaActor()??'guest'):undefined;
export const SAVE_KEY=LEGACY_SAVE_KEY+(isolatedProfile?':test:'+requested:arenaOwner?':player:'+arenaOwner:telegramProfile?':telegram:'+telegramProfile:'');
const localLockProfile=isolatedProfile?requested:arenaOwner??(telegramProfile?'telegram:'+telegramProfile:'owner');
export const saveLockProfile=arenaStaging?'arena-staging:'+localLockProfile:localLockProfile;
