"""Import complete eight-pose gait cycles with shared ground baselines and transparent gutters."""
from pathlib import Path
from PIL import Image
from scipy import ndimage
import numpy as np,json
ROOT=Path(__file__).resolve().parents[1]
result={}
for path in sorted((ROOT/'assets/run-source').glob('*.png')):
 name=path.stem;a=np.asarray(Image.open(path).convert('RGBA')).copy();h,w=a.shape[:2]
 rgb=a[:,:,:3].astype(int);background=(a[:,:,3]<190)|((rgb.min(2)>180)&(np.ptp(rgb,axis=2)<35));border=np.zeros_like(background);border[[0,-1],:]=True;border[:,[0,-1]]=True
 outside=ndimage.binary_propagation(border&background,mask=background);a[outside,3]=0;a[a[:,:,3]<24,3]=0
 frames=[]
 for row in range(2):
  batch=[]
  for col in range(4):
   l=round(col*w/4);r=round((col+1)*w/4);t=round(row*h/2);b=round((row+1)*h/2);cell=a[t:b,l:r]
   opaque=cell[:,:,3]>200
   assert not (opaque[0].any() or opaque[-1].any() or opaque[:,0].any() or opaque[:,-1].any()),(name,row,col,'source crosses cell edge')
   yy,xx=np.where(cell[:,:,3]>24);box=[int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)]
   batch.append({'image':Image.fromarray(cell).crop(box),'source':[l+box[0],t+box[1],box[2]-box[0],box[3]-box[1]],'bottom':t+int(np.where(opaque)[0].max())+1})
  baseline=max(f['bottom'] for f in batch)
  for f in batch:
   im=np.asarray(f['image']);core=im[:,:,3]>200;yy,xx=np.where(core);top=int(yy.min());bottom=int(yy.max())+1
   hip=core.copy();hip[:int(top+(bottom-top)*.55)]=False;hip[int(top+(bottom-top)*.78):]=False
   hx=np.where(hip)[1];pivotX=float(np.median(hx if len(hx) else xx))+.5
   f['pivot']=[pivotX,baseline-f['source'][1]]
   frames.append(f)
 reference=max(f['image'].height for f in frames[:4]);scale=min(1,240/reference);reference*=scale
 atlas=Image.new('RGBA',(2048,1024));x=y=8;rowHeight=0;records=[]
 for f in frames:
  im=f['image'];im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS);sw,sh=im.size
  if x+sw+8>2048:x=8;y+=rowHeight+16;rowHeight=0
  assert y+sh+8<=1024
  atlas.alpha_composite(im,(x,y));pivot=[round(v*scale,3) for v in f['pivot']];bounds=[-pivot[0]/reference,-pivot[1]/reference,(sw-pivot[0])/reference,(sh-pivot[1])/reference]
  records.append({'rect':[x,y,sw,sh],'pivot':pivot,'source':f['source'],'bounds':bounds,'bands':[bounds]});x+=sw+16;rowHeight=max(rowHeight,sh)
 atlas=atlas.crop((0,0,2048,y+rowHeight+8));atlas.save(ROOT/'public/art'/f'run-{name}.webp',quality=92,method=6)
 # A galloping dog's horizontal torso needs a separate size calibration from its standing cell.
 renderReference=reference/.88 if name=='brown_white_dog' else reference
 for f in records:
  f['bounds']=[v*reference/renderReference for v in f['bounds']];f['bands']=[f['bounds']]
 result[name+':run']={'atlas':'run-'+name,'referenceHeight':renderReference,'legacyCellHeight':reference,'frames':records,'envelope':[min(f['bounds'][0] for f in records),min(f['bounds'][1] for f in records),max(f['bounds'][2] for f in records),max(f['bounds'][3] for f in records)]}
 print(name,'8 complete gait poses',atlas.size)
(ROOT/'src/data/run-frames.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
