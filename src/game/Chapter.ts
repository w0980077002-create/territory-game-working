import balance from '../../config/test-balance.v1.json';
export const chapterOne=balance.first_chapter_test;
export const encounterBriefs=[
 {title:'Стража Драконьих ворот',hint:'Щиты держат натиск. Молот Тора разбивает защиту.',role:'Защитники'},
 {title:'Налёт в торговом посаде',hint:'Пират бьёт дважды. Прервите тяжёлый таран.',role:'Налётчики'},
 {title:'Засада над ущельем',hint:'Маг готовит залп. Удар в момент замаха сорвёт его.',role:'Дальний бой'},
 {title:'Последний рубеж',hint:'Элитный отряд. Разбейте щит и используйте окно слабости.',role:'Элита'},
 {title:'Матриарх ледяного шёлка',hint:'Удар срывает кокон. Молот Тора очищает паутину.',role:'Хозяйка цитадели'}
];
export function firstChapter(stage:number,mode:string){return stage===1&&mode==='campaign'}
