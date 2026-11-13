import {useEffect,useId,useRef,useState} from 'react';

/** Native top-layer popover: browser owns outside-touch dismissal and Escape.
 * Options remain game-sized; no Android system select is opened. */
export function CompactFilter({label,value,options,onChange}:{label:string;value:string;options:readonly {value:string;label:string;shortLabel?:string}[];onChange:(value:string)=>void}){
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),list=useRef<HTMLDivElement>(null),[open,setOpen]=useState(false);
 const current=options.find(o=>o.value===value)??options[0];
 const close=(restore=false)=>{list.current?.hidePopover();if(restore)trigger.current?.focus({preventScroll:true})};
 useEffect(()=>{if(!open)return;const dismiss=(e:Event)=>{if(!list.current?.contains(e.target as Node))close()};window.addEventListener('resize',dismiss);document.addEventListener('scroll',dismiss,true);return()=>{window.removeEventListener('resize',dismiss);document.removeEventListener('scroll',dismiss,true)}},[open]);
 const show=()=>{
  const el=list.current,button=trigger.current;if(!el||!button)return;
  if(open){close();return}
  const r=button.getBoundingClientRect(),height=window.visualViewport?.height??innerHeight,width=Math.min(300,innerWidth-24);
  const below=height-r.bottom-12,above=r.top-12,useBelow=below>=Math.min(260,above);
  Object.assign(el.style,{width:width+'px',left:Math.min(Math.max(12,r.left),innerWidth-width-12)+'px',top:useBelow?r.bottom+5+'px':'auto',bottom:useBelow?'auto':height-r.top+5+'px',maxHeight:Math.max(44,Math.min(340,useBelow?below:above))+'px'});
  el.showPopover();const selected=el.querySelector<HTMLElement>('[aria-selected="true"]');selected?.focus({preventScroll:true});selected?.scrollIntoView({block:'nearest'});
 };
 return <div className="compact-filter"><button ref={trigger} type="button" className="filter-trigger" aria-label={`${label}: ${current.label}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} onClick={show} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();show()}}}><span>{current.shortLabel??current.label}</span><span aria-hidden="true">⌄</span></button><div ref={list} id={id} className="fantasy-filter-options" popover="auto" role="listbox" aria-label={label} onToggle={e=>setOpen(e.newState==='open')} onKeyDown={e=>{
   if(e.key==='Escape'){e.stopPropagation();e.preventDefault();close(true);return}
   const buttons=Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')??[]),index=buttons.indexOf(document.activeElement as HTMLButtonElement);
   let next=index;if(e.key==='ArrowDown')next=(index+1)%buttons.length;else if(e.key==='ArrowUp')next=(index-1+buttons.length)%buttons.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=buttons.length-1;else if(e.key==='Tab'){close(true);return}else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey){next=options.findIndex((o,i)=>i>index&&o.label.toLocaleLowerCase('ru').startsWith(e.key.toLocaleLowerCase('ru')));if(next<0)next=options.findIndex(o=>o.label.toLocaleLowerCase('ru').startsWith(e.key.toLocaleLowerCase('ru')))}else return;
   if(next>=0){e.preventDefault();buttons[next]?.focus();buttons[next]?.scrollIntoView({block:'nearest'})}
  }}>{options.map(o=><button type="button" role="option" aria-selected={o.value===value} tabIndex={o.value===value?0:-1} key={o.value} onClick={()=>{onChange(o.value);close(true)}}><span>{o.label}</span><b aria-hidden="true">{o.value===value?'✓':''}</b></button>)}</div></div>;
}
