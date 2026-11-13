import {playCampaign} from './bot';
import {threat} from '../../src/saga/regions';
const log=playCampaign((process.argv[2]??'ranger') as 'ranger',61,{potions:false});
for(const r of log)if(r.stage%4===2||r.stage>56)console.log(r.stage,'lvl',r.level,'cp',r.cp,'bossT',r.bossTime.toFixed(1),'taken',r.taken.toFixed(2),'hpLeft',r.hpLeft.toFixed(2),'def',r.defeats,'bossAtk',Math.round(threat(r.stage).bossAtk),'bossHp',Math.round(threat(r.stage).bossHp));
