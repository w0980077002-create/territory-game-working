"""Register complete animation drawings, then pack with gutters. No runtime grid guesses.
Dependencies: Pillow, numpy, scipy (asset build only).
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT=Path(__file__).resolve().parents[1]
SOURCES=ROOT/'assets/animation-source'
OUT=ROOT/'public/art'
GROUPS={
 'allies':(['winged_helmet_warrior','whitebeard_mage','strongman_boulder','goose_aviator','brown_white_dog'],[0,189,355,540,715,887]),
 'enemies':(['01_sword_shield_veteran','02_roman_spearman','03_pirate_bandit','04_club_raider','05_shield_spearman','06_red_crest_legionary','07_purple_mage','08_armored_boar'],[0,125,250,360,470,577,689,789,887]),
 'bosses':(['capybara_bruiser','senior_driller','moss_eater','spider_queen','fungal_king','minotaur_echo','fire_abyss_lord','cappuccina_approved'],[0,132,242,364,475,575,681,779,887])}

def clean(image,matte=False):
 a=np.asarray(image.convert('RGBA')).copy()
 if matte:
  rgb=a[:,:,:3].astype(int)
  background=(a[:,:,3]<190)|((rgb.min(2)>170)&(np.ptp(rgb,axis=2)<42))
  border=np.zeros_like(background);border[[0,-1],:]=True;border[:,[0,-1]]=True
  outside=ndimage.binary_propagation(border&background,mask=background)
  a[outside,3]=0
 a[a[:,:,3]<24,3]=0
 return a

def seam(cost,guide,radius=35):
 """A transparent separating path; it can bend around boots and weapon tips."""
 h,w=cost.shape;lo=max(1,int(guide-radius));hi=min(h-1,int(guide+radius))
 candidates=np.arange(lo,hi);n=len(candidates)
 pixels=cost[lo:hi,:].astype(float)
 # Cutting an opaque drawing costs far more than moving the seam into a real gutter.
 local=np.where(pixels>200,10000,pixels**2*.015)+np.abs(candidates[:,None]-guide)*.006
 dp=local[:,0].copy();previous=np.zeros((w,n),np.int16)
 for x in range(1,w):
  best=np.full(n,np.inf);arg=np.zeros(n,np.int16)
  for delta in range(-3,4):
   src=np.arange(n)+delta;valid=(src>=0)&(src<n)
   value=np.full(n,np.inf);value[valid]=dp[src[valid]]+abs(delta)*.25
   take=value<best;best[take]=value[take];arg[take]=src[take]
  previous[x]=arg;dp=best+local[:,x]
 path=np.zeros(w,np.int32);pos=int(dp.argmin())
 for x in range(w-1,-1,-1):path[x]=candidates[pos];pos=int(previous[x,pos])
 return path

def split_sheet(a,names,guides,columns=8):
 h,w=a.shape[:2];yy,xx=np.indices((h,w));alpha=a[:,:,3]
 # Vertical seams preserve weapons that extend beyond a nominal cell boundary.
 vertical=[np.zeros(h,np.int32)]+[seam(alpha.T,w*i/columns,55) for i in range(1,columns)]+[np.full(h,w,np.int32)]
 assert all(not (alpha[np.arange(h),path]>200).any() for path in vertical[1:-1]),'Vertical seam crosses opaque anatomy'
 result={name:[] for name in names}
 for col in range(columns):
  own=(xx>=vertical[col][:,None])&(xx<vertical[col+1][:,None])
  left=max(0,int(vertical[col].min()));right=min(w,int(vertical[col+1].max()))
  costs=np.where(own,alpha,0)[:,left:right]
  horizontal=[np.zeros(right-left,np.int32)]+[seam(costs,g) for g in guides[1:-1]]+[np.full(right-left,h,np.int32)]
  assert all(not (costs[path,np.arange(right-left)]>200).any() for path in horizontal[1:-1]),'Horizontal seam crosses opaque anatomy'
  for row,name in enumerate(names):
   region=own[:,left:right]&(yy[:,left:right]>=horizontal[row][None,:])&(yy[:,left:right]<horizontal[row+1][None,:])
   frame=a[:,left:right].copy();frame[~region,3]=0
   # Keep all connected body pieces, detached weapons, and spell effects in this frame.
   ys,xs=np.where(frame[:,:,3]>0)
   assert len(xs)>100,(name,col,'empty frame')
   box=(int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1))
   image=Image.fromarray(frame).crop(box)
   result[name].append({'image':image,'source':[left+box[0],box[1],box[2]-box[0],box[3]-box[1]],'sourceEdge':bool((region&((xx[:,left:right]==0)|(xx[:,left:right]==w-1)|(yy[:,left:right]==0)|(yy[:,left:right]==h-1))&(frame[:,:,3]>200)).any())})
 return result

def registration(image,death=False):
 a=np.asarray(image);core=a[:,:,3]>200
 if not core.any():core=a[:,:,3]>32
 yy,xx=np.where(core);bottom=int(yy.max())+1;top=int(yy.min())
 footer=core.copy();footer[:max(top,bottom-max(6,int((bottom-top)*.18)))]=False
 fy,fx=np.where(footer)
 foot=float(np.median(xx))+.5 if death else float(fx.min()+fx.max()+1)/2
 return [round(foot,3),image.height],bottom-top

def bands(image,pivot,reference):
 a=np.asarray(image)[:,:,3];records=[];step=max(1,int(reference/48))
 for y in range(0,image.height,step):
  ys,xs=np.where(a[y:y+step]>24)
  if len(xs):records.append([round((int(xs.min())-pivot[0])/reference,5),round((y-pivot[1])/reference,5),round((int(xs.max())+1-pivot[0])/reference,5),round((min(image.height,y+step)-pivot[1])/reference,5)])
 return records

all_data={};audits=[]
for group,(names,guides) in GROUPS.items():
 image=Image.open(SOURCES/(group+'.png'))
 frames=split_sheet(clean(image,group=='enemies'),names,guides)
 for name in names:
  override=SOURCES/(name+'.png')
  if override.exists():
   replacement=clean(Image.open(override),True);height=replacement.shape[0]
   # A replacement sheet contains one character in a 4 x 2 layout.
   split=split_sheet(replacement,['top','bottom'],[0,height/2,height],4)
   frames[name]=split['top']+split['bottom']
  # Limit decode memory while keeping the new high resolution repair frames crisp.
  pivot,idle_height=registration(frames[name][0]['image'])
  down=min(1,180/idle_height)
  if down<1:
   for f in frames[name]:f['image']=f['image'].resize((max(1,round(f['image'].width*down)),max(1,round(f['image'].height*down))),Image.Resampling.LANCZOS)
  pivot,reference=registration(frames[name][0]['image'])
  all_data[name]={'atlas':'animation-'+group,'referenceHeight':reference,'legacyCellHeight':image.height/len(names)*down,'frames':frames[name]}
 # Tight shelf packing with a completely transparent 8px guard on every side.
 entries=[(name,index,f) for name in names for index,f in enumerate(frames[name])]
 x=y=8;row_height=0;packed=[]
 for name,index,f in entries:
  im=f['image'];w,h=im.size
  if x+w+8>2048:x=8;y+=row_height+16;row_height=0
  packed.append((x,y,name,index,f));x+=w+16;row_height=max(row_height,h)
 height=y+row_height+8;atlas=Image.new('RGBA',(2048,height))
 for x,y,name,index,f in packed:
  im=f['image'];atlas.alpha_composite(im,(x,y));pivot,_=registration(im,index==7);ref=all_data[name]['referenceHeight']
  # Dragon breath is a detached glow in the foot band: register the four-legged torso.
  if name=='fire_abyss_lord' and index!=7:pivot[0]=round(im.width*.68,3)
  # Fallen left-facing actors retain the heel anchor; do not anchor the drill/weapon.
  if index==7 and group=='bosses' and name!='cappuccina_approved':
   heel={'08_armored_boar':.74,'moss_eater':.82,'spider_queen':.65,'fungal_king':.82,'fire_abyss_lord':.65}.get(name,.89)
   pivot[0]=round(im.width*heel,3)
  record={'rect':[x,y,im.width,im.height],'pivot':pivot,'bounds':[-pivot[0]/ref,-pivot[1]/ref,(im.width-pivot[0])/ref,(im.height-pivot[1])/ref],'bands':bands(im,pivot,ref),'source':f['source']}
  all_data[name]['frames'][index]=record
  audits.append([name,index,f['sourceEdge']])
 atlas.save(OUT/('animation-'+group+'.webp'),quality=92,method=6)
 # An exact lossless packed master makes frame-boundary validation reproducible.
 atlas.save(SOURCES/(group+'-packed.png'),optimize=True)
 print(group,'packed',atlas.size)

for name,clip in all_data.items():
 image=Image.open(OUT/(name+'.webp')).convert('RGBA');pivot,reference=registration(image)
 clip['fallback']={'width':image.width,'height':image.height,'pivot':pivot,'referenceHeight':reference,'bounds':[-pivot[0]/reference,-pivot[1]/reference,(image.width-pivot[0])/reference,(image.height-pivot[1])/reference],'bands':bands(image,pivot,reference)}
 # Union across all poses and the loading fallback; used for placement, never guessed from cell size.
 clip['envelope']=[min(f['bounds'][0] for f in clip['frames']+[clip['fallback']]),min(f['bounds'][1] for f in clip['frames']+[clip['fallback']]),max(f['bounds'][2] for f in clip['frames']+[clip['fallback']]),max(f['bounds'][3] for f in clip['frames']+[clip['fallback']])]
Path(ROOT/'src/data/animation-frames.json').write_text(json.dumps(all_data,separators=(',',':'))+'\n')
Path(ROOT/'work/frame-source-audit.json').write_text(json.dumps(audits,indent=2))
print('Registered',len(all_data)*8,'poses; original edge contacts:',[a for a in audits if a[2]])
