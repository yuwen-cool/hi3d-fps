# SANDLINE

A browser FPS built with three.js. Every 3D model in it was generated with [Hi3D](https://hi3d.ai) from a single concept image.

**Play:** https://sandline-2xa.pages.dev (desktop browser, mouse and keyboard)

From the title menu, open **HI3D HANGAR** to see each model the way it was made: the concept image Hi3D started from, the generated mesh, then the finished game model.

## Run it

You need Node 20.19+ (or 22.12+) and [Git LFS](https://git-lfs.com). The models are stored in LFS.

```sh
git lfs install
git clone https://github.com/yuwen-cool/hi3d-fps.git
cd hi3d-fps
npm install
npm run dev        # http://127.0.0.1:5320
```

`npm run build` writes a static site to `dist/`. The build stops if the models are LFS pointers instead of real files; run `git lfs pull` to fix it.

## How the assets were made

1. **Concept image.** One image per asset, generated with Hi3D's image model.
2. **Mesh.** Hi3D image-to-3D (`tools/hi3d_client.py`, `tools/hi3d_batch.py`).
3. **Game-ready model.** Blender bakes a low-poly mesh and textures (`tools/bake_asset.sh`). `tools/delight.py` removes baked-in lighting, then `tools/assemble.mjs` writes the compressed GLB to `public/models/`.
4. **Robots.** The robot is rigged to the Mesh2Motion skeleton (`tools/blender/rig_robot.py`). Mesh2Motion's CC0 clips are retargeted when the game loads (`src/enemies/anim.js`).
5. **Sound.** Sound effects, music and voice lines were generated with ElevenLabs (`tools/sfx_gen.mjs`, `tools/vo_gen.mjs`). Without them, the game falls back to synthesised sound.

The generation tools need your own accounts:
- Hi3D: run `python3 tools/hi3d_client.py login`.
- Monid/ElevenLabs: put a key in `tools/.monid_key`.

Neither is needed to run the game.

Most other scripts in `tools/` are headless test and capture tools: playtests, frame-time checks, screenshots, and the trailer and playthrough recorder. They are described at the top of each file.

## Layout

- `src/`: the game: world, player, weapons, enemies, effects, UI, audio.
- `public/`: runtime assets.
- `assets/`: sources the runtime assets were built from.
- `tools/`: the asset pipeline, plus test and capture scripts.
- `docs/`: the design plan and spec, in Chinese.

## Licence

The code is MIT; see `LICENSE`. The assets have their own terms; see [`ASSETS.md`](ASSETS.md). In short:
- Models: CC BY 4.0, credit "Created with Hi3D".
- Textures and animations: CC0.
- Audio: not openly licensed.
