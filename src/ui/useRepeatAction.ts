import {useRef} from 'react';

/** A touch double tap is one action even if React renders a fresh quote in between. */
export function useRepeatAction(){
 const last=useRef(-Infinity);
 return (action:()=>boolean)=>{
  const now=performance.now();
  if(now-last.current<350)return false;
  if(!action())return false;
  last.current=now;
  return true;
 };
}
