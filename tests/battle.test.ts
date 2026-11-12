import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Battle} from '../src/game/Battle';
import {freshPlayer,useGame} from '../src/core/store';
Object.defineProperty(globalThis,'Image',{value:class {src='';complete=false;naturalWidth=0}});
Object.defineProperty(globalThis,'requestAnimationFrame',{value:()=>1});
Object.defineProperty(globalThis,'cancelAnimationFrame',{value:()=>{}});
function scene(){useGame.setState({p:freshPlayer(),auto:false});return new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement)}
test('a killed enemy cannot retaliate, and wave reward is granted once',()=>{const b=scene();b.phase='fight';b.hp=1;b.autoCd=0;b.units=b.units.slice(0,1);b.units[0].hp=1;b.units[0].atk=100000;b.units[0].cd=0;b.update(.01);assert.equal(b.units[0].hp,0);assert.notEqual(b.phase,'defeat');assert.ok(b.hp>0);b.update(.01);assert.equal(b.phase,'victory');assert.equal(useGame.getState().p.kills,1);for(let i=0;i<30;i++)b.update(.01);assert.equal(useGame.getState().p.kills,1);b.destroy()});
test('boss timeout grants no victory and returns to farm',()=>{const b=scene();useGame.getState().mutate(p=>{p.wave=5});b.spawn();b.phase='fight';b.timer=.001;b.update(.01);assert.equal(b.phase,'defeat');assert.equal(useGame.getState().p.bosses,0);b.update(3);assert.equal(b.mode,'farm');assert.equal(b.phase,'walk');b.destroy()});
test('manual skill consumes cooldown and does real damage only once',()=>{const b=scene();b.phase='fight';const hp=b.units[0].hp;b.skill(0);assert.ok(b.units[0].hp<hp);assert.equal(b.cooldowns[0],6);const after=b.units[0].hp;b.skill(0);assert.equal(b.units[0].hp,after);b.destroy()});
