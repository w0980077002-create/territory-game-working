import {playCampaign} from './bot';
import {curve} from '../../src/saga/regions';
import type {HeroClass} from '../../src/core/types';
// usage: tune.ts until hpLinear hpPower hpRate atkLinear atkPower atkRate [regionStep]
const [until,hl,hp,hr,al,ap,ar,rs]=process.argv.slice(2).map(Number);
if(hl!==undefined&&!Number.isNaN(hl)){Object.assign(curve.hp,{linear:hl,power:hp,rate:hr});Object.assign(curve.attack,{linear:al,power:ap,rate:ar});if(!Number.isNaN(rs)&&rs!==undefined)curve.region_step=rs}
for(const c of ['berserker','ranger','runologist'] as HeroClass[]){const log=playCampaign(c,until||62);
 const row=(f:(r:typeof log[number])=>string)=>log.filter(r=>r.stage%3===1||r.stage%10===0).map(f).join(' ');
 console.log(`\n${c}: reached ${log.at(-1)?.stage} · total defeats ${log.reduce((a,r)=>a+r.defeats,0)}`);
 console.log('stage '+row(r=>String(r.stage).padStart(3)));console.log('level '+row(r=>String(r.level).padStart(3)));console.log('bossT '+row(r=>r.bossTime.toFixed(0).padStart(3)));console.log('waveT '+row(r=>r.waveTime.toFixed(0).padStart(3)));console.log('hp%   '+row(r=>(r.hpLeft*100).toFixed(0).padStart(3)));console.log('def   '+row(r=>String(r.defeats).padStart(3)))}
