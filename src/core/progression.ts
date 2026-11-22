import type {Player} from './types';

type Anchor = {level:number; bonus:number};
type Anchors = {forge?:Anchor; heart?:Anchor};
export type Progression = {v:1; anchors:Anchors; legacyImport?:Anchors};
type ProgressionPlayer = Pick<Player,'forge'|'relic'|'progression'>;

const forgeThreshold=300;
const heartThreshold=100;
const legacyForgeBonus=(level:number)=>Math.floor(level/3);
const legacyHeartBonus=(level:number)=>.03*level;
const glacierCurve=(level:number)=>level<=heartThreshold
 ? legacyHeartBonus(level)
 : 3+6*Math.log1p((level-heartThreshold)/200);

export function validProgression(value:unknown):value is Progression{
 if(!value||typeof value!=='object')return false;
 const data=value as Progression;
 const validAnchors=(anchors:Anchors)=>{
  if(!anchors||typeof anchors!=='object'||Array.isArray(anchors))return false;
  const {forge,heart}=anchors;
  return (forge===undefined||!!forge&&Number.isFinite(forge.level)&&forge.level>forgeThreshold&&forge.bonus===legacyForgeBonus(forge.level))
   &&(heart===undefined||!!heart&&Number.isFinite(heart.level)&&heart.level>heartThreshold&&heart.bonus===legacyHeartBonus(heart.level));
 };
 return data.v===1&&validAnchors(data.anchors)&&(data.legacyImport===undefined||validAnchors(data.legacyImport));
}

/** Legacy backups share the profile's first migration, even after alternating with modern exports. */
export function migrateProgression(p:ProgressionPlayer,previous?:Progression):Progression{
 const bound=previous?.legacyImport;
 if(p.progression)return bound ? {...p.progression,legacyImport:bound} : p.progression;
 const anchors=bound??{
  ...(p.forge>forgeThreshold?{forge:{level:p.forge,bonus:legacyForgeBonus(p.forge)}}:{}),
  ...(p.relic>heartThreshold?{heart:{level:p.relic,bonus:legacyHeartBonus(p.relic)}}:{}),
 };
 return {v:1,anchors,legacyImport:anchors};
}

export function forgeBonus(level:number,anchor?:Anchor):number{
 if(anchor)return level<=anchor.level ? legacyForgeBonus(level) : anchor.bonus+Math.floor((level-anchor.level)/9);
 return level<=forgeThreshold ? legacyForgeBonus(level) : 100+Math.floor((level-forgeThreshold)/9);
}

export function nextForgeBonus(level:number,anchor?:Anchor):number{
 const origin=anchor?.level??forgeThreshold;
 if(level>=origin)return 9-(level-origin)%9;
 const nextLegacy=3*(legacyForgeBonus(level)+1);
 return (nextLegacy<=origin?nextLegacy:origin+9)-level;
}

export function glacierAttackBonus(p:Pick<Player,'relic'|'progression'>):number{
 const {relic:level,progression}=p;
 if(!progression)return legacyHeartBonus(level);
 const anchor=progression.anchors.heart;
 if(!anchor)return glacierCurve(level);
 if(level<=anchor.level)return legacyHeartBonus(level);
 // log1p of the ratio preserves the anchored contribution at the migration point.
 return anchor.bonus+6*Math.log1p((level-anchor.level)/(200+anchor.level-heartThreshold));
}

export const glacierUpgradeCost=(level:number)=>300*(level+1);
