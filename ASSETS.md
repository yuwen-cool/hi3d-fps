# Assets and licences

The MIT licence in `LICENSE` covers the code (`src/`, `tools/`, `shots/`, config files) and the docs.
Everything else is listed here.

| What | Where | Made with | Licence |
|---|---|---|---|
| 3D models and their concept images | `public/models/`, `public/hangar/`, `assets/src/`, `assets/rig/` | [Hi3D](https://hi3d.ai) (formerly Hitem3D) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit: "Created with Hi3D" |
| Ground and metal textures | `assets/ph/`, `public/tex/` | [Poly Haven](https://polyhaven.com) | CC0 |
| Character animations | `assets/m2m/`, `assets/anim/`, `public/anim/` | [Mesh2Motion](https://mesh2motion.org) | CC0 |
| Sound effects, music, voice | `public/sfx/` | ElevenLabs | **Not openly licensed.** Included only so this game runs. Don't extract, reuse or redistribute them on their own. |

The game also runs without `public/sfx/`: every sound has a synthesised fallback (`src/audio/audio.js`).
There is no music or voice in that case.

## Dependencies

Installed from npm, not stored in this repo. `npm run build` writes all their licence texts to `dist/third-party-licenses.txt`.

- [three.js](https://threejs.org), [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh), meshoptimizer: MIT.
- Fonts (Barlow Condensed, Big Shoulders, JetBrains Mono via @fontsource): SIL Open Font License 1.1.
- [spark.js](https://ludicon.com/sparkjs/) (GPU texture compression): its own licence. Free for personal, educational and small commercial use. The "Powered by spark.js⚡️" credit on the title screen must stay. Read its licence before you ship a fork commercially.
