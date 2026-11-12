# Northern forge / Roman legacy — original UI materials

Created for territory-game-working, Issue #8, 2026-11-12.

- `northern-world.webp`: original generated environment painting, one 1536×1024 atlas, four equal horizontal strips (vault / forge / runestone / harbor). No borrowed game artwork. Shared CSS sprite positions avoid four full background downloads. 236,454 bytes.
- `oak.webp`: original procedural longitudinal wood fibres, uneven plank joints and two asymmetric knots; 768×384.
- `iron.webp`, `cloth.webp`: original lightweight procedural surface textures, 256×256.
- Existing item and character illustrations are reused unchanged from the game's approved art catalogue. The new panoramas contain scenery only and never substitute an owned item, companion or character.
- Roman banner/columns and ambient effects are original SVG/CSS in `src/ui/SagaUI.tsx` and `saga.css`.

Atlas is compressed as WebP for delivery. Source painting remains in the session's generated image library. Decorative effects have small-screen, short-screen, reduced-motion and slow-display fallbacks.
