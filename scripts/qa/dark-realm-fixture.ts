/** Isolated browser profile; never touches the owner's local or cloud save. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {referencePlayer} from '../sim/fairness';
const p=referencePlayer(13,'berserker');p.chaosite=100;p.darkFloor=1;p.sound=false;
mkdirSync('.tmp/qa',{recursive:true});
writeFileSync('.tmp/qa/realm-player.json',JSON.stringify(p));
