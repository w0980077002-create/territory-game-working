import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {consumables,elixirArt} from '../src/arena/potion';
import {arenaElixirs} from '../src/arena/protocol';

const file=(art:string)=>'public/art/elixirs/'+art+'.webp';

test('all 20 approved potion pictures are unique, present and lossless 256×256 WebP',()=>{
 assert.equal(elixirArt.length,20);
 assert.equal(new Set(elixirArt.map(e=>e.art)).size,20,'one picture per concept');
 assert.equal(new Set(elixirArt.map(e=>e.name)).size,20,'one name per concept');
 for(const {art} of elixirArt){
  assert.ok(existsSync(file(art)),file(art));
  const bytes=readFileSync(file(art));
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
  assert.equal(bytes.toString('ascii',12,16),'VP8L','lossless');
  const bits=bytes.readUInt32LE(21);
  assert.equal((bits&0x3fff)+1,256,'width');assert.equal(((bits>>14)&0x3fff)+1,256,'height');
 }
});

test('only implemented consumables are linked to artwork; the rest stay artwork-only',()=>{
 const linked=elixirArt.filter(e=>'consumable' in e);
 assert.deepEqual(linked.map(e=>[e.art,'consumable' in e&&e.consumable]),[['valhalla-heart','potion']]);
 for(const [id,item] of Object.entries(consumables)){
  assert.ok(item.icon.startsWith('elixir-'),id+' uses approved artwork');
  assert.ok(existsSync(file(item.icon.slice(7))),id+' picture exists');
  assert.ok(id in arenaElixirs,id+' is usable in the Arena belt');
 }
});
