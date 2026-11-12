/**
 * Living World content tables. TEST_ONLY numbers: owner approves final balance later.
 * `from` is the first stage where a variant may appear, so later chapters keep showing something new.
 */
import type {EventKind,CountKey} from '../core/world';
export const WORLD_TEST_ONLY=true;
export interface Boon {id:string;name:string;short:string;detail:string;color:string;from:number}
export const boons:Boon[]=[
 {id:'fury',name:'Руна Ярости',short:'+20% урона',detail:'Удары и навыки героя сильнее на 20% в следующей встрече',color:'#ff9a5c',from:1},
 {id:'ice',name:'Руна Льда',short:'Щит 20% HP',detail:'Ледяной щит на 20% здоровья в начале следующей встречи',color:'#8ee6ff',from:1},
 {id:'wind',name:'Руна Ветра',short:'Навыки быстрее',detail:'Навыки перезаряжаются на 25% быстрее в следующей встрече',color:'#c9f7d0',from:1},
 {id:'pack',name:'Руна Стаи',short:'Спутники ×1,5',detail:'Гусь и пёс действуют в полтора раза чаще в следующей встрече',color:'#ffe08a',from:2},
 {id:'harvest',name:'Руна Жатвы',short:'+60% золота',detail:'На 60% больше золота за следующую победу',color:'#ffd24a',from:2},
 {id:'blood',name:'Руна Крови',short:'+8% вампиризма',detail:'Удары героя возвращают на 8% больше здоровья в следующей встрече',color:'#ff7d8f',from:4}
];
export const boonValues={fury:1.2,iceShield:.2,windRate:1/.75,packRate:1.5,harvestGold:.6,blood:.08};
export const boonById=(id?:string)=>boons.find(b=>b.id===id);
export interface Variant {id:string;from:number;title:string;text:string;act:string;actDetail:string;done:string}
export const variants:Record<EventKind,Variant[]>={
 cache:[
  {id:'mound',from:1,title:'Пёс что-то учуял',text:'Под сугробом у дороги спрятан тайник.',act:'Раскопать',actDetail:'пара секунд пути',done:'Тайник раскопан'},
  {id:'barrel',from:2,title:'Вмёрзшая бочка',text:'Бочка обоза вмёрзла в лёд у обочины.',act:'Разбить лёд',actDetail:'пара секунд пути',done:'Бочка вскрыта'},
  {id:'nest',from:3,title:'Блеск в вороньем гнезде',text:'На столбе что-то блестит. Гусь уже присматривается.',act:'Послать гуся',actDetail:'пара секунд пути',done:'Гусь вернулся с добычей'},
  {id:'shield',from:5,title:'Щит под снегом',text:'Из-под снега торчит край легионерского снаряжения.',act:'Откопать',actDetail:'пара секунд пути · предмет',done:'Находка в рюкзаке'}
 ],
 caravan:[
  {id:'sled',from:1,title:'Караван в беде',text:'Налётчики грабят сани торговки.',act:'Отбить караван',actDetail:'короткая схватка',done:'Караван спасён'},
  {id:'courier',from:3,title:'Гонец окружён',text:'Легионеры прижали гонца с донесением.',act:'Выручить гонца',actDetail:'короткая схватка',done:'Гонец спасён'},
  {id:'boar',from:6,title:'Вепрь у обоза',text:'Бронированный вепрь разносит обоз с припасами.',act:'Отогнать вепря',actDetail:'короткая схватка',done:'Обоз спасён'}
 ],
 ambush:[
  {id:'leap',from:1,title:'Пёс рычит на дорогу',text:'Птицы взлетели, в снегу блестят глаза. Впереди засада.',act:'Поднять щит',actDetail:'встретить врага готовым',done:'Засада раскрыта'},
  {id:'slide',from:3,title:'Снег над тропой',text:'Над тропой нависла снежная шапка, а за ней — тени.',act:'Поднять щит',actDetail:'встретить врага готовым',done:'Засада раскрыта'}
 ],
 altar:[
  {id:'stone',from:1,title:'Рунный алтарь',text:'Выберите одну руну — она действует в следующей встрече.',act:'',actDetail:'',done:'Руна принята'},
  {id:'tree',from:4,title:'Рунное древо',text:'На коре проступили знаки. Одна руна на следующую встречу.',act:'',actDetail:'',done:'Руна принята'}
 ],
 omen:[
  {id:'spider_queen',from:1,title:'Паутина на фонарях',text:'Матриарх близко. Молот Тора очищает паутину.',act:'',actDetail:'',done:''},
  {id:'fungal_king',from:1,title:'Светящиеся споры',text:'Грибной король рядом. Срывайте его залпы ударом.',act:'',actDetail:'',done:''},
  {id:'minotaur_echo',from:1,title:'Следы копыт и треснувший лёд',text:'Минотавр ждёт впереди. Берегите щит для его грохота.',act:'',actDetail:'',done:''},
  {id:'fire_abyss_lord',from:1,title:'Пепел в снегу',text:'Владыка Бездны рядом. Лечение пригодится против огня.',act:'',actDetail:'',done:''}
 ]
};
export interface Feat {id:string;title:string;detail:string;count:CountKey;goal:number;gold:number;gems:number}
export const feats:Feat[]=[
 {id:'pathfinder',title:'Следопыт',detail:'Найти 3 тайника у дороги',count:'cache',goal:3,gold:150,gems:0},
 {id:'guardian',title:'Защитник караванов',detail:'Спасти 3 каравана',count:'caravan',goal:3,gold:0,gems:5},
 {id:'runereader',title:'Чтец рун',detail:'Принять 3 руны у алтарей',count:'altar',goal:3,gold:150,gems:0},
 {id:'watchful',title:'Не застать врасплох',detail:'Раскрыть засаду заранее',count:'ambushReady',goal:1,gold:0,gems:3},
 {id:'survivor',title:'Сквозь засаду',detail:'Победить в засаде, не подготовившись',count:'ambushWon',goal:1,gold:100,gems:0},
 {id:'breaker',title:'Срыватель',detail:'Сорвать 10 атак врагов своим ударом',count:'interrupt',goal:10,gold:200,gems:0},
 {id:'gooseace',title:'Гусь-ас',detail:'Гусь сорвал 5 вражеских выстрелов',count:'dive',goal:5,gold:0,gems:5},
 {id:'loyal',title:'Верный заслон',detail:'Пёс прикрыл героя от 5 тяжёлых ударов',count:'guard',goal:5,gold:0,gems:5},
 {id:'seer',title:'Знающий приметы',detail:'Распознать 3 предвестника боссов',count:'omen',goal:3,gold:0,gems:5},
 {id:'liberator',title:'Освободитель',detail:'Освободить 5 цитаделей',count:'freed',goal:5,gold:300,gems:10}
];
export const eventNames:Record<EventKind,string>={cache:'Тайник',caravan:'Караван',ambush:'Засада',altar:'Рунный алтарь',omen:'Предвестник'};
/** Weather moods. Stage 1 always keeps Codex's approved clear look. */
export const weathers=[{id:'clear',from:1,name:'Ясный мороз'},{id:'snow',from:2,name:'Снегопад'},{id:'dusk',from:3,name:'Закат'},{id:'gale',from:5,name:'Позёмка'},{id:'aurora',from:7,name:'Сияние'}] as const;
export type WeatherId=typeof weathers[number]['id'];
