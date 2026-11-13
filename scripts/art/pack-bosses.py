"""Build lossless battle textures from the approved full-resolution originals.

The old eight-row animation sheet has only 91–116 pixels per boss. Never
upscale that sheet to produce these textures; keep the original artwork.
"""
from pathlib import Path
from PIL import Image
import json

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets/characters/v2-source/TERRITORY_ART_PACK_2026-11-11_v2/01_png_masters'
OUT = ROOT / 'public/art/bosses'
OUT.mkdir(parents=True, exist_ok=True)
records = {}
for actor in json.loads((ROOT / 'src/data/characters.json').read_text()):
    if actor['category'] not in ('bosses', 'minibosses'):
        continue
    image = Image.open(SOURCE / actor['category'] / (actor['id'] + '.png')).convert('RGBA')
    image = image.crop(image.getchannel('A').getbbox())
    image.thumbnail((768, 768), Image.Resampling.LANCZOS)
    image.save(OUT / (actor['id'] + '.webp'), lossless=True, method=6)
    records[actor['id']] = {'width': image.width, 'height': image.height}
(ROOT / 'src/data/boss-textures.json').write_text(json.dumps(records, indent=2) + '\n')
print('Packed', len(records), 'lossless boss textures')
