import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/ui/App.tsx',import.meta.url),'utf8');
const collection=readFileSync(new URL('../src/ui/CollectionStatus.tsx',import.meta.url),'utf8');
const art=readFileSync(new URL('../src/ui/HarborScene.tsx',import.meta.url),'utf8');
const naval=readFileSync(new URL('../src/ui/NavalPanel.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/ui/harbor.css',import.meta.url),'utf8');
test('port routes to the existing game panels',()=>{
 assert.match(app,/panel==='port'&&/);
 for(const name of ['shipyard','forge','inventory','companions','blessing','talents','relic'])assert.ok(app.includes("'"+name+"'"));
 assert.match(app,/<MineCollection\/>/);
 assert.match(collection,/claim\('mine'\)/);
});
test('shipyard displays only saved ships, offers selection and keeps the real transactions',()=>{
 assert.match(app,/ships=\{fleet\.ships\}/);
 assert.match(art,/const ship = ships\[index\]/);
 assert.match(art,/onChooseShip\?\.\(ship\.id\)/);
 assert.match(art,/length:NAVAL.maxShips/);
 assert.match(app,/shipAction\('claim'\)/);
 assert.match(app,/<NavalPanel fleet=\{fleet\} ship=\{currentShip\}/);
 assert.match(naval,/mutate\(draft => applyNaval\(draft, action, Date\.now\(\)\), true\)/);
});
test('painted mobile harbor has accessible controls and reduced motion',()=>{
 assert.match(art,/aria-pressed=/);
 assert.match(css,/min-height:\s*44px/);
 assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
