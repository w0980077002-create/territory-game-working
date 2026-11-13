# Boss battle originals

Seven approved boss/miniboss PNG masters are cropped to their alpha bounds,
reduced to at most 768px, and encoded as **lossless WebP**. Rebuild with:

```
python scripts/art/pack-bosses.py
```

The original eight-row sheet supplies only 91–116px of detail for most bosses.
It remains in the repository for registration and the other animation clips,
but is no longer sampled for these seven actors.

`bossAnimation.ts` draws each original directly using uniform scaling and
procedural body poses (breathing, step, windup, strike, recoil, fallen rotation).
These replace the low-resolution flipbook for bosses; they do not invent extra
detail by enlarging its cells. Rotated artwork fits inside the existing registered
idle/death bounds, preserving formations, HUD clearance, and combat logic.
Textures load when the encounter is placed, before the boss arrives.

The battle canvas also follows displayed size × device pixel ratio (capped at
three times design resolution). Game coordinates and CSS dimensions stay fixed.
