import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clips,frameGeometry,legacyBodyHeight} from '../src/game/actorGeometry';
import {backSockets,wingAttachment,drawAttachedWings} from '../src/game/heroAttachments';

test('all three classes register a back socket for every combat and airborne run frame',()=>{
 assert.equal(Object.keys(backSockets).length,6);
 for(const [id,sockets] of Object.entries(backSockets)){
  assert.equal(sockets.length,clips[id].frames.length);
  const height=legacyBodyHeight(id.replace(':run',''),214);
  for(const [frame,[x,y]] of sockets.entries()){
   const g=frameGeometry(id,frame,0,0,height),socket=wingAttachment(id,frame,height)!;
   assert.ok(x>0&&x<g.source[2]&&y>0&&y<g.source[3],id+' torso inside source');
   assert.equal(socket.x,g.x+x*g.scale);assert.equal(socket.y,g.y+y*g.scale);
  }
 }
});

test('flapping hinges stay on the same back joint after movement and mirroring',()=>{
 const img={complete:true,naturalWidth:220,naturalHeight:220} as HTMLImageElement;
 for(const id of Object.keys(backSockets))for(let frame=0;frame<8;frame++)for(const flip of [false,true])for(const time of [0,.1,.25,1.1]){
  let matrix=[flip?-1:1,0,0,1,417,792],stack:number[][]=[];const roots:number[][]=[];
  const multiply=(b:number[])=>{const [a,c,e,f,x,y]=matrix;matrix=[a*b[0]+e*b[1],c*b[0]+f*b[1],a*b[2]+e*b[3],c*b[2]+f*b[3],a*b[4]+e*b[5]+x,c*b[4]+f*b[5]+y]};
  const ctx={save(){stack.push([...matrix])},restore(){matrix=stack.pop()!},translate(x:number,y:number){multiply([1,0,0,1,x,y])},rotate(a:number){multiply([Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0])},scale(x:number,y:number){multiply([x,0,0,y,0,0])},drawImage(...args:unknown[]){const sx=args[1] as number,dx=args[5] as number,dy=args[6] as number;const px=dx+(sx===0?110:0),py=dy+124;roots.push([matrix[0]*px+matrix[2]*py+matrix[4],matrix[1]*px+matrix[3]*py+matrix[5]])}} as unknown as CanvasRenderingContext2D;
  drawAttachedWings(ctx,id,frame,200,time,{wings:img});
  const socket=wingAttachment(id,frame,200)!;
  assert.equal(roots.length,2);
  for(const root of roots){assert.ok(Math.abs(root[0]-(417+(flip?-socket.x:socket.x)))<1e-8,id+' attached x');assert.ok(Math.abs(root[1]-(792+socket.y))<1e-8,id+' attached y')}
  assert.deepEqual(matrix,[flip?-1:1,0,0,1,417,792]);
 }
});

test('no wings are painted for a hidden/unequipped accessory or before its texture loads',()=>{
 const ctx={drawImage(){assert.fail('unexpected detached wing')},save(){assert.fail('unexpected transform')}} as unknown as CanvasRenderingContext2D;
 drawAttachedWings(ctx,'winged_helmet_warrior',0,200,0,undefined);
 drawAttachedWings(ctx,'winged_helmet_warrior',0,200,0,{wings:{complete:false} as HTMLImageElement});
});
