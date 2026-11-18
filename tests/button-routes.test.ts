import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installHeadless} from '../scripts/sim/bot';
installHeadless();
import {Battle} from '../src/game/Battle';
import {freshPlayer,useGame} from '../src/core/store';
const app=readFileSync(new URL('../src/ui/App.tsx',import.meta.url),'utf8');
beforeEach(()=>{useGame.setState({p:freshPlayer(),auto:false,panel:null,selected:null,recoveryRequired:false,toast:''})});
const scene=()=>new Battle({getContext:()=>({})} as unknown as HTMLCanvasElement);

test('every gear tile opens its own slot card regardless of on-screen size',()=>{
 assert.doesNotMatch(app,/getBoundingClientRect\(\);if\(Math\.min\(r\.width,r\.height\)<40\)/,'small tiles must not fall back to the general equipment window');
 assert.match(app,/<Gear key=\{slot\} slot=\{slot\}[^>]*onClick=\{\(\)=>chooseGear\(slot\)\}/);
 assert.match(app.split('\n').find(l=>l.startsWith('function Gear('))??'',/onClick=\{onClick\}/);
});
test('currency plus buttons open an honest "where to get" window with working actions',()=>{
 assert.match(app,/onClick=\{\(\)=>g\.open\(`source:\$\{c\.key\}`\)\}/);
 for(const k of ['gold','gems','chaosite'])assert.match(app,new RegExp(`'source:${k}':'Где получить`));
 assert.match(app,/kind==='gold'.*startMode\('farm'\)/s);
 assert.match(app,/kind==='chaosite'.*g\.claim\('mine'\)|const mine=.*g\.claim\('mine'\)/s);
});
test('«Новый герой» asks for confirmation and lists heroes saved on the device',()=>{
 assert.doesNotMatch(app,/<Action onClick=\{newHero\}>Новый герой/,'the menu entry must not leave the current hero in one tap');
 assert.match(app,/onClick=\{\(\)=>setConfirmHero\(true\)\}>Новый герой/);
 assert.match(app,/confirmHero&&<div[^>]*>.*<Action onClick=\{newHero\}>Начать нового героя<\/Action><Action kind="secondary" onClick=\{\(\)=>setConfirmHero\(false\)\}>Отмена/s);
 assert.match(app,/<SavedHeroes onOpen=\{openHero\}\/>/);
});
test('«Войти» never pauses a chapter fight already running',()=>{
 const b=scene();b.toggle();assert.equal(b.running,true);assert.equal(b.mode,'campaign');
 b.challenge();assert.equal(b.running,true,'still running');assert.equal(b.pendingMode,undefined);assert.match(useGame.getState().toast,/Основная глава уже идёт/);
 b.destroy();
});
test('«Войти» from another mode selects the main chapter without promising a fee',()=>{
 const b=scene();b.mode='farm';b.challenge();assert.equal(b.pendingMode,'campaign');assert.equal(b.running,false);
 assert.match(useGame.getState().toast,/Основная глава · нажмите топоры/);assert.doesNotMatch(useGame.getState().toast,/оплата|Хаосит/);
 b.startMode('dungeon');assert.match(useGame.getState().toast,/Логово мини-босса · нажмите топоры · \d+ Хаосита при старте/);
 b.destroy();
});
