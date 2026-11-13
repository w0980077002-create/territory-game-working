# Northern forge / Roman legacy — original UI materials

Created for territory-game-working, Issue #8, 2026-11-12.

- `northern-world.webp`: original generated environment painting, one 1536×1024 atlas, four equal horizontal strips (vault / forge / runestone / harbor). No borrowed game artwork. Shared CSS sprite positions avoid four full background downloads. 236,454 bytes.
- `oak.webp`: original procedural longitudinal wood fibres, uneven plank joints and two asymmetric knots; 768×384.
- `iron.webp`, `cloth.webp`: original lightweight procedural surface textures, 256×256.
- Existing item and character illustrations are reused unchanged from the game's approved art catalogue. The new panoramas contain scenery only and never substitute an owned item, companion or character.
- Roman banner/columns and ambient effects are original SVG/CSS in `src/ui/SagaUI.tsx` and `saga.css`.

Atlas is compressed as WebP for delivery. Source painting remains in the session's generated image library. Decorative effects have small-screen, short-screen, reduced-motion and slow-display fallbacks.

## Mobile UI restoration · 2026-11-13

The dialogs now use a second original generated material painting, cut into optimized, reusable textures:

- `walnut.webp`: 576×768, 65,190 bytes. Walnut/mahogany boards with irregular deep grain and knots.
- `forged.webp`: 384×256, 9,764 bytes. Hammered black iron, darkened by a light CSS tint beneath interactive controls.
- `velvet.webp`: 384×256, 7,974 bytes. Dark woven lining beneath real item icons and descriptions.
- `chest-corner.svg`: original vector iron straps, rivets and twisted rope. Pointer-transparent border decoration, 42/30 CSS px in dialogs.

These materials are scoped to DialogShell. The original battle/HUD material variables and approved environment/characters are preserved. No reference screenshot is used as a flattened interface. The generated source painting remains in the session's generated image library; delivered textures total about 83 KiB including the corner SVG. All counts, icons, controls and item details are live game data.
