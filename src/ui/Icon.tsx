import {art} from '../data/catalog';
const paths:Record<string,React.ReactNode>={
 axe:<><path fill="#a97442" d="m19 6 5-3 23 48-7 4Z"/><path fill="#b8d8ea" d="M24 11 11 7 3 20 10 31 27 22Z"/><path fill="#edfaff" d="m11 7-8 13 7 11 4-6-5-6 5-10Z"/></>,
 axes:<><g transform="rotate(-44 32 32)"><path fill="#a67c45" d="M28 10h8v49h-8Z"/><path fill="#c2d6de" d="M29 10 13 5 8 15 10 28 29 23Z"/><path fill="#fff" d="m13 5-5 10 2 13 5-3-1-10 4-8Z"/></g><g transform="rotate(44 32 32)"><path fill="#a67c45" d="M28 10h8v49h-8Z"/><path fill="#c2d6de" d="M35 10 51 5 56 15 54 28 35 23Z"/><path fill="#fff" d="m51 5 5 10-2 13-5-3 1-10-4-8Z"/></g></>,
 crown:<><path fill="#ffbe32" d="m7 18 13 9 12-17 12 17 13-9-7 33H14Z"/><path fill="#fff297" d="M14 41h36v9H14Z"/><circle cx="32" cy="34" r="5" fill="#f24b48"/></>,
 gift:<><path fill="#ffc142" d="M8 28h48v29H8Z"/><path fill="#ef4a49" d="M27 22h10v35H27Z"/><path fill="#ffe16a" d="M5 21h54v12H5Z"/><path fill="none" stroke="#ffc142" strokeWidth="7" d="M32 22C5 22 10 0 23 10ZM32 22C59 22 54 0 41 10Z"/></>,
 book:<><path fill="#c75835" d="m12 8 37-3 8 45-39 10L7 18Z"/><path fill="#ffca4d" d="m27 18 5 8 10 1-7 7 1 10-9-5-8 4 2-10-6-7 10-1Z"/><path d="m15 52 36-8" stroke="#ead7ab" strokeWidth="5"/></>,
 scroll:<><path fill="#f1d4a2" d="M15 8h37v40L40 57H10L7 48V18Z"/><path fill="#b88756" d="M10 8h10v40H7V18Z"/><path d="m27 23 5-6 10 5-11 17 12 3" fill="none" stroke="#c83c37" strokeWidth="4"/></>,
 shield:<><path fill="#64bce6" d="m9 10 23-6 23 6-2 28-21 22L11 38Z"/><path fill="#ffd062" d="m32 11 6 13 14 1-11 10 3 14-12-8-12 8 3-14-11-10 14-1Z"/></>,
 helmet:<><path fill="#a1bdcf" d="M12 36Q9 10 32 9Q55 10 52 36L57 48 40 45 32 54 24 45 7 48Z"/><path fill="#e6f3ef" d="M27 10h10v33H27Z"/><path fill="#dcae4c" d="M9 32h46v9H9Z"/><path fill="#1c3345" d="M16 42h11v6H16Zm21 0h11v6H37Z"/></>,
 armor:<><path fill="#8d7177" d="m18 8 14 7 14-7 13 13-8 11-7-5 5 29H15l5-29-7 5-8-11Z"/><path fill="#d6c0b9" d="m22 16 10 6 10-6-3 16H25Z"/><path fill="#ff5b5f" d="m32 28 8 8-8 8-8-8Z"/></>,
 boots:<><path fill="#6e8a9b" d="m14 8 22 2-4 28 16 8-2 10H9L6 46l7-11Z"/><path fill="#e2d8ab" d="M12 8h25v10H12ZM7 48h40v9H7Z"/></>,
 belt:<><path fill="#866149" d="M5 22h54v23H5Z"/><path fill="#ffd266" d="M23 18h20v31H23Z"/><path fill="#755b52" d="M29 25h9v16h-9Z"/></>,
 ring:<><ellipse cx="31" cy="39" rx="20" ry="15" fill="none" stroke="#ffc54a" strokeWidth="8"/><path fill="#8ff8ec" d="m21 15 10-7 13 9-12 17Z"/></>,
 amulet:<><path d="M12 5Q5 37 32 43Q59 37 52 5" fill="none" stroke="#f5c556" strokeWidth="5"/><path fill="#62e4d7" d="m32 26 13 16-13 17-13-17Z"/></>,
 cloak:<><path fill="#bc4c57" d="m22 8 10 8 10-8 15 48-25-7-25 7Z"/><path fill="#f1c168" d="m22 8 10 8 10-8-3 16H25Z"/></>,
 gem:<path fill="#8ae8ff" d="m15 11 34 0 12 15-29 34L3 26Z"/>,
 rune:<><path fill="#6487ab" d="m21 5 24 5 11 24-14 23-25-4L6 31Z"/><path d="m23 17 17 9-16 9 17 9M32 12v38" stroke="#78f8ff" strokeWidth="5" fill="none"/></>,
 wings:<><path fill="#c891ff" d="M30 44Q4 39 3 7L20 20 28 10 30 37ZM34 44Q60 39 61 7L44 20 36 10 34 37Z"/><path d="m6 13 21 21M58 13 37 34" stroke="#f4dbff" strokeWidth="3"/><path fill="#ffd16d" d="m32 29 8 11-8 16-8-16Z"/></>,
 horn:<><path fill="#e6c391" d="M11 10Q15 48 51 44L57 28Q29 39 25 9Z"/><path fill="#ffd357" d="m7 8 20-3 2 12-21 2ZM46 29l13-2-5 20-14-2Z"/></>,
 chest:<><path fill="#ba733d" d="M7 27Q7 8 31 8Q55 8 57 27v29H7Z"/><path fill="#ffd25c" d="M7 26h50v8H7ZM11 9h7v47h-7Zm35 1h7v46h-7Z"/><path fill="#d98dff" d="m22 13 10-6 9 9-9 12Z"/><path fill="#ffe88e" d="M27 29h10v15H27Z"/></>,
 lightning:<path fill="#ffda49" d="M34 3 9 36h20l-5 25 31-38H35L42 3Z"/>,
 coins:<><ellipse cx="32" cy="33" rx="25" ry="26" fill="#ffcc37"/><ellipse cx="32" cy="33" rx="18" ry="19" fill="#eaa72d"/><path d="m32 18 4 9 10 1-8 7 2 11-8-6-8 6 2-11-8-7 10-1Z" fill="#ffe889"/></>,
 menu:<>{[12,36].flatMap(x=>[12,36].map(y=><rect key={x+y*10} x={x} y={y} width="17" height="17" rx="4" fill="#fff5de"/>))}</>,
 ship:<><path fill="#ad743b" d="m4 42 56-5-9 19H16Z"/><path d="M29 7v35" stroke="#66462f" strokeWidth="5"/><path fill="#ffd562" d="M30 8Q9 9 15 35h15Z"/><path fill="#77c6e8" d="M34 12Q53 16 50 32H34Z"/></>,
 people:<><circle cx="21" cy="23" r="11" fill="#f0b987"/><circle cx="44" cy="21" r="11" fill="#edba8c"/><path fill="#72c9b5" d="M4 54V42q17-18 34 0v12Z"/><path fill="#7394d0" d="M31 54V40q13-16 29 0v14Z"/></>,
 portal:<><path fill="#965044" d="M8 55V31Q8 3 32 3Q56 3 56 31v24Z"/><ellipse cx="32" cy="31" rx="15" ry="23" fill="#ff7a21"/><ellipse cx="32" cy="31" rx="9" ry="18" fill="#a20e20"/></>,
 star:<path fill="#ffd25c" d="m32 4 8 17 20 3-15 14 3 21-16-10-17 10 4-21L3 24l21-3Z"/>,
 refresh:<><path d="M47 19A22 22 0 0 0 10 29M17 45a22 22 0 0 0 37-10" fill="none" stroke="#fff2c9" strokeWidth="8"/><path fill="#fff2c9" d="m46 6 12 20-23 1ZM18 59 6 39l23-1Z"/></>,
 heart:<path fill="#f04f54" d="M32 56 8 33C-8 10 19-2 32 17 45-2 72 10 56 33Z"/>,
 chart:<><path fill="#b1c5d5" d="M8 32h10v23H8ZM26 10h10v45H26ZM44 23h10v32H44Z"/></>
};
const illustrated:Record<string,string>={axe:'weapon',armor:'armor',helmet:'helmet',shield:'shield',boots:'boots',belt:'belt',ring:'ring1',ring1:'ring1',ring2:'ring2',amulet:'amulet',cloak:'cloak',gem:'extra2',rune:'extra1',wings:'wings',horn:'horn',coins:'coins',crown:'crown',gift:'gift',book:'book',scroll:'scroll',ship:'ship',people:'people',portal:'portal',market:'market',banner:'banner',arena:'arena',handshake:'handshake',medal:'medal',map:'map',chest:'chest',potion:'potion',skill:'skill',event:'event'};
export function Icon({name,className=''}:{name:string;className?:string}){if(illustrated[name])return <img className={`icon illustrated ${className}`} src={art(`ui-${illustrated[name]}`)} alt="" aria-hidden="true" draggable={false}/>;return <svg className={`icon ${className}`} viewBox="0 0 64 64" fill="none" stroke="#202631" strokeWidth="2.7" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">{paths[name]??paths.star}</svg>}
export function gearIcon(slot:string){return ({weapon:'axe',armor:'armor',helmet:'helmet',shield:'shield',boots:'boots',belt:'belt',ring1:'ring1',ring2:'ring2',amulet:'amulet',cloak:'cloak',extra1:'rune',extra2:'gem',wings:'wings'} as Record<string,string>)[slot]??'star'}
