import balance from '../../config/test-balance.v1.json';
import type {Player} from '../core/types';
import {miniIds} from '../data/catalog';
import {bumpCount,count,peekBox,sagaOf} from './save';
import {utcDay} from './soloEconomy';

export const lairRules={
 entry:balance.combat_test_settings.mode_entry_chaosite,perKeeper:2,perDay:5,revives:2,heal:.5,
 keeperSpawns:[1,2,3],
 raidReward:{gold:150,gems:5,xp:50,res:{shard:2}},
} as const;
export function lairKeeper(p:Player){
 const selected=peekBox<{id:string}>(p,'lair')?.id;
 return selected&&miniIds.includes(selected)?selected:miniIds[(p.stage-1)%miniIds.length];
}
export function lairAvailable(p:Player,keeper:string){
 const required=lairRules.keeperSpawns[miniIds.indexOf(keeper)];
 return !!required&&(p.stage>=required||lairCleared(p,keeper));
}
export const lairTrophies={capybara_bruiser:'belt',senior_driller:'boots',moss_eater:'moss'} as const;
export function lairTrophy(id:string){return Object.hasOwn(lairTrophies,id)?lairTrophies[id as keyof typeof lairTrophies]:undefined}
export function lairCleared(p:Player,id:string){
 const trophy=lairTrophy(id);
 return count(p,'lair:clear:'+id)>0||!!trophy&&!!p.saga?.flags.includes('perk:'+trophy);
}
export function noteLairWin(p:Player,keeper:string){
 if(miniIds.includes(keeper))bumpCount(p,'lair:clear:'+keeper);
}
export function selectLair(p:Player,id:string){
 if(!lairAvailable(p,id))return false;
 sagaOf(p).box.lair={id};
 return true;
}
interface RaidDay {day:number;total:number;keeper:Record<string,number>}
export function raidDay(p:Player,now=Date.now()):RaidDay{
 const old=peekBox<RaidDay>(p,'raidDay'),day=utcDay(now);
 return old&&old.day>=day?{day:old.day,total:old.total,keeper:{...old.keeper}}:{day,total:0,keeper:{}};
}
export function payRaid(p:Player,id:string,expected:number,now=Date.now()){
 const day=raidDay(p,now);
 if(!miniIds.includes(id)||!lairCleared(p,id)||day.day!==utcDay(now)||day.total!==expected||
  day.total>=lairRules.perDay||(day.keeper[id]??0)>=lairRules.perKeeper||p.chaosite<lairRules.entry||
  p.rewardOffer&&!p.rewardOffer.resolved)return false;
 p.chaosite-=lairRules.entry;
 day.total++;
 day.keeper[id]=(day.keeper[id]??0)+1;
 sagaOf(p).box.raidDay=day;
 return true;
}
export const lairReviveCost=(stage:number)=>200+20*stage;
