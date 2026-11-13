const fs=require('node:fs');
module.exports=function fixture(stage=34,empty=false){
 const p=JSON.parse(fs.readFileSync('.tmp/qa/fixtures.json')).find(p=>p.stage===stage);
 if(!p)throw Error('Generate fixtures with: node --import tsx scripts/qa/fixtures.ts');
 p.gold=1300000;p.gems=3115;p.sound=false;p.reducedMotion=true;
 const gear=Object.values(p.equipment);
 p.inventory=Array.from({length:80},(_,n)=>({...gear[n%gear.length],id:'ui-item-'+n,rarity:n%9,upgrade:n%4,locked:n%17===0}));
 p.pendingLoot=p.inventory.slice(0,41).map((i,n)=>({...i,id:'ui-stored-'+n}));
 p.inventory[0]={...p.inventory[0],slot:'ring1',rarity:5,set:'stone',perk:'echo',engrave:'might',locked:false,name:'Каменная стража · Кольцо I',origin:'Встреча основной главы · этап 37'};
 ['weapon','armor','helmet'].forEach(slot=>p.equipment[slot].set='stone');
 if(empty){p.inventory=[];p.pendingLoot=[];p.equipment={}}
 return p;
};
