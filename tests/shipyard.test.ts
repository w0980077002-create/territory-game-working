import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SHIP_RULES,starterShipyard,previewShips,shipRate,shipCapacity,validShipyard,shipClaimable,claimShips,buyShip,upgradeShip} from '../src/core/shipyard';
import {freshPlayer,parseSave,useGame} from '../src/core/store';
import {resCount} from '../src/dark/rules';
const start=1_700_000_000_000,hour=3_600_000;
test('starter fleet has transparent rate, 12h cap and no negative time reward',()=>{
 const s=starterShipyard(start);
 assert.equal(shipRate(s),1);assert.equal(shipCapacity(s),12);
 assert.equal(previewShips(s,start+hour).stored,1);
 assert.equal(shipClaimable(s,start+20*hour),12);
 assert.equal(previewShips(s,start-hour).stored,0);
 assert.ok(validShipyard(s));assert.deepEqual(s,starterShipyard(start));
});
test('claim and reload do not duplicate red diamonds',()=>{
 const p={gold:2000,redDiamonds:0,shipyard:starterShipyard(start)};
 assert.equal(claimShips(p,start+hour),1);
 assert.equal(claimShips(p,start+hour),0);
 const again=JSON.parse(JSON.stringify(p));
 assert.equal(claimShips(again,start+hour),0);
 assert.equal(claimShips(again,start+2*hour),1);
 assert.equal(again.redDiamonds,2);
});
test('building and upgrading cannot multiply previously accumulated hours',()=>{
 const p={gold:5000,shipyard:starterShipyard(start),redDiamonds:0};
 assert.equal(buyShip(p,start+hour),true);
 assert.equal(p.shipyard.stored,1);
 assert.equal(shipRate(p.shipyard),2);
 assert.equal(upgradeShip(p,'drakkar-1',start+2*hour),true);
 assert.equal(p.shipyard.stored,3);
 assert.equal(shipRate(p.shipyard),3);
 assert.equal(claimShips(p,start+2*hour),3);
 assert.equal(buyShip(p,start+2*hour),true);
 assert.equal(buyShip(p,start+2*hour),false);
 assert.equal(upgradeShip(p,'unknown',start+2*hour),false);
});
test('old saves survive while invalid ship data triggers recovery',()=>{
 const p=freshPlayer(),old=structuredClone(p);
 delete old.shipyard;delete old.redDiamonds;
 assert.ok(parseSave(JSON.stringify(old)));
 assert.ok(parseSave(JSON.stringify(p)));
 const bad=structuredClone(p);bad.redDiamonds=-1;
 assert.equal(parseSave(JSON.stringify(bad)),null);
 const duplicated=structuredClone(p);duplicated.shipyard!.ships.push({id:'drakkar-1',level:1});
 assert.equal(parseSave(JSON.stringify(duplicated)),null);
});
test('store commits the claim and blocks duplicate tap',()=>{
 const data=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)}});
 const p=freshPlayer();p.shipyard=starterShipyard(start);
 useGame.setState({p,recoveryRequired:false,storageError:false});
 useGame.getState().shipAction('claim');
 const amount=useGame.getState().p.redDiamonds!;
 assert.equal(amount,12);
 useGame.getState().shipAction('claim');
 assert.equal(useGame.getState().p.redDiamonds,amount);
 assert.equal(parseSave([...data.values()][0])?.redDiamonds,amount);
});
test('red diamonds have a real use: the harbor trades them for summon seals once per tap and only when affordable',()=>{
 const data=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)}});
 const p=freshPlayer();p.redDiamonds=SHIP_RULES.sealPrice*2-1;
 useGame.setState({p,recoveryRequired:false,storageError:false,toast:''});
 const seals=()=>resCount(useGame.getState().p,'seal'),s0=seals();
 useGame.getState().shipAction('trade');useGame.getState().shipAction('trade');
 assert.equal(useGame.getState().p.redDiamonds,SHIP_RULES.sealPrice-1,'a double tap pays once');assert.equal(seals(),s0+1);
 const saved=parseSave([...data.values()][0])!;assert.equal(saved.redDiamonds,SHIP_RULES.sealPrice-1);assert.equal(resCount(saved,'seal'),s0+1,'the seal survives reload');
 const now=performance.now;performance.now=()=>now.call(performance)+1000;try{useGame.getState().shipAction('trade')}finally{performance.now=now}
 assert.equal(useGame.getState().p.redDiamonds,SHIP_RULES.sealPrice-1,'not enough diamonds changes nothing');assert.equal(seals(),s0+1);
 assert.match(useGame.getState().toast,new RegExp(`Нужно ${SHIP_RULES.sealPrice} красных алмазов`));
});
