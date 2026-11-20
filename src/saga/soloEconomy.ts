import type {Player} from '../core/types';
import {count,sagaOf} from './save';

export const dayMs=86_400_000;
export const utcDay=(now:number)=>Math.floor(now/dayMs);
export const utcWeek=(now:number)=>Math.floor((utcDay(now)+3)/7);

export const soloResources={
 soul:{name:'Звёздные души',source:'Обмен печатей призыва и награды событий',use:'Покупка и обновление предложений спутников'},
 awake:{name:'Камни пробуждения',source:'Монополия, СчастТайна и обмен пяти осколков',use:'Ступени пробуждения спутников'},
 awakeShard:{name:'Осколки пробуждения',source:'Дневные победы и игровые события',use:'Обмен на Камни пробуждения'},
 scroll:{name:'Таинственные свитки',source:'Дневные победы и игровой магазин',use:'Призыв и усиление рун'},
 monopoly:{name:'Морские билеты',source:'Дневные победы',use:'Броски в Монополии'},
 fortune:{name:'Билеты СчастТайны',source:'Дневные победы',use:'Розыгрыши в СчастТайне'},
 jackpot:{name:'Жетоны джекпота',source:'Клетка СчастТайны',use:'Обмен на камень пробуждения или перья'},
 wing:{name:'Перо ветра',source:'Дневные победы и обмен в СчастТайне',use:'Рост крыльев'},
} as const;
export type SoloResource=keyof typeof soloResources;
export const balanceOf=(p:Player,id:SoloResource)=>count(p,'solo:'+id);
export function grantSolo(p:Player,id:SoloResource,amount:number){
 const next=balanceOf(p,id)+amount;
 if(!Number.isSafeInteger(next)||next<0||next>=1e15)throw new RangeError('Invalid solo resource balance');
 sagaOf(p).n['solo:'+id]=next;
}

export const followerEconomy={
 prices:[30,60,180,300,4000],
 weights:[[75,25,0,0,0],[57.75,27,11,4,.25],[57.75,27,11,4,.25]],
 sealSouls:10,shardSouls:2,refresh:10,freeDaily:1,freeWeekly:3,legendary:6,mythic:20,
 shardExchange:5,maxOwned:120,baseStars:40,starsPerUnlock:10,
 awakening:[
  {cost:3,lv:20,stars:3},{cost:5,lv:30,stars:5},{cost:10,lv:40,stars:8},{cost:11,lv:50,stars:10},
  {cost:12,lv:60,stars:14},{cost:13,lv:70,stars:18},{cost:14,lv:85,stars:22},{cost:15,lv:100,stars:26},
 ],
} as const;

export const dailyVictoryRewards=[
 {win:1,scroll:10,awakeShard:3,monopoly:5,fortune:3,wing:1},
 {win:5,scroll:20,awakeShard:7,monopoly:10,fortune:5,wing:2},
] as const;

export function soloVictory(p:Player,now=Date.now()){
 const s=sagaOf(p),day=utcDay(now),last=s.n['solo:lastVictoryDay']??0;
 if(day<last)return;
 const wins=(day===last?s.n['solo:dailyWins']??0:0)+1;
 s.n['solo:lastVictoryDay']=day;
 s.n['solo:dailyWins']=wins;
 const reward=dailyVictoryRewards.find(r=>r.win===wins);
 if(reward){
  for(const id of ['scroll','awakeShard','monopoly','fortune','wing'] as const)grantSolo(p,id,reward[id]);
 }
}
