import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/ui/App.tsx',import.meta.url),'utf8');
const art=readFileSync(new URL('../src/ui/HarborScene.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/ui/harbor.css',import.meta.url),'utf8');
test('port routes to the existing game panels',()=>{
 assert.match(app,/panel==='port'&&/);
 for(const name of ['shipyard','forge','inventory','companions','blessing','talents','relic'])assert.ok(app.includes("'"+name+"'"));
 assert.match(app,/g\.claim\('mine'\)/);
});
test('shipyard displays only saved ships, offers selection and keeps the real transactions',()=>{
 assert.match(app,/ships=\{fleet\.ships\}/);
 assert.match(art,/ships\[i\]/);
 assert.match(art,/onChooseShip\?\.\(ships\[i\]\.id\)/);
 for(const action of ['claim','buy','upgrade'])assert.ok(app.includes("shipAction('"+action+"'"));
});
test('painted mobile harbor has accessible controls and reduced motion',()=>{
 assert.match(art,/aria-pressed=/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
