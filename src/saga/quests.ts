/**
 * Quests: a rotating daily pool, weekly goals, a story chain per region and long mastery tracks.
 * Progress is always derived from real counters in the save (never from timers), rewards are claimed once,
 * and a missed day costs nothing: the board simply shows a fresh set next time.
 */
import type {Player} from '../core/types';
import {roll} from '../core/world';
import {boxOf,peekBox,hasFlag,setFlag,sagaOf} from './save';
import {grant,stageCoins,regionMaterial,type Reward} from './rewards';
import {regions,stageInRegion,regionIndex,STORY_STAGES} from './regions';
import {setCounts} from './gear';
export interface QuestDef {id:string;text:string;keys:string[];goal:number;reward:(p:Player)=>Reward}
/** Reads a long-term counter. `stat:` = classic save fields, `world:` = road events, others = saga.n. */
export function counter(p:Player,key:string):number{
 if(key==='stat:kills')return p.kills;if(key==='stat:bosses')return p.bosses;if(key==='stat:stage')return p.stage-1;if(key==='stat:dark')return p.darkFloor-1;if(key==='stat:arena')return p.arenaWins;if(key==='stat:level')return p.level;
 if(key==='state:set2')return Math.max(...Object.values(setCounts(p)))>=2?1:0;
 if(key==='world:events')return ['cache','caravan','altar','ambushReady','ambushWon','omen'].reduce((a,k)=>a+(p.world?.counts[k]??0),0);
 if(key.startsWith('world:'))return p.world?.counts[key.slice(6)]??0;
 return p.saga?.n[key]??0;
}
const total=(p:Player,keys:string[])=>keys.reduce((a,k)=>a+counter(p,k),0);
const mat=(p:Player,n:number)=>({[regionMaterial(p)]:n});
export const dailyPool:QuestDef[]=[
 {id:'d_wins',text:'Победить в 8 боях',keys:['stat:kills'],goal:8,reward:p=>({gold:stageCoins(p,1.5),horn:2})},
 {id:'d_boss',text:'Победить 2 боссов',keys:['stat:bosses','win:dungeon','win:darkness'],goal:2,reward:p=>({gems:12,mats:mat(p,3)})},
 {id:'d_interrupt',text:'Сорвать 5 вражеских атак',keys:['interrupt'],goal:5,reward:p=>({gold:stageCoins(p,1),gems:5})},
 {id:'d_caravan',text:'Спасти караван на дороге',keys:['world:caravan'],goal:1,reward:p=>({gems:8,horn:1,mats:mat(p,2)})},
 {id:'d_cache',text:'Найти тайник у дороги',keys:['world:cache'],goal:1,reward:p=>({gold:stageCoins(p,1.2)})},
 {id:'d_rune',text:'Испытать руну алтаря в бою',keys:['world:altar'],goal:1,reward:p=>({gems:6,mats:mat(p,2)})},
 {id:'d_team',text:'Победить вместе со спутником: 2 комбо «Добивание» или «Контратака»',keys:['combo:finish','combo:riposte'],goal:2,reward:p=>({gems:10,horn:2})},
 {id:'d_horn',text:'Протрубить в Рог Трофеев 3 раза',keys:['horn'],goal:3,reward:p=>({gold:stageCoins(p,1)})},
 {id:'d_forge',text:'Усилить или перековать предмет 2 раза',keys:['upgrade','reforge'],goal:2,reward:p=>({gems:6,mats:mat(p,2)})},
 {id:'d_set',text:'Собрать комплект: надеть 2 предмета одного набора',keys:['state:set2'],goal:1,reward:p=>({gems:10,mats:mat(p,4)})},
 {id:'d_lair',text:'Победить хозяина Логова',keys:['win:dungeon'],goal:1,reward:p=>({gems:8,chaosite:10})},
 {id:'d_sea',text:'Завершить морскую экспедицию',keys:['expedition'],goal:1,reward:p=>({gems:10,mats:{pearl:2}})},
 {id:'d_hammer',text:'Применить Молот Тора 6 раз',keys:['skill:2'],goal:6,reward:p=>({gold:stageCoins(p,1)})},
 {id:'d_arena',text:'Выиграть поединок на Арене',keys:['win:arena'],goal:1,reward:()=>({tokens:15,gems:5})}
];
export const weeklyPool:QuestDef[]=[
 {id:'w_boss',text:'Победить 12 боссов',keys:['stat:bosses','win:dungeon','win:darkness'],goal:12,reward:p=>({gems:60,horn:6,mats:mat(p,10)})},
 {id:'w_stage',text:'Пройти 3 этапа саги',keys:['stat:stage'],goal:3,reward:p=>({gems:50,gold:stageCoins(p,6)})},
 {id:'w_interrupt',text:'Сорвать 40 вражеских атак',keys:['interrupt'],goal:40,reward:p=>({gems:40,mats:mat(p,8)})},
 {id:'w_sea',text:'Завершить 3 морские экспедиции',keys:['expedition'],goal:3,reward:()=>({gems:45,mats:{pearl:6}})},
 {id:'w_tower',text:'Подняться на 5 этажей Башни',keys:['tower'],goal:5,reward:p=>({gems:50,chaosite:25,gold:stageCoins(p,4)})},
 {id:'w_dark',text:'Пройти 3 этажа Царства Тьмы',keys:['stat:dark'],goal:3,reward:()=>({gems:45,mats:{dusk:4}})},
 {id:'w_road',text:'Пережить 8 событий дороги',keys:['world:events'],goal:8,reward:p=>({gems:35,horn:5,gold:stageCoins(p,3)})},
 {id:'w_arena',text:'Выиграть 5 поединков на Арене',keys:['win:arena'],goal:5,reward:()=>({gems:35,tokens:60})}
];
export const DAILY_COUNT=6,WEEKLY_COUNT=4;
export const dayOf=(now=Date.now())=>new Date(now).toISOString().slice(0,10);
/** ISO-like week id (Monday based, UTC). */
export function weekOf(now=Date.now()){const d=new Date(now),day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day);return d.toISOString().slice(0,10)}
const hashText=(s:string)=>{let h=7;for(const c of s)h=Math.imul(h^c.charCodeAt(0),0x45d9f3b);return h|0};
function pick(pool:QuestDef[],count:number,seed:number){return pool.map((q,i)=>({q,r:roll(seed,i,11)})).sort((a,b)=>a.r-b.r).slice(0,count).map(v=>v.q.id)}
interface Board {id:string;picks:string[];base:Record<string,number>;claimed:string[]}
interface QuestBox {day?:Board;week?:Board}
const fresh=(p:Player,id:string,pool:QuestDef[],count:number):Board=>{const picks=pick(pool,count,hashText(id)^(p.world?.seed??7)),base:Record<string,number>={};for(const q of pool)if(picks.includes(q.id))for(const k of q.keys)base[k]=counter(p,k);return {id,picks,base,claimed:[]}};
/** Starts today's/this week's board if needed. Call inside a mutation; cheap and idempotent. */
export function ensureQuests(p:Player,now=Date.now()){const box=boxOf<QuestBox>(p,'quests',()=>({})),day=dayOf(now),week=weekOf(now);let changed=false;if(box.day?.id!==day){box.day=fresh(p,day,dailyPool,DAILY_COUNT);changed=true}if(box.week?.id!==week){box.week=fresh(p,week,weeklyPool,WEEKLY_COUNT);changed=true}return changed}
export interface QuestView {def:QuestDef;progress:number;done:boolean;claimed:boolean;reward:Reward}
function view(p:Player,board:Board|undefined,pool:QuestDef[],current:boolean):QuestView[]{
 if(!board||!current)return [];
 return board.picks.flatMap(id=>{const def=pool.find(q=>q.id===id);if(!def)return [];const state=def.keys[0].startsWith('state:'),progress=Math.max(0,Math.min(def.goal,state?total(p,def.keys):total(p,def.keys)-def.keys.reduce((a,k)=>a+(board.base[k]??0),0)));return [{def,progress,done:progress>=def.goal,claimed:board.claimed.includes(id),reward:def.reward(p)}]});
}
export function dailyView(p:Player,now=Date.now()){const b=peekBox<QuestBox>(p,'quests');return view(p,b?.day,dailyPool,b?.day?.id===dayOf(now))}
export function weeklyView(p:Player,now=Date.now()){const b=peekBox<QuestBox>(p,'quests');return view(p,b?.week,weeklyPool,b?.week?.id===weekOf(now))}
export function claimBoard(p:Player,kind:'day'|'week',id:string,now=Date.now()):Reward|null{
 ensureQuests(p,now);const box=boxOf<QuestBox>(p,'quests',()=>({})),board=kind==='day'?box.day!:box.week!,q=(kind==='day'?dailyView(p,now):weeklyView(p,now)).find(v=>v.def.id===id);
 if(!q||!q.done||q.claimed)return null;board.claimed.push(id);grant(p,q.reward);sagaOf(p).n['quests:'+kind]=(p.saga!.n['quests:'+kind]??0)+1;return q.reward;
}
// ── Story chains: three milestones and one flavoured task per region ──
export interface StoryQuest {id:string;region:number;text:string;progress:number;goal:number;done:boolean;claimed:boolean;reward:Reward}
const flavour:[string,string,number][]=[['Сорвать 10 атак в Ледяных вершинах','interrupt',10],['Устоять перед 5 штормовыми волнами','stood',5],['Снять проклятие рун Молотом Тора 5 раз','cleanse',5],['Подставить раскрытых врагов под 5 обвалов','rock:open',5],['Сломать строй легиона 8 раз','phalanx:break',8],['Пережить 10 всплесков жара Бездны','heat',10]];
export function storyQuests(p:Player):StoryQuest[]{
 const out:StoryQuest[]=[],cleared=p.stage-1;
 regions.forEach((r,i)=>{const base=i*10,make=(suffix:string,text:string,progress:number,goal:number,reward:Reward)=>{const id=`s${i}_${suffix}`;out.push({id,region:i,text,progress:Math.max(0,Math.min(goal,progress)),goal,done:progress>=goal,claimed:hasFlag(p,'q:'+id),reward})};
  make('road',`${r.name}: пройти 3 этапа`,cleared-base,3,{gems:15,mats:{[['ice','harbor','forest','peaks','limes','ember'][i]]:4}});
  make('mid',`Победить стража рубежа: ${r.bosses[4][1]}`,cleared>=base+5?1:0,1,{gems:25,horn:3,mats:{[['ice','harbor','forest','peaks','limes','ember'][i]]:6}});
  make('task',flavour[i][0],regionIndex(p.stage)>=i?counter(p,flavour[i][1]):0,flavour[i][2],{gems:20,chaosite:15});
  make('end',`Сразить владыку: ${r.bosses[9][1]}`,cleared>=base+10?1:0,1,{gems:60,horn:5,chaosite:30});
 });return out;
}
export function claimStory(p:Player,id:string):Reward|null{const q=storyQuests(p).find(v=>v.id===id);if(!q||!q.done||q.claimed||!setFlag(p,'q:'+id))return null;grant(p,q.reward);return q.reward}
/** Regions the player can act on now: the current one plus any with unclaimed rewards. */
export const activeStory=(p:Player)=>storyQuests(p).filter(q=>q.region===Math.min(5,regionIndex(p.stage))&&p.stage<=STORY_STAGES||q.done&&!q.claimed);
// ── Mastery: long tracks with four tiers ──
export interface MasteryDef {id:string;name:string;group:string;keys:string[];unit:string}
export const masteryTiers=[10,50,200,1000],masteryGems=[10,25,60,150];
export const mastery:MasteryDef[]=[
 {id:'berserker',name:'Путь Берсерка',group:'Классы',keys:['cls:berserker'],unit:'побед'},{id:'ranger',name:'Путь Следопыта',group:'Классы',keys:['cls:ranger'],unit:'побед'},{id:'runologist',name:'Путь Рунолога',group:'Классы',keys:['cls:runologist'],unit:'побед'},
 {id:'strike',name:'Сокрушительный удар',group:'Навыки',keys:['skill:0'],unit:'применений'},{id:'call',name:'Клич Одина',group:'Навыки',keys:['skill:1'],unit:'применений'},{id:'hammer',name:'Молот Тора',group:'Навыки',keys:['skill:2'],unit:'применений'},{id:'breaker',name:'Срыватель атак',group:'Навыки',keys:['interrupt'],unit:'срывов'},
 {id:'goose',name:'Гусь-Обнимусь',group:'Спутники',keys:['dive','combo:finish'],unit:'пике и добиваний'},{id:'dog',name:'Верный пёс',group:'Спутники',keys:['guard','combo:riposte'],unit:'заслонов и контратак'},
 {id:'lair',name:'Охотник Логова',group:'Испытания',keys:['win:dungeon'],unit:'побед'},{id:'dark',name:'Сквозь Тьму',group:'Испытания',keys:['stat:dark'],unit:'этажей'},{id:'tower',name:'Башня испытаний',group:'Испытания',keys:['tower'],unit:'этажей'},{id:'sea',name:'Мореход',group:'Испытания',keys:['expedition'],unit:'экспедиций'},{id:'arena',name:'Гладиатор',group:'Испытания',keys:['stat:arena'],unit:'побед'},
 {id:'road',name:'Исследователь дорог',group:'Мир',keys:['world:events'],unit:'событий'},{id:'bosses',name:'Гроза владык',group:'Мир',keys:['stat:bosses'],unit:'боссов'},{id:'smith',name:'Мастер кузни',group:'Мир',keys:['upgrade','reforge','engrave','craft'],unit:'работ'}
];
export function masteryView(p:Player){return mastery.map(def=>{const value=total(p,def.keys),tier=masteryTiers.filter(t=>value>=t).length,claimed=masteryTiers.filter((_,i)=>hasFlag(p,`m:${def.id}:${i}`)).length;return {def,value,tier,claimed,next:masteryTiers[Math.min(3,tier)],ready:tier>claimed}})}
export function claimMastery(p:Player,id:string):Reward|null{const m=masteryView(p).find(v=>v.def.id===id);if(!m||!m.ready||!setFlag(p,`m:${id}:${m.claimed}`))return null;const reward:Reward={gems:masteryGems[m.claimed],horn:m.claimed+1};grant(p,reward);return reward}
export const questBadge=(p:Player,now=Date.now())=>dailyView(p,now).some(q=>q.done&&!q.claimed)||weeklyView(p,now).some(q=>q.done&&!q.claimed)||storyQuests(p).some(q=>q.done&&!q.claimed)||masteryView(p).some(m=>m.ready);
/** Three honest suggestions: what to do in five minutes, this evening and this week. */
export function goals(p:Player,now=Date.now()){
 const open=(list:QuestView[])=>list.filter(q=>!q.claimed).sort((a,b)=>b.progress/b.def.goal-a.progress/a.def.goal)[0],d=open(dailyView(p,now)),w=open(weeklyView(p,now)),r=regions[regionIndex(p.stage)%6],n=stageInRegion(p.stage);
 return [
  {span:'5 минут',text:d?`${d.def.text} · ${d.progress}/${d.def.goal}`:`Пройти волну ${p.wave}/5 этапа ${regionIndex(p.stage)+1}-${n}`},
  {span:'Вечер',text:n<=5?`Дойти до стража рубежа: ${r.bosses[4][1]}`:`Дойти до владыки региона: ${r.bosses[9][1]}`},
  {span:'Неделя',text:w?`${w.def.text} · ${w.progress}/${w.def.goal}`:`Закончить регион «${r.name}» и собрать комплект`}
 ];
}
