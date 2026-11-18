import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installHeadless} from '../scripts/sim/bot';
import {mountBattle,battle} from '../src/game/Battle';
import {freshPlayer,useGame,parseSave,exportSave} from '../src/core/store';
import {realmStart,realmResume} from '../src/dark/actions';
installHeadless();
test('paid realm checkpoint remains resumable after campaign stage and wave have advanced',()=>{
 useGame.setState({p:freshPlayer(),panel:null,recoveryRequired:false,storageError:false});
 const stop=mountBattle({getContext:()=>({})} as unknown as HTMLCanvasElement);
 try{
  assert.ok(realmStart(1,'ward'));const b=battle!;b.phase='fight';b.hp-=17;b.units[0].hp-=9;b.cooldowns[0]=3;b.pause();const hp=b.hp,foe=b.units[0].hp,charge=useGame.getState().p.chaosite;
  b.leaveRealm();useGame.getState().mutate(p=>{p.stage=4;p.wave=3});
  const restored=parseSave(exportSave(),true)!;assert.ok(restored);useGame.setState({p:restored});b.restorePlayer();
  assert.ok(realmResume());assert.equal(b.mode,'darkness');assert.equal(b.hp,hp);assert.equal(b.units[0].hp,foe);assert.equal(b.cooldowns[0],3);assert.equal(useGame.getState().p.chaosite,charge);assert.equal(useGame.getState().p.stage,4);assert.equal(useGame.getState().p.wave,3);
 }finally{stop()}
});
