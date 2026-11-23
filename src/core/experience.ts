import balance from '../../config/test-balance.v1.json';
import type {Player} from './types';

const {level_exp_base,level_exp_multiplier}=balance.progression_test_settings;
const earlyCurveEnd=25;
const legacyThreshold=(level:number)=>Math.round(level_exp_base*level_exp_multiplier**(level-1));
const lateBase=legacyThreshold(earlyCurveEnd);
const lateLinear=1500;
const lateQuadratic=60;

export function xpNeeded(level:number):number{
 const safeLevel=Number.isFinite(level)?Math.max(1,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(level))):1;
 if(safeLevel<=earlyCurveEnd)return legacyThreshold(safeLevel);
 const offset=safeLevel-earlyCurveEnd;
 return lateBase+offset*(lateLinear+lateQuadratic*offset);
}

/** Cost of the next count levels on the quadratic tail, without subtracting large cumulative totals. */
function lateCost(level:number,count:number){
 const offset=level-earlyCurveEnd;
 const steps=count*(count-1)/2;
 const squares=steps*(2*count-1)/3;
 return count*xpNeeded(level)+(lateLinear+2*lateQuadratic*offset)*steps+lateQuadratic*squares;
}

/** Loading leaves banked XP intact. The next earned reward spends it using the current curve. */
export function gainExperience(p:Pick<Player,'level'|'xp'>,amount:number){
 if(!Number.isFinite(amount)||amount<=0)return;
 p.xp=Math.min(Number.MAX_VALUE,p.xp+amount);
 while(p.level<earlyCurveEnd&&p.xp>=xpNeeded(p.level)){
  p.xp-=xpNeeded(p.level);
  p.level++;
 }
 if(p.level<earlyCurveEnd||p.xp<xpNeeded(p.level)||p.level>=Number.MAX_SAFE_INTEGER)return;

 // Even a huge legacy balance takes logarithmic time. The ceiling is integer precision,
 // leaving XP banked if the saved level cannot be incremented in the existing number format.
 let low=0,high=Math.min(Number.MAX_SAFE_INTEGER-p.level,Math.floor(p.xp/xpNeeded(p.level)));
 while(low<high){
  const count=low+Math.ceil((high-low)/2);
  if(lateCost(p.level,count)<=p.xp)low=count;
  else high=count-1;
 }
 p.xp-=lateCost(p.level,low);
 p.level+=low;
}
