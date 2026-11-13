"""Pack authored RGBA sheets into mobile WebP atlases; no runtime masking/resizing.
Usage: python scripts/art/pack-world.py props.png events.png flames.png [states.png]
Original generated sheets remain outside the runtime bundle.
"""
from PIL import Image
from pathlib import Path
import sys,json
out=Path('public/art/living');out.mkdir(parents=True,exist_ok=True)
atlas=Image.new('RGBA',(1024,1024));frames={}
def cell(im,box):
 p=im.crop(box);a=p.getchannel('A');a=a.point(lambda v: 0 if v<12 else min(255,round(v*255/254)));p.putalpha(a)
 b=a.point(lambda v:255 if v>28 else 0).getbbox()
 return p.crop(b)
names=[['folk','folk-blink','rune','brazier','banner','lanterns'],['chest','chest-open','sled','tree','barrel','nest','bush','mushrooms']]
for sheet,cols,ids in zip(sys.argv[1:3],[3,4],names):
 im=Image.open(sheet);cw=im.width//cols;ch=im.height//2
 for i,name in enumerate(ids):
  p=cell(im,((i%cols)*cw,(i//cols)*ch,(i%cols+1)*cw,(i//cols+1)*ch));p.thumbnail((244,244),Image.Resampling.LANCZOS)
  slot=len(frames);x=(slot%4)*256+(256-p.width)//2;y=(slot//4)*256+250-p.height
  atlas.alpha_composite(p,(x,y));frames[name]=[x,y,p.width,p.height]
if len(sys.argv)>4:
 im=Image.open(sys.argv[4]);cw=im.width//2
 for i,name in enumerate(['barrel-open','bush-empty']):
  p=cell(im,(i*cw,0,(i+1)*cw,im.height));p.thumbnail((244,244),Image.Resampling.LANCZOS)
  slot=len(frames);x=(slot%4)*256+(256-p.width)//2;y=(slot//4)*256+250-p.height
  atlas.alpha_composite(p,(x,y));frames[name]=[x,y,p.width,p.height]
atlas.save(out/'props.webp','WEBP',quality=88,method=6)
# Fixed frame registration keeps the fire rooted in the bowl throughout the loop.
im=Image.open(sys.argv[3]);fire=Image.new('RGBA',(512,320))
for i in range(8):
 p=im.crop(((i%4)*384,(i//4)*512,(i%4+1)*384,(i//4+1)*512));p.putalpha(p.getchannel('A').point(lambda v:0 if v<12 else min(255,round(v*255/254))));p=p.resize((128,160),Image.Resampling.LANCZOS);fire.alpha_composite(p,((i%4)*128,(i//4)*160))
fire.save(out/'blue-fire.webp','WEBP',quality=85,method=6)
Path('src/data/living-art.json').write_text(json.dumps(frames,indent=2)+'\n')
print(json.dumps(frames));print('Runtime bytes',sum(p.stat().st_size for p in out.glob('*.webp')))
# Optional raven poses keep full-cell registration so wings don't change body scale.
if len(sys.argv)>5:
 im=Image.open(sys.argv[5]);bird=Image.new('RGBA',(256,256));cw=im.width//2;ch=im.height//2
 for i in range(4):
  p=im.crop(((i%2)*cw,(i//2)*ch,(i%2+1)*cw,(i//2+1)*ch));p.putalpha(p.getchannel('A').point(lambda v:0 if v<12 else v));p=p.resize((128,128),Image.Resampling.LANCZOS);bird.alpha_composite(p,((i%2)*128,(i//2)*128))
 bird.save(out/'ravens.webp','WEBP',quality=86,method=6)
