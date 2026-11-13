import {createRoot} from 'react-dom/client';
import App from './ui/App';
import './ui/style.css';
import './ui/saga.css';
import {useGame,isolatedProfile} from './core/store';
import {battle} from './game/Battle';
// Test hook for isolated ?hero= profiles only: lets automated checks jump to late chapters.
if(isolatedProfile)Object.assign(window,{__lootborn:{useGame,get battle(){return battle}}});
createRoot(document.getElementById('root')!).render(<App/>);
