import {fight} from './fairness';
const rows=[];
for(let s=1;s<=60;s++)for(const c of ['berserker','ranger','runologist'] as const)for(const v of [0,1])for(let w=1;w<=5;w++)rows.push(fight(s,w,c,'mixed',v,2026+s+v));
const weak=[],prepared=[];
for(const c of ['berserker','ranger','runologist'] as const)for(const v of [0,1])for(const s of [20,30,40,50,60]){weak.push(fight(s,5,c,'neglected',v,500+s));prepared.push(fight(s,5,c,'prepared',v,500+s))}
const times=rows.filter(r=>r.boss&&r.stage>10).map(r=>r.seconds).sort((a,b)=>a-b);
console.log(JSON.stringify({mixed:{runs:rows.length,wins:rows.filter(r=>r.win).length,losses:rows.filter(r=>!r.win),maxHit:Math.max(...rows.map(r=>r.maxHit)),bossMedian:times[Math.floor(times.length/2)]},neglected:{runs:weak.length,losses:weak.filter(r=>!r.win).length},prepared:{runs:prepared.length,losses:prepared.filter(r=>!r.win)},checkpoints:rows.filter(r=>[13,34].includes(r.stage)&&r.wave===5)},null,2));
