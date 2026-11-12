"""Transcode original layered world art for mobile decoding; source pixels are preserved."""
from pathlib import Path
from PIL import Image
import json
ROOT=Path(__file__).resolve().parents[1]
for name in ['mountains','city','landmarks','road']:
 image=Image.open(ROOT/'assets/world-source'/f'{name}.png')
 if name=='landmarks':
  # Import atlas alpha as coverage: discard the generator's low-alpha matte.
  image=image.convert('RGBA');image.putalpha(image.getchannel('A').point(lambda a:max(0,min(255,(a-180)*255//65))))
  rects=[];cw=image.width//3;ch=image.height//2
  for i in range(6):
   left=(i%3)*cw;top=(i//3)*ch;box=image.crop((left,top,left+cw,top+ch)).getbbox();assert box
   rects.append([left+box[0],top+box[1],box[2]-box[0],box[3]-box[1]])
  (ROOT/'src/data/world-landmarks.json').write_text(json.dumps(rects))
 image.save(ROOT/'public/art'/f'world-{name}.webp',quality=92,method=6)
 print(name,image.size)
