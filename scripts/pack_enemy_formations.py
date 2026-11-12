"""Solve screen placement against sprite motion envelopes and the fixed HUD.
Positions are visual only: combat timers, HP, costs, and progression are untouched.
"""
import json,math
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
clips=json.loads((ROOT/'src/data/animation-frames.json').read_text())
normal=['01_sword_shield_veteran','02_roman_spearman','03_pirate_bandit','04_club_raider','05_shield_spearman','06_red_crest_legionary','07_purple_mage','08_armored_boar']
big=['capybara_bruiser','senior_driller','moss_eater','spider_queen','fungal_king','minotaur_echo','fire_abyss_lord']
heroes=['winged_helmet_warrior','whitebeard_mage','strongman_boulder']
preferred=dict(zip(normal,[162,174,158,172,168,174,163,142]))
preferred.update(dict(zip(big,[228,216,246,247,238,252,230])))
preferred.update(dict(zip(heroes,[202,192,210])))
UI=[(0,110,120,826),(748,110,864,516),(737,731,864,866),(0,846,864,1536)]
# UI margin protects outlines and camera shake, as well as actual opaque pixels.
MARGIN=6

def bands(name):
 c=clips[name];a=np.asarray([b for f in c['frames'] for b in f['bands']]+c['fallback']['bands'])
 if name in heroes:a[:,[0,2]]=-a[:,[2,0]]
 return a
BANDS={n:bands(n) for n in normal+big+heroes}

def rects(name,height,x,y):
 b=BANDS[name]*height;b=b+np.array([x,y,x,y]);b[:,0]-=28;b[:,2]+=18
 return b

hero_bands=[]
for hero_name in heroes:
 hero=clips[hero_name];hero_height=214*hero['referenceHeight']/hero['legacyCellHeight']
 hero_bands.extend((np.array(hero['frames'][0]['bands'])*hero_height+np.array([375,805,375,805])).tolist())
HERO=np.array(hero_bands)
# Forward weapons belong in the contact lane; protect the torso/feet of all classes.
HERO[:,2]=np.minimum(HERO[:,2],430);HERO=HERO[HERO[:,0]<HERO[:,2]]

def idle_hero_overlap(name,height,x,y):
 b=np.array(clips[name]['frames'][0]['bands'])*height+np.array([x,y,x,y])
 if name in heroes:b[:,[0,2]]=2*x-b[:,[2,0]]
 return ((b[:,0,None]<HERO[None,:,2]+8)&(b[:,2,None]>HERO[None,:,0]-8)&(b[:,1,None]<HERO[None,:,3]+4)&(b[:,3,None]>HERO[None,:,1]-4)).any()

def safe(name,height,x,y,boss=False):
 b=rects(name,height,x,y)
 if idle_hero_overlap(name,height,x,y):return False
 if b[:,0].min()<12 or b[:,2].max()>852 or b[:,1].min()<294 or b[:,3].max()>840:return False
 for l,t,r,bt in UI:
  if ((b[:,0]<r+MARGIN)&(b[:,2]>l-MARGIN)&(b[:,1]<bt+MARGIN)&(b[:,3]>t-MARGIN)).any():return False
 # Health bar is above the complete alive animation envelope, including raised weapons.
 top=min(v['bounds'][1] for v in clips[name]['frames'])
 top=min(top,clips[name]['fallback']['bounds'][1])
 bar_y=y+top*height-18;bar_width=180 if boss else 88
 bar=np.array([x-bar_width/2-2,bar_y-2,x+bar_width/2+2,bar_y+10])
 for l,t,r,bt in UI:
  if bar[0]<r+MARGIN and bar[2]>l-MARGIN and bar[1]<bt+MARGIN and bar[3]>t-MARGIN:return False
 return True

def collide(a,b):
 # Union envelopes over every pose and both ends of the lunge/approach animation.
 return ((a[:,0,None]<b[None,:,2]+5)&(a[:,2,None]>b[None,:,0]-5)&(a[:,1,None]<b[None,:,3]+3)&(a[:,3,None]>b[None,:,1]-3)).any()

def bar_clear(name,height,x,y,other):
 top=clips[name]['envelope'][1]*height+y
 a=[x-46,top-20,x+46,top-8]
 return not ((other[:,0]<a[2]+3)&(other[:,2]>a[0]-3)&(other[:,1]<a[3]+3)&(other[:,3]>a[1]-3)).any()

out={}
for name in normal+big+heroes:
 boss=name in big or name in heroes
 target=preferred[name]
 choices=[]
 for factor in np.arange(1.0,.49,-.025):
  h=round(target*factor,2)
  for y in [810,724]:
   for x in [620,630,640,610,600,590,580,570,560,550,540,530,520]:
    if safe(name,h,x,y,boss):choices.append({'x':x,'y':y,'height':h,'flip':name in heroes})
  if choices:break
 assert choices,('no solo layout',name)
 out[name]={'actors':[choices[0]],'boss':boss}
for first in normal:
 for second in normal:
  best=None
  for factor in np.arange(1,.54,-.025):
   h1=round(preferred[first]*factor,2);h2=round(preferred[second]*factor*.88,2)
   for x1 in [550,540,530,520,510,500]:
    if not safe(first,h1,x1,832):continue
    a=rects(first,h1,x1,832)
    for x2 in [730,720,710,700,740,750]:
     if not safe(second,h2,x2,724):continue
     b=rects(second,h2,x2,724)
     if not collide(a,b) and bar_clear(first,h1,x1,832,b) and bar_clear(second,h2,x2,724,a):best=[{'x':x1,'y':832,'height':h1,'flip':False},{'x':x2,'y':724,'height':h2,'flip':False}];break
    if best:break
   if best:break
  assert best,('no pair formation',first,second)
  out[first+'|'+second]={'actors':best,'boss':False}
(ROOT/'src/data/enemy-formations.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
print('Solved',len(out),'formations; minimum front/rear body height',min(v['actors'][0]['height'] for k,v in out.items() if '|'in k),min(v['actors'][1]['height'] for k,v in out.items() if '|'in k))
for n in big:print(n,out[n]['actors'][0])
