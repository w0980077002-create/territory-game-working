/** Verifies the current repeat-reward behavior in a disposable test profile. */
import assert from 'node:assert/strict';
import {installHeadless,seedRandom} from '../bot';
import {referencePlayer} from '../fairness';
import {useGame} from '../../../src/core/store';
import {mountBattle,battle} from '../../../src/game/Battle';
import {realmLast,realmRun,REALM_COST} from '../../../src/dark/realm';
import {duskCount} from '../../../src/dark/rules';
import {collectRealmReward,realmStart} from '../../../src/dark/actions';

installHeadless();
seedRandom(17);
let now=Date.UTC(2026,0,1,10);
Date.now=()=>now;
const p=referencePlayer(30,'berserker');
p.chaosite=100;
p.darkFloor=1;
p.sound=false;
useGame.setState({p,panel:null,auto:true,continueOnVictory:true,recoveryRequired:false,storageError:false});
const unmount=mountBattle({getContext:()=>({}),addEventListener(){},removeEventListener(){}} as unknown as HTMLCanvasElement);
const engine=battle!;
const getPlayer=()=>useGame.getState().p;
const output=[];
try {
  for(let completed=0;completed<6;completed++){
    const funds=getPlayer().chaosite;
    const previous=duskCount(getPlayer());
    const start=now;
    assert.ok(realmStart(1,'fury'));
    assert.equal(getPlayer().chaosite,funds-REALM_COST);
    for(let i=0;i<20*600&&realmRun(getPlayer());i++){
      now+=50;
      engine.update(.05,.05);
      const run=realmRun(getPlayer());
      if(run?.stage.startsWith('CHOICE')&&run.pair) assert.ok(engine.choosePortal(run.pair[0].id));
    }
    assert.equal(realmLast(getPlayer())?.win,true);
    assert.ok(collectRealmReward());
    assert.ok(!collectRealmReward());
    assert.equal(duskCount(getPlayer()),previous+1);
    output.push({run:completed+1,seconds:(now-start)/1000,dusk:duskCount(getPlayer()),chaosite:getPlayer().chaosite});
  }
  assert.equal(duskCount(getPlayer())-duskCount(p),6);
  console.log(JSON.stringify(output,null,2));
} finally {
  unmount();
}
