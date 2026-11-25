import {createRoot} from 'react-dom/client';
import App from './ui/App';
import './ui/style.css';
import './ui/saga.css';
import './ui/filter.css';
import './ui/windows.css';
import './ui/visualDNA.css';
import './ui/comparison.css';
import './ui/styleUnity.css';
import './ui/viewport.css';
import './ui/artPolish.css';
import './ui/gearRarity.css';
import './ui/polish.css';
import {useGame,isolatedProfile} from './core/store';
import {battle} from './game/Battle';
import {startCollectionTracking} from './ui/collectionTracking';
import {startNavStack} from './ui/navStack';
import {startTranslation} from './i18n';
import {communityEnabled,connectCommunity,readReferrals} from './community/client';
import {telegramProfile} from './core/profile';
import {tg} from './core/telegram';
// Test hook for isolated ?hero= profiles only: lets automated checks jump to late chapters.
if(isolatedProfile)Object.assign(window,{__lootborn:{useGame,get battle(){return battle}}});
createRoot(document.getElementById('root')!).render(<App/>);
// Register Telegram arrivals before opening any online panel, including a referral launch.
if(communityEnabled&&telegramProfile){
 const startParam=new URLSearchParams(tg()?.initData).get('start_param');
 const login=connectCommunity();
 const preview=login.then(async()=>{
  if(!/^ref_[a-f0-9-]{36}$/.test(startParam??''))return;
  const previewKey='vvr-brotherhood-preview:'+telegramProfile+':'+startParam;
  try{if(sessionStorage.getItem(previewKey))return;}catch{/* storage unavailable */}
  const incoming=(await readReferrals(null)).brotherhood?.incoming;
  if(!incoming||startParam!=='ref_'+incoming.inviterId||useGame.getState().panel)return;
  useGame.getState().open('invite');
  try{sessionStorage.setItem(previewKey,'1');}catch{/* storage unavailable */}
 });
 void preview.catch(()=>{ /* Offline play still works. */ });
}
startCollectionTracking();
startNavStack();
void startTranslation();
