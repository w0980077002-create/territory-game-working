/**
 * One place that decides who the hero meets in every mode. Deterministic for a given save,
 * so a reload rebuilds exactly the same plan (the fight itself is restored from the snapshot).
 */
import type {Player} from '../core/types';
import balance from '../../config/test-balance.v1.json';
import {bossIds,miniIds,heroArt,characters} from '../data/catalog';
import {campaignPlan,threat,regionOf,regions,curve,type EncounterPlan,type FoePlan} from './regions';
const chapterOne=balance.first_chapter_test,config=balance.combat_test_settings,rules=balance.locked_owner_rules;
const briefs=[['Стража Драконьих ворот','Щиты держат натиск. Молот Тора разбивает защиту.','Защитники'],['Налёт в торговом посаде','Пират бьёт дважды. Прервите тяжёлый таран.','Налётчики'],['Засада над ущельем','Маг готовит залп. Удар в момент замаха сорвёт его.','Дальний бой'],['Последний рубеж','Элитный отряд. Разбейте щит и используйте окно слабости.','Элита'],['Матриарх ледяного шёлка','Удар срывает кокон. Молот Тора очищает паутину.','Хозяйка цитадели']];
export const nameOf=(id:string)=>characters.find(c=>c.id===id)?.name.split(',')[0]??id;
/** Owner-approved first chapter, byte-for-byte the numbers it shipped with. */
function firstChapterPlan(wave:number):EncounterPlan{
 const region=regions[0],base=config.regular_enemy_base_hp,atk=config.regular_enemy_base_attack,[title,hint,role]=briefs[wave-1];
 if(wave>=5)return {units:[{id:'spider_queen',hp:base*chapterOne.boss_hp_multiplier,atk:atk*config.boss_attack_multiplier,def:11}],boss:true,finale:false,timer:rules.boss_timer_seconds,title,hint,role,region,bossName:title,ultimates:['Ледяной кокон','Ядовитый прилив']};
 return {units:chapterOne.encounters[wave-1].map((id,i)=>({id,hp:base*chapterOne.regular_hp_multipliers[wave-1][i],atk:atk*chapterOne.regular_attack_multipliers[wave-1],def:11})),boss:false,finale:false,timer:0,title,hint,role,region};
}
export function planFor(p:Player,mode:string):EncounterPlan{
 const stage=p.stage,wave=p.wave,seed=p.world?.seed??7,region=regionOf(stage),t=threat(stage);
 if(mode==='campaign')return stage===1?firstChapterPlan(wave):campaignPlan(stage,wave,seed);
 if(mode==='farm'){const plan=stage===1?firstChapterPlan(Math.min(4,wave)):campaignPlan(stage,Math.min(4,wave),seed);return {...plan,units:plan.units.slice(0,2).map(u=>({id:u.id,hp:u.hp*curve.farm_hp,atk:u.atk*curve.farm_attack,def:u.def})),title:'Фарм · '+region.name,hint:'Золото и опыт без продвижения по главе.',role:'Фарм',hazard:undefined}}
 const solo=(unit:FoePlan,title:string,hint:string,role:string,timer=rules.boss_timer_seconds as number):EncounterPlan=>({units:[unit],boss:true,finale:false,timer,title,hint,role,region,bossName:unit.title??nameOf(unit.id)});
 if(mode==='dungeon'){const id=miniIds[(stage-1)%miniIds.length];return solo({id,hp:t.bossHp*curve.lair_hp,atk:t.bossAtk,def:t.def},'Логово · '+nameOf(id),'Мини-босс логова. Победа приносит предмет и шанс именного трофея.','Логово')}
 if(mode==='darkness'){const id=bossIds[(p.darkFloor-1)%bossIds.length];return solo({id,hp:t.bossHp*curve.dark_hp*(1+(p.darkFloor-1)*.15),atk:t.bossAtk*(1+(p.darkFloor-1)*.04),def:t.def},`Тьма · этаж ${p.darkFloor}`,'Босс Царства тьмы. Каждый этаж сильнее предыдущего.','Царство тьмы')}
 if(mode==='arena'){const id=heroArt[p.heroClass==='berserker'?'ranger':'berserker'];return solo({id,hp:t.bossHp*curve.arena_hp,atk:t.bossAtk*.9,def:t.def},'Арена','Поединок с виртуальным бойцом.','Арена',60)}
 return campaignPlan(Math.max(2,stage),Math.min(4,wave),seed);
}
