import {useGame} from '../core/store';

/** Window history: a window opened from another window can step back to it. Closing to the battle clears it. */
const stack:string[]=[];
let stepping=false;
export function startNavStack(){
 return useGame.subscribe((next,prev)=>{
  if(next.panel===prev.panel)return;
  if(!next.panel){stack.length=0;return}
  if(stepping){stepping=false;return}
  if(prev.panel&&prev.panel!=='menu-close'){
   const existing=stack.lastIndexOf(next.panel);
   if(existing>=0)stack.length=existing; // returning to a window already in the trail: no loops
   else stack.push(prev.panel);
  }
 });
}
/** Previous window, if the current one was opened from inside another window. */
/** Harbor buildings keep their own «‹ В гавань» return (DialogShell). */
const harborWindows=new Set(['shipyard','forge','blessing','talents','darkgear','gems','relic','companions']);
export function backTarget(current:string|null){
 const target=stack[stack.length-1];
 return current&&!harborWindows.has(current)&&target&&target!==current&&target!=='item'?target:undefined;
}
export function goBack(){
 const target=stack.pop();
 if(!target)return;
 stepping=true;
 useGame.getState().open(target);
}
