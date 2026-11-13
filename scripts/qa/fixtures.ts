import {writeFileSync,mkdirSync} from 'node:fs';
import {referencePlayer} from '../sim/fairness';
import {freshWorld} from '../../src/core/world';
mkdirSync('.tmp/qa',{recursive:true});
const fixtures=[1,13,34,50,60].map(stage=>{const p=referencePlayer(stage,'berserker');p.wave=3;p.world=freshWorld(123);return p});
writeFileSync('.tmp/qa/fixtures.json',JSON.stringify(fixtures));
