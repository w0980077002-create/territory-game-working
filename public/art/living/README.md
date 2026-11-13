# Living world · painted art upgrade

Original generated, transparent painted fantasy assets, authored for this project on 2026-11-13.

- `props.webp`: 1024×1024, 16 tightly packed sprites. Rectangles in `src/data/living-art.json`.
- `blue-fire.webp`: 512×320, eight registered 128×160 frames; crossfaded at 9 fps.
- `ravens.webp`: 256×256, four 128×128 poses (perched / wings raised / extended / lowered).
- Runtime total: 528,804 bytes. Decoded base textures: approximately 4.9 MiB. Two flame color variants are cached once, not filtered during drawing.
- Reuses the existing approved `ui-shield.webp` for buried equipment and the Minotaur warning.

Packing: `python scripts/art/pack-world.py props.png events.png flames.png states.png ravens.png`.
The input sheets are generated authoring masters; the runtime needs only these three WebP atlases. Transparent margins are cleaned and all cells are separated by padding. Flame and raven frames retain full-cell registration.

No CSS bodies, SVG prop substitutes, emoji or external runtime image services. Asset URLs use the existing build-version helper so deployments refresh correctly on reload. No save migrations or dependencies were added.
