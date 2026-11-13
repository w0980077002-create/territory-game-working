import {playCampaign} from './bot';
import type {HeroClass} from '../../src/core/types';
const until=Number(process.argv[2]??62),classes=(process.argv[3]??'berserker,ranger,runologist').split(',') as HeroClass[];
for(const c of classes){const t=Date.now(),log=playCampaign(c,until);console.log(`\n== ${c} · reached stage ${log.at(-1)?.stage??0} in ${((Date.now()-t)/1000).toFixed(1)}s`);
 console.log('stage lvl      cp  def waveT bossT left  hp%');
 for(const r of log)if(r.stage<=12||r.stage%5===0||r.defeats>2)console.log(`${String(r.stage).padStart(5)} ${String(r.level).padStart(3)} ${String(r.cp).padStart(8)} ${String(r.defeats).padStart(3)} ${r.waveTime.toFixed(1).padStart(5)} ${r.bossTime.toFixed(1).padStart(5)} ${r.bossLeft.toFixed(0).padStart(4)} ${(r.hpLeft*100).toFixed(0).padStart(4)}`)}
