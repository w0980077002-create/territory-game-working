import type {Player} from '../core/types';
import {count,boxOf,peekBox,setFlag,hasFlag} from './save';
import {grant,type Reward} from './rewards';
import {balanceOf,grantSolo} from './soloEconomy';
import {relicIds,relicLevel} from '../dark/rules';

export const wingRules={cost:[4,8,12,18,25,35,45,60,80,100],hp:1,attack:.6,defense:.8} as const;
export const wingLooks=['Северный ветер','Скрыты'] as const;
export function wingRank(p:Player){
 const value=peekBox<{rank?:number}>(p,'wings')?.rank;
 return Number.isInteger(value)&&value!>=0&&value!<=wingRules.cost.length?value!:0;
}
export function wingBonuses(rank:number){return {hp:rank*wingRules.hp,attack:rank*wingRules.attack,defense:rank*wingRules.defense}}
export function growWings(p:Player,expected:number){
 const cost=wingRules.cost[expected];
 if(!p.equipment.wings||wingRank(p)!==expected||!cost||balanceOf(p,'wing')<cost)return false;
 grantSolo(p,'wing',-cost);
 boxOf(p,'wings',()=>({rank:0})).rank=expected+1;
 return true;
}

type Milestone={id:string;name:string;route:string;value:(p:Player)=>number;targets:readonly number[];reward:(index:number)=>Reward};
export const heroTracks:readonly Milestone[]=[
 {id:'xp',name:'Трактат опыта',route:'hero',value:p=>p.level,targets:[5,10,20,35,50],reward:i=>({gold:500*(i+1),solo:{scroll:10*(i+1)}})},
 {id:'relic',name:'Фонд реликвий',route:'relic',value:p=>relicIds.reduce((sum,id)=>sum+relicLevel(p,id),0),targets:[1,4,8,15,25],reward:i=>({res:{shard:5*(i+1)},solo:{awakeShard:2*(i+1)}})},
 {id:'bless',name:'Фонд благословения',route:'blessing',value:p=>p.blessing,targets:[2,4,7,10,15],reward:i=>({gold:200*(i+1),chaosite:5*(i+1)})},
 {id:'adventure',name:'Фонд приключений',route:'adventure',value:p=>p.bosses+count(p,'win:dungeon')+Math.max(0,p.darkFloor-1),targets:[1,5,15,30,60],reward:i=>({gems:8*(i+1),res:{seal:i+1}})},
 {id:'arena',name:'Фонд Арены',route:'arena',value:p=>p.arenaWins,targets:[1,5,15,30,60],reward:i=>({tokens:10*(i+1),solo:{scroll:10*(i+1)}})},
 {id:'wing',name:'Рост крыльев',route:'wings',value:wingRank,targets:[1,3,6,10],reward:i=>({gold:600*(i+1),solo:{awakeShard:5*(i+1)}})},
];
const trackFlag=(id:string,index:number)=>'solo:track:'+id+':'+index;
export const trackClaimed=(p:Player,id:string,index:number)=>hasFlag(p,trackFlag(id,index));
export function claimTrack(p:Player,id:string,index:number){
 const track=heroTracks.find(track=>track.id===id),target=track?.targets[index];
 if(!track||!target||track.value(p)<target||!setFlag(p,trackFlag(id,index)))return false;
 grant(p,track.reward(index));
 return true;
}
