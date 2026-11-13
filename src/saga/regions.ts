/**
 * Saga campaign: six regions × ten stages, each stage = four encounters and a boss.
 * Pure data and rules: no store, DOM or engine imports, so every number is reproducible in tests.
 * Stage 1 is the owner-approved first chapter and is never touched here (see game/Chapter.ts).
 * All numbers are TEST_ONLY and live in config/test-balance.v1.json → campaign_curve_test.
 */
import balance from '../../config/test-balance.v1.json';
import {roll} from '../core/world';
export const curve=balance.campaign_curve_test;
export type HazardId='blizzard'|'storm'|'curse'|'rockfall'|'phalanx'|'heat';
export type AffixId='regen'|'frenzy'|'bulwark'|'venom'|'warded'|'swift';
export const STAGES_PER_REGION=10,STORY_STAGES=60;
export interface Region {
 id:string;name:string;short:string;tagline:string;story:string;finale:string;
 districts:[string,string,string,string,string];
 hazard:HazardId;hazardFrom:number;
 /** Encounter pool: pairs/trios of regular enemy ids. */
 packs:string[][];
 /** Boss of each of the ten stages: [character id, display title]. */
 bosses:[string,string][];
 /** Named ultimates of the region's final boss at phase II and III. */
 ultimates:[string,string];
 material:string;
 look:{grade:string;gradeAlpha:number;mode:'color'|'multiply'|'soft-light'|'none';veil:string;particles:'snow'|'rain'|'spores'|'dust'|'banners'|'embers';glow:string};
}
const V='01_sword_shield_veteran',S='02_roman_spearman',P='03_pirate_bandit',C='04_club_raider',H='05_shield_spearman',L='06_red_crest_legionary',M='07_purple_mage',B='08_armored_boar';
const SPIDER='spider_queen',FUNGAL='fungal_king',MINO='minotaur_echo',FIRE='fire_abyss_lord',CAPY='capybara_bruiser',DRILL='senior_driller',MOSS='moss_eater';
export const regions:Region[]=[
 {id:'ice',name:'Ледяные вершины',short:'Вершины',tagline:'Драконьи ворота и цитадель паутины',
  story:'Матриарх затянула паутиной северные перевалы. Пробейтесь к её логову через Драконьи ворота.',finale:'Королева паутины пала. Перевалы свободны — дорога к морю открыта.',
  districts:['Драконьи ворота','Торговый посад','Мост над ущельем','Рунная роща','Цитадель Бездны'],hazard:'blizzard',hazardFrom:4,
  packs:[[V,H],[P,B],[S,M],[L,C],[C,V],[H,B],[V,S],[C,C]],
  bosses:[[SPIDER,'Матриарх ледяного шёлка'],[CAPY,'Капибара-Громила'],[MOSS,'Пожиратель мха'],[DRILL,'Старший бурильщик'],[SPIDER,'Ткачиха перевала'],[CAPY,'Громила с ледника'],[MOSS,'Мшистый страж'],[DRILL,'Ледобур'],[CAPY,'Вожак налётчиков'],[SPIDER,'Королева паутины']],
  ultimates:['Ледяной кокон','Ядовитый прилив'],material:'Ледяной шёлк',
  look:{grade:'#000',gradeAlpha:0,mode:'none',veil:'',particles:'snow',glow:'#8ee6ff'}},
 {id:'harbor',name:'Северные гавани',short:'Гавани',tagline:'Пиратские берега, шторм и корабельные пушки',
  story:'Пираты перекрыли гавани и жгут драккары. Очистите причалы и доберитесь до Адмирала Штормов.',finale:'Флот пиратов рассеян. Порт открыт для морских экспедиций.',
  districts:['Рыбацкий причал','Смоляные склады','Маяк Сигрун','Верфь драккаров','Флагман пиратов'],hazard:'storm',hazardFrom:1,
  packs:[[P,P],[P,C],[H,P],[P,B],[C,P],[V,P],[P,S],[B,C]],
  bosses:[[CAPY,'Боцман Капибар'],[DRILL,'Корабельный сверлильщик'],[CAPY,'Портовый громила'],[MOSS,'Тинный обжора'],[CAPY,'Капитан «Ржавого якоря»'],[DRILL,'Мастер абордажа'],[MOSS,'Хозяин отмелей'],[CAPY,'Квартирмейстер'],[DRILL,'Пушкарь флагмана'],[CAPY,'Адмирал Штормов']],
  ultimates:['Бортовой залп','Девятый вал'],material:'Смола и парусина',
  look:{grade:'#3d6f86',gradeAlpha:.55,mode:'color',veil:'#0a1c2e66',particles:'rain',glow:'#9fd9ff'}},
 {id:'forest',name:'Лес древних рун',short:'Рунный лес',tagline:'Маги, проклятия и алтарь Грибного короля',
  story:'В чаще проснулись рунные камни. Маги Морока накладывают проклятия — их снимает только Молот Тора.',finale:'Грибной король Морок повержен, алтарь очищен. Руны снова служат Северу.',
  districts:['Опушка шёпотов','Круг менгиров','Топь светляков','Грибной алтарь','Трон Морока'],hazard:'curse',hazardFrom:1,
  packs:[[M,M],[C,M],[B,M],[V,M],[B,B],[H,M],[M,S],[C,B]],
  bosses:[[MOSS,'Пожиратель мха'],[MOSS,'Корневой страж'],[SPIDER,'Лесная пряха'],[MOSS,'Древний мохоед'],[FUNGAL,'Споровый жрец'],[MOSS,'Хранитель менгиров'],[SPIDER,'Тенётница чащи'],[MOSS,'Болотный исполин'],[FUNGAL,'Глашатай Морока'],[FUNGAL,'Грибной король Морок']],
  ultimates:['Споровая буря','Корни Морока'],material:'Рунная пыль',
  look:{grade:'#3f8a55',gradeAlpha:.6,mode:'color',veil:'#12092e55',particles:'spores',glow:'#8dffb0'}},
 {id:'peaks',name:'Горные крепости',short:'Крепости',tagline:'Бурильщики, обвалы и Минотавр Эха',
  story:'Бурильщики подрывают скалы над тропами. В глубине крепости их стережёт Минотавр Эха.',finale:'Эхо Минотавра смолкло. Горные проходы ведут к римской границе.',
  districts:['Каменная тропа','Шахтный посёлок','Висячий мост','Буровая площадка','Чертог Эха'],hazard:'rockfall',hazardFrom:1,
  packs:[[C,B],[B,B],[V,C],[C,C],[H,B],[V,B],[C,M],[H,C]],
  bosses:[[DRILL,'Старший бурильщик'],[DRILL,'Подрывник'],[CAPY,'Каменный громила'],[DRILL,'Мастер штольни'],[MINO,'Страж чертога'],[DRILL,'Глубинный бур'],[CAPY,'Камнелом'],[DRILL,'Начальник шахты'],[MINO,'Рогатое эхо'],[MINO,'Минотавр Эха']],
  ultimates:['Грохот лавины','Двойное эхо'],material:'Горная руда',
  look:{grade:'#9a8468',gradeAlpha:.5,mode:'color',veil:'#2a130a44',particles:'dust',glow:'#ffd9a0'}},
 {id:'limes',name:'Римская граница',short:'Граница',tagline:'Фаланги, укрепления и осадные сражения',
  story:'Легионы стоят строем: пока фаланга цела, её не пробить. Ломайте строй и берите форты один за другим.',finale:'Легат Аквила сложил орла. Граница прорвана — впереди дорога на Рим.',
  districts:['Пограничный вал','Лагерь когорты','Осадный двор','Форт Орла','Шатёр легата'],hazard:'phalanx',hazardFrom:1,
  packs:[[L,S],[L,L],[H,S],[V,L],[S,S],[L,H,S],[V,L,S],[H,L,M]],
  bosses:[[L,'Центурион Марк'],[B,'Осадный вепрь'],[M,'Преторианский авгур'],[L,'Центурион Децим'],[MINO,'Чемпион арены'],[L,'Примипил'],[B,'Бронированный таран'],[M,'Верховный авгур'],[L,'Трибун когорты'],[L,'Легат Аквила']],
  ultimates:['Черепаха легиона','Залп баллист'],material:'Имперская бронза',
  look:{grade:'#c9a05a',gradeAlpha:.5,mode:'color',veil:'#3a1a0833',particles:'banners',glow:'#ffd27a'}},
 {id:'ember',name:'Огненные земли',short:'Дорога на Рим',tagline:'Пепел, жар и Владыка Огненной Бездны',
  story:'За границей земля горит. Владыка Бездны ведёт на столицу и тени всех поверженных врагов.',finale:'Владыка Огненной Бездны низвергнут у ворот Рима. Сага Севера написана — но легенды только начинаются.',
  districts:['Пепельный тракт','Обугленный лес','Лавовый брод','Врата столицы','Трон Бездны'],hazard:'heat',hazardFrom:1,
  packs:[[M,L],[B,M],[L,L],[C,M],[P,M],[L,S,M],[V,H,M],[B,B]],
  bosses:[[SPIDER,'Тень Королевы'],[CAPY,'Обожжённый Адмирал'],[FUNGAL,'Пепельный Морок'],[DRILL,'Лавовый бур'],[MINO,'Эхо в огне'],[MOSS,'Углежор'],[FUNGAL,'Споры Бездны'],[MINO,'Страж Врат'],[FIRE,'Вестник Бездны'],[FIRE,'Владыка Огненной Бездны']],
  ultimates:['Огненный шторм','Гнев Бездны'],material:'Угли Бездны',
  look:{grade:'#b5482a',gradeAlpha:.62,mode:'color',veil:'#2a050066',particles:'embers',glow:'#ff9a5c'}}
];
export const affixes:Record<AffixId,{name:string;hint:string;color:string}>={
 regen:{name:'Живучий',hint:'Лечится, пока не горит и не оглушён. Руна Огня или срыв атаки останавливают лечение.',color:'#9affb1'},
 frenzy:{name:'Неистовый',hint:'Каждая атака ускоряет следующую. Срыв атаки сбрасывает ярость.',color:'#ff9a5c'},
 bulwark:{name:'Щитоносец',hint:'Снова и снова поднимает щит. Молот Тора разбивает его, криты пробивают.',color:'#8fd8ff'},
 venom:{name:'Ядовитый',hint:'Удары отравляют героя. Молот Тора очищает яд.',color:'#b6f58f'},
 warded:{name:'Заговорённый',hint:'Обычные удары слабее на 30%, навыки сильнее на 30%.',color:'#da93ff'},
 swift:{name:'Стремительный',hint:'Замах короче, окно срыва уже. Здоровья меньше.',color:'#ffe08a'}
};
export const hazards:Record<HazardId,{name:string;hint:string;period:number;telegraph:number;color:string;warn:string}>={
 blizzard:{name:'Ледяной шквал',hint:'Шквал замедляет атаки героя. Клич Одина согревает и снимает замедление.',period:16,telegraph:2,color:'#bfeaff',warn:'ШКВАЛ БЛИЗКО'},
 storm:{name:'Штормовая волна',hint:'Волна бьёт по герою и сбивает замах. Щит, Клич Одина или заслон пса позволяют устоять.',period:13,telegraph:2.2,color:'#8fd0ff',warn:'ИДЁТ ВОЛНА'},
 curse:{name:'Проклятие рун',hint:'Каждая метка ослабляет удары героя на 12%. Молот Тора снимает все метки.',period:9,telegraph:1.6,color:'#c59bff',warn:'РУНЫ ШЕПЧУТ'},
 rockfall:{name:'Обвал',hint:'Камни бьют всех. По оглушённым и раскрытым врагам — вдвое сильнее; щит героя гасит удар.',period:12,telegraph:2.4,color:'#e3c59c',warn:'СКАЛА ТРЕЩИТ'},
 phalanx:{name:'Строй легиона',hint:'Пока стоят двое и больше — враги получают на 35% меньше урона. Первый павший ломает строй.',period:15,telegraph:2,color:'#ffd27a',warn:'БАЛЛИСТА ЗАРЯЖЕНА'},
 heat:{name:'Жар Бездны',hint:'Чем дольше бой, тем сильнее жар. Вампиризм, пёс и быстрая победа спасают от огня.',period:10,telegraph:2,color:'#ff9a5c',warn:'ЛАВА ПОДНИМАЕТСЯ'}
};
export const regionIndex=(stage:number)=>Math.floor((Math.max(1,stage)-1)/STAGES_PER_REGION);
/** After the story the six regions return as «Легендарные маршруты» with rising threat. */
export const regionOf=(stage:number)=>regions[regionIndex(stage)%regions.length];
export const stageInRegion=(stage:number)=>(Math.max(1,stage)-1)%STAGES_PER_REGION+1;
export const legendLap=(stage:number)=>Math.floor(regionIndex(stage)/regions.length);
export const regionTitle=(stage:number)=>{const lap=legendLap(stage);return (lap?`Легенда ${'I'.repeat(Math.min(3,lap))}${lap>3?'+':''} · `:'')+regionOf(stage).name};
/**
 * Threat multiplier of a stage relative to stage 1. Stages 1–60 come from a table calibrated by the
 * fixed ordinary builds (scripts/sim/fair-tune.ts); later «legend» stages continue the table's last slope.
 */
export function growth(stage:number,kind:'hp'|'atk'){
 const table:number[]=kind==='hp'?curve.hp_table:curve.attack_table,s=Math.max(1,Math.floor(stage));
 if(s<=table.length)return table[s-1];
 const last=table[table.length-1],ratio=(last/table[table.length-11])**.1;return last*ratio**(s-table.length);
}
export const stageGold=(stage:number,boss:boolean)=>Math.round((boss?balance.test_rewards.boss_win_gold_base:balance.test_rewards.regular_win_gold_base)*1.14**(Math.min(stage,curve.gold_soft_cap_stage)-1)*(1+Math.max(0,stage-curve.gold_soft_cap_stage)*curve.gold_linear_after_cap));
export const stageXp=(stage:number,boss:boolean)=>Math.round((boss?balance.combat_test_settings.boss_victory_xp:balance.combat_test_settings.wave_victory_xp)*(1+(stage-1)*curve.xp_linear));
export interface FoePlan {id:string;hp:number;atk:number;def:number;affix?:AffixId;title?:string}
export interface EncounterPlan {units:FoePlan[];boss:boolean;finale:boolean;timer:number;title:string;hint:string;role:string;hazard?:HazardId;region:Region;bossName?:string;ultimates?:[string,string]}
const affixOrder:AffixId[]=['bulwark','frenzy','regen','venom','warded','swift'];
export function affixFor(stage:number,wave:number,slot:number,seed=7):AffixId|undefined{
 if(stage<curve.affix_from_stage)return undefined;
 const elite=wave===4||wave===5,chance=elite?.75:Math.min(.45,(stage-curve.affix_from_stage)*.012+.08);
 if(roll(seed,stage,wave,slot,91)>=chance)return undefined;
 const open=affixOrder.slice(0,Math.min(affixOrder.length,2+Math.floor((stage-curve.affix_from_stage)/4)));
 return open[Math.floor(roll(seed,stage,wave,slot,92)*open.length)];
}
const affixHp=(a?:AffixId)=>a==='swift'?.85:a==='regen'?.92:1;
/** Raw threat of a regular unit / boss at a stage. Shared by campaign, tower, expeditions and raids. */
export function threat(stage:number){
 const hp=balance.combat_test_settings.regular_enemy_base_hp*curve.regular_hp_scale*growth(stage,'hp'),atk=balance.combat_test_settings.regular_enemy_base_attack*growth(stage,'atk');
 return {hp,atk,def:8+Math.min(stage,curve.defense_cap_stage)*3,bossHp:balance.combat_test_settings.regular_enemy_base_hp*curve.boss_hp_scale*growth(stage,'hp'),bossAtk:atk*balance.combat_test_settings.boss_attack_multiplier};
}
/** The campaign encounter of stage ≥ 2. Deterministic for a given world seed. */
export function campaignPlan(stage:number,wave:number,seed=7):EncounterPlan{
 const region=regionOf(stage),n=stageInRegion(stage),t=threat(stage),hazard=n>=region.hazardFrom?region.hazard:undefined;
 if(wave>=5){
  const [id,title]=region.bosses[n-1],finale=n===10,mid=n===5,scale=finale?curve.finale_hp:mid?curve.midboss_hp:1,affix=finale?undefined:affixFor(stage,5,0,seed);
  const legion=region.id==='limes'&&finale;
  const units:FoePlan[]=[{id,hp:t.bossHp*scale*affixHp(affix)*(legion?.7:1),atk:t.bossAtk*(finale?curve.finale_attack:1)*(legion?.65:1),def:t.def,affix,title}];
  if(legion)units.push({id:H,hp:t.hp*1.6,atk:t.bossAtk*.175,def:t.def,title:'Знаменосец'},{id:S,hp:t.hp*1.3,atk:t.bossAtk*.175,def:t.def,title:'Баллистарий'});
  return {units,boss:true,finale,timer:balance.locked_owner_rules.boss_timer_seconds+(finale?curve.finale_timer_bonus:0),title,hint:finale?`Финал региона. ${hazard?hazards[hazard].hint:''}`:affix?affixes[affix].hint:hazard?hazards[hazard].hint:'Срывайте тяжёлые атаки и берегите щит для ярости.',role:finale?'Владыка региона':mid?'Страж рубежа':'Страж',hazard,region,bossName:title,ultimates:finale||mid?region.ultimates:undefined};
 }
 const pick=Math.floor(roll(seed,stage,wave,5)*region.packs.length),pack=region.packs[(pick+wave+n)%region.packs.length],share=pack.length===3?curve.trio_hp_share:1;
 const units=pack.map((id,i)=>{const affix=affixFor(stage,wave,i,seed);return {id,hp:t.hp*curve.wave_hp[wave-1]*share*affixHp(affix),atk:t.atk*curve.wave_attack[wave-1]*(pack.length===3?2/3:1),def:t.def,affix}});
 const elite=units.find(u=>u.affix);
 return {units,boss:false,finale:false,timer:0,title:`${region.districts[wave-1]}`,hint:elite?affixes[elite.affix!].hint:hazard?hazards[hazard].hint:'Обычный отряд. Срыв атаки открывает окно слабости.',role:wave===4?'Элита':'Отряд',hazard,region};
}
/** Hazard clock is a pure function of fight time, so pause and reload cannot shift or repeat a strike. */
export function hazardPhase(id:HazardId,time:number,dt:number){
 const h=hazards[id],first=h.period*.55,at=(t:number)=>t<first?null:{cycle:Math.floor((t-first)/h.period),into:(t-first)%h.period},now=at(time),prev=at(time-dt);
 return {cycle:now?.cycle??-1,telegraph:now&&now.into<h.telegraph?now.into/h.telegraph:-1,strike:!!now&&!!prev&&prev.cycle===now.cycle&&prev.into<h.telegraph&&now.into>=h.telegraph,warn:h.warn};
}
