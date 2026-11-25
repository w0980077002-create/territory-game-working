export const zones = {
 head: {label: 'Голова', impact: 'в голову', multiplier: 1.25},
 chest: {label: 'Грудь', impact: 'в грудь', multiplier: 1},
 belly: {label: 'Живот', impact: 'в живот', multiplier: 1},
 legs: {label: 'Ноги', impact: 'по ногам', multiplier: .85},
} as const;
export type ArenaZone = keyof typeof zones;
export type ArenaHero = 'berserker' | 'ranger' | 'runologist';
export const arenaHeroes: readonly ArenaHero[] = ['berserker','ranger','runologist'];
export const arenaSkills = ['strike','call','hammer'] as const;
export type ArenaSkill = typeof arenaSkills[number];
export const arenaKits = {
 balanced: {label: 'Равновесие', weapon: 4, armor: 3},
 offensive: {label: 'Натиск', weapon: 8, armor: 0},
 defensive: {label: 'Заслон', weapon: 0, armor: 6},
} as const;
export type ArenaKit = keyof typeof arenaKits;
export const gearSlots = ['weapon','armor','helmet','shield','boots','ring1','amulet'] as const;
export const arenaElixirs = {
 heal_small: {label: 'Малое лечение', qty: 2, detail: 'Восстанавливает 18% здоровья, минимум 50 HP.'},
 heal_large: {label: 'Большое лечение', qty: 1, detail: 'Восстанавливает 35% здоровья, минимум 150 HP.'},
 attack: {label: 'Сила', qty: 1, detail: '+25% атаки до конца боя, минимум +10.'},
 defense: {label: 'Защита', qty: 1, detail: '+25% защиты до конца боя, минимум +10.'},
 crit: {label: 'Крит', qty: 1, detail: '+15 п.п. к шансу крита, до 75%.'},
 time: {label: 'Время', qty: 1, detail: 'Сокращает таймер раунда на 10 секунд, минимум до 30.'},
 potion: {label: 'Зелье лечения', qty: 0, detail: 'Восстанавливает 45% максимального здоровья. Перезарядка 4 с.'},
 adrenaline: {label: 'Адреналин', qty: 0, detail: 'Воскрешает союзника в командном бою.'},
} as const;
export type ArenaElixir = keyof typeof arenaElixirs;
export type ArenaMove = {attack:ArenaZone;blocks:[ArenaZone,ArenaZone];skill:ArenaSkill|null};
export type ArenaCommand =
 | {kind:'move';move:ArenaMove}
 | {kind:'auto';enabled:boolean}
 | {kind:'item';item:ArenaElixir};
export type ArenaFighter = {
 name:string;level:number;hero:ArenaHero;hp:number;maxHp:number;
 online:boolean;moved:boolean;gear:number[];
};
export type ArenaReason = 'hp'|'time'|'afk'|'disconnect'|'leave';
export type ArenaResult = {
 outcome:'win'|'loss'|'draw';reason:ArenaReason;points:number;finishedAt:number;
};
export type ArenaMessage = {id:number;at:number;text:string;author?:string};
export type ArenaMatchView = {
 id:string;bot:boolean;training?:boolean;round:number;deadline:number;you:ArenaFighter;opponent:ArenaFighter;
 control:boolean;controlRevision:number;nextSequence:number;auto:boolean;belt:Record<ArenaElixir,number>;
 itemReadyAt:Partial<Record<ArenaElixir,number>>;
 ready:Record<ArenaSkill,number>;log:ArenaMessage[];chat:ArenaMessage[];chatDeadline:number|null;
 result?:ArenaResult;
};
export type ArenaView = {
 now:number;level:number;points:number;
 queued?:{id:string;since:number;control:boolean;controlRevision:number};match?:ArenaMatchView;
 lastResult?:{id:string;chatDeadline:number};
};
export const LEVEL_RANGE = 7;
export const MATCH_WAIT_MS = 20_000;
export const ROUND_MS = 60_000;
export const OFFLINE_MS = 8_000;
export const CHAT_MS = 30*60_000;
export const ITEM_COOLDOWN_MS = 70_000;
