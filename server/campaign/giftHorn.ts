import {freshPlayer,rollItem} from '../../src/core/store';

export function giftHornItem(operation:string,value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))return;
 const fields=Object.entries(value);
 const names=new Set(['level','stage','forge','blessing','forgeAnchor']);
 if(fields.length!==5||fields.some(([name,n])=>!names.has(name)||
  typeof n!=='number'||!Number.isSafeInteger(n)||n<0))return;
 const {level,stage,forge,blessing,forgeAnchor}=value as Record<string,number>;
 if(level<1||stage<1||forge<1||(forgeAnchor!==0&&forgeAnchor<=300))return;
 const p=freshPlayer();
 Object.assign(p,{level,stage,forge,blessing});
 if(forgeAnchor)p.progression={v:1,anchors:{forge:{level:forgeAnchor,bonus:Math.floor(forgeAnchor/3)}}};
 return {...rollItem(p),id:'brotherhood-horn:'+operation,origin:'Рог Трофеев'};
}
