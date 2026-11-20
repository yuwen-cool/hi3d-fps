# hi3d-fps 技术规格（SPEC）

目标：浏览器里的 3A 画质 FPS demo。three.js，单个小关卡（沙漠炼油厂：庭院 + 室内长廊，见 `target/t1-courtyard.png`、`target/t2-corridor.png`），2 种敌人（人形战斗机器人为主，见 `target/t3-enemy.png`），武器常驻画面。模型来自 Hi3D（实测单件 500 万面、单一网格、无法线和法线贴图、UV 碎片化、底色带烘焙光影，见 `PLAN.md` §1.1）。

本文只写"怎么做、用什么数"。做什么、先后顺序和过关条件见 `PLAN.md`，两者冲突时以 `PLAN.md` 为准。

**代码来源规则**：Saltline 副本没有许可证，guizang 是 AGPL。下文凡写"照抄""照搬""移植"的，指的是技术做法和参数起点；着色器和代码一律自己写，参数按本项目的黄昏沙漠场景重调。

---

## 0. 读法与出处约定

| 缩写 | 指向 |
|---|---|
| `SL:行号` | `refs/saltline/index.html`。游戏代码是 esbuild 压缩后的超长行（如 L4187、L4740、L5935、L6061、L6083、L6190 都是几万到十几万字符的一行），所以压缩行后面附上方括号里的检索串，用 `grep -n -F '检索串' index.html` 可直接定位。GLSL 模板字符串没被压缩，行号精确。 |
| `SW:路径:行` | `refs/siege-wing/` |
| `GZ:路径:行` | `refs/guizang-game-skill/` |
| `TS:路径:行` | `refs/threejs-skills/skills/` |
| `DL:路径:行` | `refs/dream-loop/` |
| `SC:路径:行` | `/Users/gkx/Desktop/coding/sunken-city/`（我们的旧项目） |
| 本项目定 | 源码里没有直接依据，是本规格的决定，实施后要用截图或数据验证 |

Saltline 的关键事实（读后结论，后文不再重复）：
- 单文件约 1.4 MB，three.js r180 打包在内（SL:356 `REVISION`，`__THREE__="180"`）。
- **零外部资源**：地面、集装箱、起重机、武器、手、敌人、贴图、音效、音乐全部是代码生成的。贴图在启动时用 GPU 片元着色器"烘焙"成 albedo/ORM/normal 三张图（SL:5449 `async function Gg`；各材质着色器是 SL:4829 起的 GLSL 段 `Tn.asphalt=`、SL:4854 `Tn.concrete=` 等）。
- 它看起来像 3A，主要靠五件事：
  1. 自写的 HDR 后处理链：半分辨率 AO、带阴影采样的体积光、能量守恒泛光、自动曝光、ACES/AgX 混合色调映射、调色、FXAA、锐化、颗粒。
  2. PCSS 软阴影。
  3. 所有材质共用一个"宏观变化 + 雨湿 + 污垢 + 高光抗锯齿"的着色器补丁。
  4. 武器用独立相机和压缩深度区间渲染。
  5. 弹簧驱动的武器和镜头运动。

  这五件都与模型来源无关，可以直接搬到 Hi3D 资产上。

---

## 1. 架构

### 1.1 工程形态：Vite 多模块工程（不做单文件）

建议用 **Vite + ES 模块**，静态部署。理由如下：
1. Saltline 能做成单文件，是因为它没有任何外部资源，代码就是资产。我们的资产是 Hi3D 生成的 GLB 加 KTX2 贴图，处理后仍有几十 MB。
2. guizang 的单文件方案把资产转成 data URL 塞进 HTML，结果约 30 MB（GZ:references/packaging.md:3），解析慢，还要包一层 fetch shim（GZ:references/packaging.md:18-22）。
3. KTX2 转码器（basis wasm）和 meshopt 解码器都需要能被加载。
4. 旧项目 sunken-city 用 Vite 8，已有经验（SC:package.json，SC:vite.config.js）。
5. 本仓库 `package.json` 已经装了 vite 8.3.8。

要保留的 Saltline 结构习惯：
- **全局上下文对象 + 事件总线 + 可替换模块桩**：每个模块 `create(G)` 返回 `{update(dt), ...}`。模块启动失败就换成同接口的桩对象，整局照常运行（SL:4187 `dr={ground:()=>({stub:!0`；SL:6190 `async function r(h,f,p,d=!1)` 的 try/catch 加 `dr[h]()` 兜底）。
- **每个模块都有 `showcase`**：URL `?show=模块名` 只把这个模块摆到一个灰色平台上供截图审查（SL:6190 `gM={mats:qg,level:cv,...}` 与 `i.show&&gM[i.show]`）。

### 1.2 three.js 版本

**钉死 `three@0.187.0`**：去掉 `^`，同时把 `package.json` 的 `"type"` 改成 `"module"`。
- 本仓库 node_modules 已装 0.187.0。
- 旧项目 0.186.1（SC:package.json），threejs-skills 按 r186 写。
- Saltline 用的是 r180。

必须遵守的 r180+ API 变化（TS 与 SC 都踩过）：
- 用 `HDRLoader`，不用 `RGBELoader`（TS:threejs-lighting/SKILL.md:468-470；SC:docs/CONTRACTS.md:11-13）。
- `PCFSoftShadowMap` 已弃用，用 `PCFShadowMap`，软化交给自写 PCSS 着色器块（TS:threejs-lighting/SKILL.md:465；SL:4740 `n.shadowMap.type=gc`，gc 即 PCFShadowMap）。
- 用 `THREE.Timer`，不用 `Clock`（TS:threejs-postprocessing/SKILL.md:480）。Saltline 直接用 `performance.now()`，也可以。
- `renderer.setAnimationLoop` 驱动主循环（SL:6190 `t.renderer.setAnimationLoop(`）。
- `scene.environmentIntensity` 取代逐材质 `envMapIntensity`（TS:threejs-lighting/SKILL.md:473）。
- 不用 pmndrs `postprocessing` 库：它会忽略 `renderer.toneMappingExposure`（SC:src/core/renderer.js:8-22）。我们照 Saltline 自写后处理（见 §2），所以 `postprocessing` 和 `n8ao` 两个依赖要移除。

### 1.3 模块划分

| 模块 | 职责 | 对应 Saltline |
|---|---|---|
| `core/context` | `G = {THREE, params, events, rng, time, quality, ...}`，URL 参数，种子随机数（默认种子 4207） | SL:6190 `rng:il(+(i.seed\|\|4207))` |
| `core/events` | `on/off/emit`。回调抛错只打印，不中断循环 | SL:4187 `function Dy()` |
| `core/quality` | 档位表、GPU 嗅探、动态分辨率 | SL:4187 `Pr={test:`、`function zy(` |
| `render/` | renderer、天空、PMREM、太阳与 PCSS、点光池、后处理链、武器渲染层 | SL:4187–4740 `Vg` 模块 |
| `mats/` | 统一材质补丁（宏观变化 / 湿 / 尘 / 高光抗锯齿）、材质库、贴花图集 | SL:4740–5449 `qg` 模块 |
| `assets/` | GLTFLoader + KTX2 + Meshopt、归一化（尺寸、朝向、落地）、占位盒 | Saltline 无；参照 SC:src/core/assets.js:39,52-82 |
| `world/level` | 关卡布置、碰撞盒、掩体点、室内盒（interiorBoxes）、出生点 | SL:5449 `cv` |
| `world/physics` | AABB 盒碰撞、胶囊移动、射线、0.5 m 网格导航 | SL:5449 `function d3(`（`Ls=.5` 网格） |
| `world/ground` | 地面材质、积水、平面反射、雨 | SL:5470 `vv`，SL:5490-5657 |
| `fx/` | 粒子池（受光 / 加色）、曳光、弹壳、碎片、贴花、各表面命中效果、爆炸 | SL:5821 `Sv` |
| `audio/` | Web Audio 引擎、声音库、事件绑定 | SL:5935 `rifle_shot:{gen` 附近 |
| `player/input` | 指针锁定、键位、灵敏度、尖峰过滤 | SL:5935 `KeyW:"forward"` |
| `player/controller` | 移动、跳跃、镜头晃动 / 下沉 / 震屏、后坐力承接、生命恢复 | SL:5935 `walk:3.8,sprint:6.4` |
| `combat` | 玩家射线命中（先打环境再打敌人）、敌人射击判定、爆炸伤害 | SL:5935 `function zv(` |
| `weapon/` | 第一人称视图模型、射击、后坐、开镜、换弹、枪口火焰 | SL:5935–6061 `Xv` |
| `enemies/` | 感知、状态机、攻击令牌、寻路、动画、受击、死亡、残骸 | SL:6061 `ex` |
| `hud/` | DOM HUD：准星、命中标记、击杀播报、弹药、受击方向 | SL:6083 `function hM(` |
| `game/` | 流程：标题、开场、波次、目标、撤离 | SL:6190 `introSeconds:3.5` |
| `dev/` | `?show`、`?shot`、`?cam`、`?bench`、`window.__stats` | SL:6190 `SALTLINE BENCH` |

### 1.4 主循环（逐帧顺序）

照抄 SL:6190（`t.renderer.setAnimationLoop(()=>{...})`）：

```
dt = min(帧间隔秒, DT_MAX)          // Saltline 用 0.05；本项目取 0.1，原因见 §10
time.t += dt
input.update
game.update                         // 返回 false 或处于 title/paused 时，下面三项不更新
player.update → weapon.update → enemies.update
（未暂停时）fx / ground / level / backdrop / mats 依次 update
audio.update → hud.update
render.frame(dt)
input.endFrame                      // 清"本帧按下"
__frames++；第 2 帧置 __ready = true
```

- 每个模块的 update 都包 try/catch。同一模块只打印第一次报错，之后该模块静默失效，主循环继续（SL:6190 `u.err[h]||(u.err[h]=1,console.error(`）。
- 弹簧积分按 8 ms 子步：`n = dt > 0.012 ? ceil(dt / 0.008) : 1`（SL:6061 `function ma(`）。
- 玩家胶囊移动在 dt > 1/60 时也拆子步（本项目定）。

### 1.5 渲染帧顺序（`render.frame`）

照抄 SL:4740 的 `function j(ie)` 和 `frame(ie)`：
1. `renderer.info.reset()`（`info.autoReset = false`，一帧多次 render 才能统计准确；TS:threejs-performance/SKILL.md:369-370）；更新点光池；更新天空时间。
2. 把世界相机的矩阵同步给武器相机（SL:4740 `function C(){a.updateMatrixWorld(!0),l.matrixAutoUpdate=!1`）。
3. 运行预渲染（平面反射，见 §2.7）。
4. `setRenderTarget(hdrRT)`，清颜色和深度。
5. 阴影图更新：ultra 档每帧，其余档隔帧（`(T&1)===0`），没有阴影图时强制更新。
6. 渲染世界（layer 0）。
7. `gl.depthRange(0, 0.05)`，用武器相机渲染 layer 1。这一步临时把 `environmentIntensity` 乘以 `viewFill = 1.35`，结束后在 finally 里恢复 `depthRange(0,1)`。
8. 后处理链（§2.4）→ 画到屏幕。
9. 任何后处理着色器编译失败，整条链降级为前向渲染。降级路径：直接上屏，`toneMapping = ACESFilmic`，`toneMappingExposure = 0.6 * exposure`（SL:4740 `function G(){n.toneMapping!==xc`）。

### 1.6 资源加载

```js
const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
const gltf = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
```

- 解码器和转码器自托管时，要和 three 版本钉在一起（TS:threejs-loaders/SKILL.md:222,485）。
- KTX2 的颜色空间由文件决定（TS:threejs-textures/SKILL.md:209）。

启动分段与进度条照 SL:6190 的 `Nr(文案, 进度)` 写法，每段 `await setTimeout(0)` 让出主线程。顺序：
1. renderer
2. 材质库
3. 关卡
4. 远景
5. 地面
6. 特效
7. 音频
8. 武器
9. 敌人
10. HUD
11. `render.onLevelReady()`
12. Ready

`onLevelReady` 做三件事（SL:4740 `async onLevelReady()`）：
- 把阴影标记为需要更新；
- 拍室内环境探针；
- `await renderer.compileAsync(scene, camera)`，再对室内环境材质补一次 `compile`。所有隐藏物体（敌人池、特效池）在这一步之前要临时设为可见，编译完再隐藏（SC 提交 0564ef3、25012ee）。

旧项目还有两条做法要沿用：
- 每个模型在资源到位前先用"同尺寸彩色占位盒"顶上，功能开发不等资产（SC:src/core/assets.js:71-82，SC:docs/CONTRACTS.md:26-28）。
- 加载进度由 `DefaultLoadingManager.onProgress` 驱动（SC:src/main.js:28）。

### 1.7 调试接口（`dev/`）

| 接口 | 行为 | 出处 |
|---|---|---|
| `?q=low\|medium\|high\|ultra\|test` | 指定画质档 | SL:6190 `quality:zy(i.q\|\|(i.shot?"test":""))` |
| `?shot=1` | 跳过开场直接开局；关闭动态分辨率；用 test 档 | SL:6190 `t.game.start({skipIntro:!0})` |
| `?cam=x,y,z,lx,ly,lz`、`?fov=`、`?exposure=` | 锁定机位 | SL:6190 `function o(h)` |
| `?show=mats\|fx\|weapon\|enemies\|render\|level...` | 单模块陈列台 | SL:6190 `gM[n].showcase(t)` |
| `?bench` | 沿关卡的电影路径匀速飞 30 s，屏上显示 avg、median、p99 帧时、分辨率、`__stats` | SL:6190 `function eP(i)` |
| `?seed=`、`?dt=` | 固定随机种子 / 固定步长 | SL:6190 |
| `?ao=0 ?vol=0 ?bloom=0 ?mb=1 ?post=0 ?dynres=0` | 单项开关后处理 | SL:4740 `e.ao==="0"&&(i.quality.ao=!1)` |
| `?noaudio ?noweapon ?mute=1` | 静音或隐藏武器 | SL:6190；SC 提交 3c1a3b1 |
| `window.__ready / __frames / __errors / __fatal / __stats() / __setShot() / __G` | 供自动化脚本读取 | SL:6190 |

`__stats()` 返回 `{calls, tris, geos, tex, programs, res, scale, advanced, softShadows, adapt}`（SL:4740 `stats(){`）。

---

## 2. 渲染底座

### 2.1 Renderer

数值照抄 SL:4740 `n=new gf({canvas:t,antialias:!1,...` 那一段。

| 项 | 值 |
|---|---|
| WebGLRenderer | `antialias:false, powerPreference:'high-performance', alpha:false, depth:true, stencil:false` |
| 输出 | `outputColorSpace = SRGBColorSpace`；`toneMapping = NoToneMapping`（色调映射只在后处理做一次）；`toneMappingExposure = 1` |
| 阴影 | `shadowMap.enabled = true`；`type = PCFShadowMap`；`autoUpdate = false`（手动置 needsUpdate） |
| 其他 | `autoClear = false`；`info.autoReset = false`；`setClearColor(0, 1)` |
| 世界相机 | `PerspectiveCamera(74, aspect, 0.08, 900)`；layer 0；`rotation.order = 'YXZ'`（SL:4187 `fov:74,viewFov:54`） |
| 武器相机 | `PerspectiveCamera(54, aspect, 0.01, 10)`；layer 1 |
| 着色器出错定位 | 每个后处理着色器开头加注释 `// SALTLINE_POST <名字>`，天空加 `// SALTLINE_SKY`，阴影块加 `// SALTLINE_SHADOW`。`renderer.debug.onShaderError` 按这些标签报告是哪个 pass 编译失败（SL:4740 `n.debug.onShaderError=`）。本项目改用 `// HF_POST` 等前缀即可 |
| 启动自检 | 放一个测试方块，把整条链跑一帧。失败就降级前向渲染；软阴影块被驱动拒绝就恢复原版 PCF，并把 `shadow.radius` 设为 2（SL:4740 `advanced pipeline failed its self test`） |

### 2.2 光照

| 项 | Saltline 值 | 出处 | 本项目 |
|---|---|---|---|
| 太阳 | `DirectionalLight`；方向 `(0.916, 0.225, 0.331)` 归一化，仰角约 13°；颜色 `(1, 0.72, 0.42)`；强度 9 | SL:4187 `Mn={dir:new W(.916,.225,.331)` | 目标图是更低的逆光黄昏。仰角取 6–10°，颜色暖化到 `(1, 0.62, 0.32)` 起调，强度 8–10。按 §9 对照目标图调 |
| 天空色 | zenith `(0.055, 0.085, 0.13)`；horizon `(0.95, 0.55, 0.28)`；horizonAway `(0.16, 0.22, 0.30)`；fog `(0.42, 0.47, 0.52)` | SL:4187 `en={zenith:` | 同结构，按目标图取色 |
| 天空 | 程序化穹顶着色器：分层云、日晕（4 级 pow：8/64/600/6000）、日盘 `disk*110`。日盘只在主画面出现，PMREM 里不画（`uEnv`） | SL:4203-4290 | 照搬结构 |
| 环境光 | 天空场景做一次 `PMREMGenerator.fromScene(skyScene, 0, 0.1, 100)` → `scene.environment`；`environmentIntensity = 2` | SL:4292 `fromScene(s,0,.1,100)`，SL:4740 `Jy=2,Ky=1` | 同 |
| 室内环境探针 | 室内盒中心、离地 `min(2.4, 高 * 0.4)` 处放 128² 半浮点 CubeCamera(0.15, 300)，经 PMREM 赋给 `userData.interior` 材质；室内 `envMapIntensity = 1`。相机进入室内盒时，场景环境切到探针 | SL:4740 `function K(){let ie=i.level&&i.level.interiorBoxes` | 长廊是室内盒 |
| 武器补光 | 渲染武器时环境强度乘以 1.35 | SL:4740 `viewFill\|\|1.35` | 同 |
| 点光池 | 6 盏 `PointLight(白, 0, 12, 2)` 常驻。`flash(pos, color, intensity, distance, ttl)` 线性衰减到 0；`acquire()` 给持续光源（火）用。灯不增不删，避免材质重编译 | SL:4740 `let v=6,g=[];for(...)new Qr(16777215,0,12,2)`；重编译原因见 TS:threejs-lighting/SKILL.md:394 | 同 |
| 雾 | **不用 `scene.fog`**。大气全部由体积光 pass 和远景解析雾完成（§2.4 第 7 步） | 全文无 `scene.fog` 赋值 | 同。所以自写 ShaderMaterial 也无需各自处理雾 |

### 2.3 阴影（PCSS）

| 项 | 值 | 出处 |
|---|---|---|
| 正交框 | 固定拟合整个关卡包围盒加投影体（Saltline 用 `(-41,-0.2,-33)–(37,32,31)` 和 `(-41,-3,-64)–(72,36,34)`），四周各放 1 m，near ≥ 1。小关卡一张图就够，不用级联 | SL:4740 `f=Gy(h,new W(-41,-.2,-33)`；定义在 SL:4292 `function Gy(` |
| mapSize | 按档位 2048 / 4096（§2.6） | SL:4187 `Pr` |
| bias / normalBias / radius | `-1.2e-4 / 0.02 / 1` | SL:4740 `h.shadow.bias=-12e-5,h.shadow.normalBias=.02,h.shadow.radius=1` |
| 着色器 | 替换 `shadowmap_pars_fragment` 里的 `getShadow`：<br>· 接收面深度梯度偏移（receiver-plane bias），斜率上限 `0.0030/texel`，系数 0.35<br>· IGN 旋转的 Vogel 圆盘<br>· 遮挡物搜索：8 tap，半径 `0.55 * shadowRadius` 米<br>· 半影 `clamp(遮挡距离 * 0.022 * r, 0.012r, 0.60r)` 米<br>· 过滤：16 tap（low 档 10）<br>· 阴影图边缘 2% 渐隐为全亮 | SL:4293-4340（`maxSlope = 0.0030` 在 L4313，`penM` 在 L4330） |
| 更新频率 | 隔帧（ultra 每帧） | SL:4740 `(T&1)===0` |
| 武器 | 不投影，只接收（castShadow false / receiveShadow true） | SL:6061 `be.castShadow=!1,be.receiveShadow=!0` |

对照：
- siege-wing 用两级级联：±105 m 和 ±310 m，按纹素对齐防边缘爬动（SW:src/sky.js:146-155），`bias -0.00016`，`normalBias 0.11`（SW:src/sky.js:79）。
- 旧项目用 2048 图、90 m 框、`bias -0.0002`、`normalBias 0.04`，并在太阳对面加一盏补光，避免逆光模型成黑剪影（SC:src/world/environment.js:26-35）。目标图是逆光构图，这盏补光要有，但用环境光实现，不另加平行光（本项目定）。

### 2.4 后处理链（完整顺序与参数）

所有 pass 共用：全屏单三角形 + `ShaderMaterial(depthTest:false, depthWrite:false, blending:NoBlending, toneMapped:false)`（SL:4739 `function jy(`）。

参数总表 `TUNE` 一字不改照抄（SL:4740 `volSunScale:.85`）：

```js
TUNE = { volSunScale:0.85, volAmbient:0.2, volSigma:0.0034, volMaxDist:170, volFarHaze:0.42, volInteriorDust:6,
         aoRadius:0.9, aoIntensity:1.6, aoStrength:0.95,
         bloom:0.065, bloomMix:0.62, dirt:0.1, streak:0.03, streakThreshold:2.2, flare:0.16,
         key:0.12, minExposure:0.6, maxExposure:2, adaptTau:1.5,
         agxMix:0.25, ca:0.0013, vignette:0.3, grain:0.02, sharpen:0.3, lookPower:1.18, lookSat:1.22 }
```

**渲染目标**
- 场景目标：HalfFloat RGBA；`depthTexture`（UnsignedIntType，Nearest）；`samples = 档位 msaa`。
- 中间目标：一律 HalfFloat、Linear、无深度、无 mipmap。
- 例外：`ldr`、`aoA/aoB`、`dirt` 用 UnsignedByte；`depthHalf` 在支持 `EXT_color_buffer_float` 时用 Float + RedFormat。
- 以上见 SL:4740 `let y={scene:p(c,h),motion:p(c,h),ldr:p(u,h),depthHalf:x?p(as,f,{format:J0})`。

**深度约定**：深度值 `d < 0.05` 的像素就是武器（因为武器画在 `depthRange(0,0.05)` 里）。下列步骤都对这些像素跳过：AO、体积光、运动模糊（`n1 = "0.05"`，SL:4345）。

| # | Pass | 分辨率 | 关键参数与公式 | 出处 |
|---|---|---|---|---|
| 0 | 阴影图 | 2048/4096 | 见 §2.3 | |
| 1 | 场景 → HDR RT | 全分辨率 × 档位缩放 × 动态缩放 | 世界（layer 0）+ 武器（layer 1，`depthRange 0..0.05`） | SL:4740 |
| 2 | depthHalf | 1/2 | `texelFetch` 精确取（不用双线性，否则斜地面的 AO 会出条带）；转线性深度 `z = n*f / (f - d*(f-n))`；武器像素写 0.01 | SL:4355-4362（`texelFetch` 在 L4360） |
| 3 | AO | 1/2 | 法线由深度重建（左右上下取差小的一侧）。<br>`R = 0.9 * (0.6 + 0.4 * clamp(z/12))` 米；屏幕半径限制在 `[3 texel, 0.14 uv]`；螺旋 3 圈采样，taps：low/test 8、med/high 12、ultra 16。<br>权重 `f³ * max((v·n - (0.015 + 0.004z)) / (v·v + 0.004), 0)`。<br>`ao = 1 - 1.6 * sum * 5 / (R⁶ * taps)`；70–140 m 渐隐为 1 | SL:4363-4394（`float R=` 在 L4376）；taps 见 SL:4740 `function ue(){` |
| 4 | AO 双边模糊 | 1/2 | 7 tap，先横后竖，权重 `(1 - 0.22|i|) * max(0, 1 - |z - zc| / (0.04 zc + 0.02))` | SL:4451-4463；`BLUR_TOL:"0.04"` |
| 5 | 体积光 | 1/2 | 光线步进 `VOL_STEPS` 步（low 12 / med 16 / high 24 / ultra 40）。<br>· 采样位置 `t = maxD * f * (0.35 + 0.65f)`（近处更密），IGN 抖动。<br>· 消光 `σ = 0.0034 * shape(h)`，其中 `shape(h) = 0.30 + 0.70 * exp(-h/5.5)`（高度雾）；在室内盒中再 ×(1 + 6)，即室内灰尘。<br>· 相位：双瓣 HG，`min(hg(μ,0.78)*0.55 + hg(μ,0.25)*0.45, 1.15)`。<br>· 太阳可见性：采样阴影图，偏移 0.0006。<br>· 近场加权 `mix(2.3, 0.55, smoothstep(4, 85, t))`，近处光束明显、远处只留薄纱。<br>· 环境散射 `0.2 * fogColor * (0.40 + 0.60 * sh)`。<br>· 最大距离 170 m（天空方向 ×0.55）。超出部分做解析远雾：`tau = σ * 0.42 * (dist - 170) * shape 平均`，雾色 `horizonColor * 0.5 + amb * 0.6`。<br>· 输出 `(inscatter.rgb, transmittance)` | SL:4395-4450（`shape` 在 L4403，`ph` 在 L4422，`nearW` 在 L4436） |
| 6 | 体积光双边模糊 | 1/2 | 同第 4 步，容差 `BLUR_TOL = 0.30` | SL:4740 `BLUR_TOL:"0.30"` |
| 7 | 合成 composite | 全 | 半分辨率 AO 和体积光做 4 点联合双边上采样，权重 `bilinear / (0.015 + |zh - zc| / zc)`。<br>AO 只压暗环境光部分：`lit = smoothstep(0.16, 0.85, luma*exposure)`，`a = mix(1, ao, 0.95 * (1 - 0.8 lit))`，再乘偏冷色 `mix(a, 1, (0, 0.03, 0.07))`。<br>`col = col * T + inscatter` | SL:4464-4495（L4489–L4493） |
| 8 | 运动模糊（仅 high/ultra） | 全 | 用逆 VP 加上一帧 VP 求速度；快门 `min(0.5, (1/190)/dt)`；9 tap；速度上限 0.018 uv；小于 0.75 px 不做；武器像素不参与 | SL:4496-4516（L4508） |
| 9 | 泛光下采样 ×6 | 从 1/2 起逐级减半 | 13 tap（COD 式），单样本上限 400。第一级用部分 Karis 平均：`kw = 1 / (1 + 0.08 luma)`，压亮点但不压太阳 | SL:4517-4535（L4528） |
| 10 | 泛光上采样 ×5 | 逐级 | 9 tap tent，`mix(高一级, 上采样结果, 0.62)` | SL:4536-4544 |
| 11 | 横向光条（变形镜头条纹） | mip2 | 阈值 `2.2 / max(exposure, 0.2)`；15 tap 高斯 `exp(-x²/18)`；两遍，步长 1.5 texel 和 5 texel | SL:4545-4557；SL:4740 `nn*1.5,0` |
| 12 | 自动曝光 | 1×1 乒乓 | 在最小一级泛光 mip 上取 7×5 网格，中心加权 `1 - 0.75 * smoothstep(0.1, 0.55, r)`，求对数平均亮度 `avg`（夹到 0.002–40）。<br>曝光 = `clamp((0.12/avg)^0.85, 0.6, 2.0)`；适应 `1 - exp(-dt/1.5)`；首帧直接取值；NaN 保护。<br>同时测太阳可见度：日盘周围 12 点深度测试，`τ = 0.12 s` | SL:4558-4583（L4565）；`slExposure()` 在 SL:4350-4352 |
| 13 | 镜头污渍图 | 512×288，只生成一次 | 70 个随机圆斑、fbm 污迹、竖向条纹，边缘更重 | SL:4584-4602 |
| 14 | 调色（输出 8 位 LDR） | 全 | 按下表顺序执行 | SL:4603-4708 |
| 15 | 最终 final | 全 → 屏幕 | FXAA → 锐化 → 颗粒 → 抖动 | SL:4709-4738 |

**第 14 步调色，逐项顺序（SL:4660-4708）：**

`r2` 指归一化到"屏幕中心 0、角落 1"的半径平方。

1. 径向色差：偏移 `c * r2 * (0.0013 + damage * 0.006)`，R 和 B 反向偏移（L4666）。
2. 开镜周边虚化：`mix(col, 1/4 分辨率模糊图, ads * 0.75 * smoothstep(0.22, 0.85, r2))`（L4670）。
3. 泛光能量守恒混合：`col = mix(col, bloom, 0.065)`（L4674）。不是加法，所以 HDR 高值不会"白成一片"。
4. 污渍 `+ bloom * dirt * 0.1`；横条 `+ streak * (0.45, 0.62, 1.0) * 0.03`。
5. 太阳眩光：日盘遮挡测试之后，加光晕、3/4 瓣衍射刺（L4645）、4 个鬼影、对侧光环；强度 0.16，并乘 `(1 + dirt * 1.5)`。
6. 乘曝光（手动值 × 自动曝光）；开火闪光 `+ (1, 0.97, 0.9) * flash * 2.5`。
7. 色调映射：`mix(ACES(Hill 拟合, 输入 ×1.3), AgX(punchy), 0.25)`（L4684）。AgX 的 look 参数：`pow 1.18`、饱和 1.22（L4624；ACES 在 L4634）。
8. 分离色调：`col *= mix((0.80, 1.01, 1.13), (1.07, 1.0, 0.90), smoothstep(0.03, 0.55, l))`，即暗部青、亮部暖（L4689）。
9. S 曲线：`mix(col, col²(3 - 2col), 0.22)`。
10. 黑位微抬并偏青：`col * 0.988 + (0.006, 0.0085, 0.011)`（L4694）。
11. 饱和度：`sat * (1 - 0.65 lowHealth) * (1 - 0.5 damage)`。
12. 暗角：`vig = 0.3 + 0.55 lowHealth + 0.22 ads`；`vr = smoothstep(0.15 - 0.08 ads, 1.05, r2)`；`col *= 1 - vig * vr²(3 - 2vr)`（L4700）。
13. 受伤红边：`edge = smoothstep(0.18, 1, r2)`；混向 `(0.55, 0.02, 0.01) * (0.35 + l)`。权重 `clamp(damage * edge * 0.85 + lowHealth * edge² * 0.25 * (0.75 + 0.25 sin 5t))`。
14. 淡出 `*(1 - fade)` → 手动 sRGB 编码 → `alpha = luma`（给 FXAA 用）。

**第 15 步 final（SL:4709-4738）：**
- FXAA：触发条件 `contrast > max(0.0312, lMax * 0.10)`；方向向量夹到 ±8 texel（L4719）。
- 反锐化：`+(M - 四角均值) * 0.3 * (1 - smoothstep(0.04, 0.22, contrast))`，强边缘留给 FXAA 处理（L4730）。
- 颗粒：两个 hash 相加减 1，再乘 `0.02 * mix(1, 0.3, smoothstep(0.25, 0.9, l)) * (0.35 + 0.65 * smoothstep(0, 0.08, l))`，即亮部和纯黑处都少（L4735）。
- 三角分布 ±1/255 抖动，消天空渐变的色带（L4736）。

**对 guizang"泛光峰值 2–3"规则的说明**：guizang 要求 HDR 峰值不超过 2–3（GZ:references/vfx-ui-audio.md:22），是因为它用的是加法泛光。本链路是 6.5% 的能量守恒混合，Saltline 的自发光材质可以到 14–30 倍（SL:4740 `i.mats.emissive(16726560,30)`），曳光强度 16。所以本项目按 Saltline 的数值走。**禁止**另外再接 UnrealBloomPass。

**备选参照（不采用，记录差异）**：siege-wing 的链路是
场景 → 1/4 分辨率屏幕空间径向光束（3 遍 × 8 tap，衰减 0.93）→ 双滤波泛光（`p.bloom/6*1.6`）→ 色差 0.0012 → 污渍 → 曝光 → 暗角 0.32 → ACES（输入 ×0.9）→ 饱和 1.14 → 分离色调 → `pow 1.03` → gamma → FXAA 3.11 → 颗粒 0.035（SW:src/post.js:15,27-38,65-138）。

它的光束只在面向太阳时出现。Saltline 的体积光侧光也能看到，目标图 t1、t2 正需要这种效果，所以选 Saltline。

### 2.5 抗锯齿与分辨率

- 场景目标开 MSAA（med 2、high/ultra 4），后面再接 FXAA 和锐化。不做 TAA（Saltline 没有 TAA，本项目也不做）。
- DPR 上限 2。最终内部分辨率 = `客户区 × dpr × 档位 scale × 动态 scale`，超过档位像素预算时按 `sqrt(预算/像素)` 缩小。像素预算：low 1.0M、medium 1.5M、high 2.3M、ultra 3.7M（SL:4740 `low:1e6,medium:15e5,high:23e5,ultra:37e5`）。
- 程序贴图和 KTX2 贴图的 anisotropy 取 `min(8, maxAnisotropy)`（SL:5449 `o=Math.min(8,e.capabilities.getMaxAnisotropy`）。

### 2.6 画质档位

照抄 SL:4187 的 `Pr` 表。`tex` 一列在 Saltline 里是程序贴图尺寸，本项目改作 GLB 贴图的加载上限。

| 档 | scale | msaa | shadow | tex | volSteps | ao | planar | bloom | motionBlur | rain |
|---|---|---|---|---|---|---|---|---|---|---|
| low | 0.70 | 0 | 2048 | 512 | 12 | 关 | 0 | 开 | 关 | 0.5 |
| medium | 0.85 | 2 | 2048 | 1024 | 16 | 开 | 0.5 | 开 | 关 | 0.8 |
| high | 1.00 | 4 | 4096 | 1024 | 24 | 开 | 0.5 | 开 | 开 | 1 |
| ultra | 1.00 | 4 | 4096 | 2048 | 40 | 开 | 1.0 | 开 | 开 | 1 |
| test | 1.00 | 0 | 1024 | 256 | 10 | 开 | 0.5 | 开 | 关 | 0.4 |

**自动选档**（SL:4187 `function zy(`）：
- 移动设备 → low。
- 渲染器字符串匹配 `SwiftShader|llvmpipe|Software|Mali|Adreno|PowerVR`，或是 Intel 但不是 Arc → medium。
- 其他（包括 Apple M 系）→ high。

**动态分辨率**（SL:4740 `function z(ie)`）：
- 切档或启动后先等 3.5 s。之后每 45 帧或 900 ms 取一次平均帧时。
- 平均 > 21.5 ms 且 scale > 0.6 时降：平均 > 45 ms 直接降到 0.6；> 30 ms 降 0.2；否则降 0.1。每降一次，回升等待时间 `upDelay` 翻倍，上限 60 s。
- 平均 < 17.4 ms、scale < 1、且等待已过 → 升 0.1，下次至少等 2 s。
- 已在 scale 0.6 仍 > 26 ms，连续 2 次 → 自动降一档，scale 重置为 0.8。
- 对照：siege-wing 的规则是 2 s 窗口，> 1/48 s 降 0.08、> 1/32 s 降 0.15，< 1/57 s 持续 8 s 升 0.05；降了没用（CPU 瓶颈）就撤回并冷却 30–120 s（SW:src/main.js:44-65）。可以把"CPU 瓶颈撤回"这一条补进 Saltline 方案（本项目定）。

### 2.7 地面湿面与平面反射（长廊积水，对应目标 t2）

- 平面反射：渲染 `planar × 主分辨率`（宽对齐 16、高对齐 8）的 HalfFloat RT，开 mipmap；用斜裁剪近平面（oblique clip）。反射模糊用 mip LOD `log2(高 / 270)`。反射时隐藏武器层和指定物体。相机贴地（y < 0.03）时关闭（SL:5657 `uReflLod.value=Math.log2`，函数在 SL:5657 附近）。
- 积水：`puddle = smoothstep(0, 0.035, depth) * wet`，约 5 cm 过渡。粗糙度渐变：干 0.72–0.93 → 潮 0.36–0.56 → 湿透 0.1–0.2 → 水面 0.055（SL:5581，SL:5595 注释）。
- 雨点涟漪是稀疏随机环（SL:5490-5491）。地面直射高光夹到 40，防萤火虫像素（SL:5657 `min(reflectedLight.directSpecular, vec3(40.0))`）。
- 本关卡是沙漠，不下雨。长廊积水按"漏水积水"处理：保留积水、反射和粗糙度渐变，`rain = 0`，可留顶棚滴水涟漪（本项目定）。

---

## 3. 材质体系：让 Hi3D GLB 融入统一光照、不显塑料

### 3.1 原则（来自 Saltline 的做法）

1. **只有一种光照**：所有物体都是 `MeshStandardMaterial`，同一个太阳、同一套 PMREM 天空、同一套后处理 AO 和体积光。不给单个资产加专属灯。
2. **一个补丁管所有材质**：`onBeforeCompile` 替换 `map_fragment`、`roughnessmap_fragment`、`metalnessmap_fragment`、`normal_fragment_maps`、`aomap_fragment`（补丁 GLSL 在 SL:5295-5446，挂接函数 SL:5446 `function h3(i,e)`）。补丁注入四件事：
   - 世界空间宏观变化（albedo 和粗糙度两路）；
   - 缝隙污垢；
   - 朝上面的积湿（本项目改为积尘）、竖面条痕、贴地 0.5 m 溅湿带；
   - 高光抗锯齿。

   `customProgramCacheKey` 按变体分组，防止程序数量爆炸（SL:5449 `T.customProgramCacheKey=()=>Q`）。
3. **反"塑料感"靠粗糙度，不靠颜色**：粗糙度要有分层，要随宏观噪声起伏，湿区要变光滑，还要用法线图长度做高光抗锯齿（§3.4）。
4. **近景武器单独加微观细节**：程序擦痕、指纹污渍、机加工纹、雨滴凸点，用屏幕空间导数做 bump（SL:6027-6055 `uKind` 三类：阳极氧化 / 磷化 / 聚合物；挂接在 SL:6056 `function Bf(`）。

### 3.2 Hi3D GLB 处理管线（Blender 烘焙，`tools/blender/bake_lowpoly.py`）

Hi3D 的原始模型没有法线贴图，UV 碎成上千片，所以不能直接减面沿用原 UV。流程（步枪 v1 已实测跑通，63 秒，结果见 `out/review/bake_compare.jpg`）：

1. 导入高模，整体平滑着色；复制一份作低模。
2. 低模按位置焊接顶点（阈值 1e-6），消掉 UV 接缝造成的重复顶点。
3. Decimate（collapse）到目标面数（§3.6）。
4. 删除原 UV，Smart UV Project（角度 66°，岛间距 0.003）。
5. Cycles 从高模烘焙到低模（selected to active，cage 外扩 = 最长边 × 0.006，最大射线距离 × 0.012，margin 8 px）：
   - 法线（切线空间）
   - 底色（DIFFUSE，只取 COLOR）
   - 粗糙度
   - 金属度（把高模的金属度接到自发光后烘 EMIT）
6. **去光照与 PBR 校正**（§3.3），对烘焙出的底色和金属度做。
7. 自发光遮罩：按色相和亮度从底色里提取发光区（机器人面罩），另存一张遮罩。
8. 法线检查：扫描零长度和 NaN 法线，用面法线重算（旧项目多次黑屏的原因，SC 提交 a7a8738、ddaffb5）。
9. 导出 GLB；贴图用 npm 的 wasm 编码器转 **KTX2**：法线和 ORM 用 UASTC，底色用 ETC1S。
10. 蒙皮网格不做 quantize，并删除动画里的 `.scale` 轨道（GZ:references/packaging.md:47-51）；静态网格可以 quantize + meshopt。
11. 输出报告：面数前后、包围盒、贴图清单、MB 前后、albedo 亮度分位数、金属度直方图、零法线修复数、烘焙漏光像素数。

已知待修：第一版烘焙在锐边上有少量漏光斑点，靠调 cage 和射线距离、按硬边拆 UV 岛解决。

运行时归一化（SC:src/core/assets.js:52-69）：
- 最长轴缩放到 `MODELS` 表里的真实米数；X/Z 居中；最低点落到 y = 0。
- 朝向不预设为 +Z：武器按包围盒最长轴对齐；角色按左右髋骨确定朝向（GZ:references/assets.md:13）。
- 同一模型的多个实例要变色或闪白时，先 `cloneMaterials()`，因为 `clone()` 默认共享材质（SC:src/core/assets.js:84-98）。
- 蒙皮实例用 `SkeletonUtils.clone`（TS:threejs-loaders/SKILL.md:411-420）。

### 3.3 去光照与 PBR 校正（本项目定，需截图 A/B 验收）

Hi3D 等生成器常见三个问题：
- baseColor 里烘了明暗和 AO，在场景里会与真实阴影叠加，产生双重阴影、显得发脏；
- 粗糙度一片平均（约 0.5），显得像塑料；
- metalness 取中间值，物理上不成立。

处理分两层。

**源头**：概念图一律用"纯浅灰背景、柔和均匀棚拍光、无投影、无特效"（GZ:references/assets.md:9；SC:assets-src/manifest.json:2）。`target/t3-enemy.json` 的提示词已经这样写，武器、道具也照此出图。

**离线校正**，逐张贴图做：

| 通道 | 处理 | 验收 |
|---|---|---|
| baseColor | ① 只在 UV 岛内做大半径模糊，得到低频亮度 `Lb`。<br>② `albedo' = albedo * (mean(Lb) / Lb)^0.6`，压平烘焙明暗，保留材质本色差。<br>③ 夹线性亮度到 [0.02, 0.85] | 线性亮度 p5 ≥ 0.02，p95 ≤ 0.85。参考 Saltline 取值：沥青 sRGB 0.13（SL:4843 `L(0.13, 0.13, 0.135)`）、混凝土 0.53（SL:4869 `L(0.53, 0.52, 0.49)`），油漆约 0.3–0.6 |
| metalness | 二值化：`m' = smoothstep(0.35, 0.65, m)` | 中间值像素占比 < 5% |
| roughness | 不在离线改，运行时按材质类重映射（§3.4） | — |
| AO | 如果有 occlusion 通道就保留进 ORM.r。只作用于环境光，后处理 AO 会叠加 | — |
| normal | 8K 缩到 2K 时，用法线长度做 Toksvig 式高光抗锯齿（运行时，§3.4） | — |

### 3.4 运行时统一材质补丁（移植 SL `h3`）

每个 GLB 材质加载后都 `applyPatch(mat, classParams)`。两组 uniform（SL:5290 材质表，`Nt(` 定义）：
- `uSlWetP = (darken, roughMul, streak, bead)`：湿区压暗、湿区粗糙度系数、竖面条痕强度、水珠。
- `uSlMacro = (albedoVar, roughVar, freq, grime)`：宏观 albedo 变化、宏观粗糙度变化、噪声频率（1/米）、污垢。

着色器逻辑（SL:5295-5446）：

```glsl
// 宏观：两层世界空间值噪声
slMac  = n3(worldPos * freq);
slMac2 = n3(worldPos * freq * 3.7 + 11.3);
float m = slMac*0.65 + slMac2*0.35 - 0.5;
albedo *= 1.0 + albedoVar * m * 2.0;                                           // L5353
float grime = smoothstep(0.5, 0.85, slMac*0.6 + slMac2*0.4 + (1.0 - ao)*0.3) * grimeAmt;
albedo *= 1.0 - grime * 0.35;                                                  // 缝隙和凹处更脏

// 朝上面积存（Saltline 是雨湿；本项目在户外改为积尘，在长廊地面保持湿）
up   = smoothstep(0.15, 0.85, worldN.y);                                       // L5360
expo = smoothstep(-0.4, -0.05, worldN.y);                                      // 朝下的面不积
low  = smoothstep(0.5, 0.0, worldPos.y) * (1.0 - up) * expo;                   // 贴地 0.5 m 溅湿/积尘带，L5371

// 粗糙度
rough = roughness * orm.g + roughVar * ((slMac2 - 0.5)*1.4 + (slMac - 0.5)*0.8);
rough = mix(rough, rough * roughMul, wetK);                                    // L5418
rough = mix(rough, 0.05, bead);
// 高光抗锯齿：法线图长度变短说明这一像素内法线发散
rough = sqrt(rough*rough + clamp(1.0 - length(nrmTex*2.0 - 1.0), 0.0, 1.0) * 0.6); // L5423
rough = clamp(rough, 0.045, 1.0);                                              // L5425

// 湿区：饱和度略升、albedo 压暗、法线变平
albedo  = mix(vec3(luma), albedo, 1.0 + 0.5 * wetK * darken);
albedo *= 1.0 - darken * wetK;                                                 // L5401
normalXY *= 1.0 - 0.45 * wetK * up;                                            // L5443
```

**积尘变体**（本项目定，替代户外雨湿）：
- `dustK = up * dustAmt * (0.6 + 0.4 * slMac)`
- `albedo = mix(albedo, dustColor, dustK * 0.7)`，dustColor 取目标图沙色，线性约 `(0.42, 0.33, 0.24)` 起调
- `rough = mix(rough, 0.9, dustK)`
- 法线 xy 乘 `(1 - 0.5 dustK)`

**材质类参数**：直接沿用 Saltline 的取值（SL:5290）：
- `Nt` 默认值：`wet = [0.42, 0.38, 0.5, 0]`，`macro = [0.14, 0.1, 0.8, 0.2]`。
- 油漆：`wet = [0.05, 0.62, 0.65, 0.7]`，`macro = [0.2, 0.16, 0.4, 0.45]`。
- 金属：`wet = [0, 0.7, 0.55, 0.5]`。
- 锈：`wet = [0.3, 0.6, 0.55, 0]`。
- 混凝土：`macro = [0.22, 0.12, 0.35, 0.35]`；脏混凝土 `macro = [0.3, 0.15, 0.35, 0.9]`。
- 枪械和聚合物：`macro = [0.06–0.08, 0.05–0.06, 6, 0]`，即高频、低幅。
- 布料：`wet = [0.3, 0.7, 0.6, 0]`，`macro = [0.08, 0.04, 8, 0]`。

Hi3D 资产按"主材质类"贴标签，标签写进 `MODELS` 表。

**粗糙度目标区间**：运行时用 `rough = clamp(r * a + b)` 重映射，让每类落进下表区间。

| 材质类 | 区间 | 出处 |
|---|---|---|
| 沥青 / 地面干 | 0.72–0.93 | SL:5595；SL:4851 `mix(0.93, 0.74, ...)` |
| 混凝土 | 约 0.82 ± 0.1 | SL:4877 `float r = 0.82 + ...` |
| 环氧地坪 | 0.10–0.52（磨损越重越粗） | SL:4917 `mix(0.1, 0.52, worn)` |
| 阳极氧化黑（枪身） | 0.40，金属度 0.45 | SL:6061 `pac9_anodised`：`roughness:.4,metalness:.45` |
| 磷化钢 | 0.50，金属度 0.7 | SL:6061 `pac9_phosphate` |
| 聚合物 | 0.62，金属度 0 | SL:6061 `pac9_polymer` |
| 哑光件 | 0.92 | SL:6061 `pac9_matte` |
| 锈蚀钢、剥落漆 | 0.75–0.95（本项目定） | — |
| 积水 | 0.055 | SL:5595 |

**武器微观细节**（SL:6027-6055，移植到 Hi3D 步枪的材质上）：
- 粗糙度扰动：`±0.20` 低频、`±0.10` 中频、`±0.08` 2400/m 细频；擦痕 +0.18；污渍 −0.12。
- 最终 `clamp(0.10, 1.0)`。
- 朝上面的水珠（本项目可关）。
- 物体空间噪声，所以开火晃动时细节跟着枪走。

### 3.5 减面、压缩与显存

| 项 | 值 | 依据 |
|---|---|---|
| 8K RGBA 一张显存 | 约 358 MB（含 mip） | TS:threejs-performance/SKILL.md:187-198 |
| 2K RGBA（WebP 解码后） | 约 22 MB | 同上 |
| 2K KTX2（ASTC 4×4 或 BC7，8 bpp） | 约 5.3 MB（含 mip） | 按格式计算 |
| 规则 | 运行时禁止出现原始 8K。上限：武器 4096，其余 2048 / 1024 / 512 | — |
| 显存总预算 | 贴图 ≤ 1.0 GB（本项目定）。用 `renderer.info.memory` 加自记账核对；Saltline 也有 `textureMB` 自记账（SL:5449 `textureMB:`） | — |

### 3.6 面数与贴图预算（按资产类）

| 资产 | 原始 | 运行面数 | baseColor / normal / ORM | 依据 |
|---|---|---|---|---|
| 步枪（视图模型） | ~2M / 8K | ≤ 150k | 4096 / 4096 / 2048 | 常驻画面右下约 40%（见目标图）；可参照的英雄资产是 siege-wing 直升机 76.7k（SW:tools/blender/heli_verify.txt:72）。本项目定 |
| 手臂（视图模型） | — | ≤ 40k | 2048 / 2048 / 1024 | 本项目定 |
| 人形机器人敌人 LOD0 | ~2M / 8K | ≤ 60k | 2048 / 2048 / 1024 | 旧项目角色级 90k（SC:tools/fetch-asset.sh:8-14）；同屏最多 9 个（§6.1 `maxAlive`）。本项目定 |
| 敌人 LOD1（> 25 m） | — | ≤ 15k | 共用贴图 | siege-wing 士兵 LOD 比约 10:1（SW `soldiers_stats.json`） |
| 大型场景件（储罐、管廊、钢架） | ~2M / 8K | 60–120k | 2048 / 2048 / 1024 | 旧项目城门、钟楼 110k（SC:tools/fetch-asset.sh） |
| 中型道具（掩体、油桶组） | — | 8–30k | 1024 | 本项目定 |
| 小道具 | — | 5–8k | 512–1024 | GZ:references/assets.md:10 |
| 地面 | 不用 Hi3D | 平面 + 平铺 PBR（Poly Haven CC0） | 2048 平铺 | GZ:references/assets.md:18；Saltline 地面是程序着色器 |
| 碰撞 | 不用渲染网格 | 手摆 AABB 盒 | — | SL:5449 `addBox(_,M,E={})`；SL:4187 `function By(` 按材质合并静态网格 |

**同屏总量**：≤ 1.5M 三角形，≤ 450 draw call（主画面加阴影一共）。这是 M5 Pro 1080p 实测过的预算（SC:docs/CONTRACTS.md:18-20）。

---

## 4. 武器：第一人称视图模型

### 4.1 渲染

| 项 | 值 | 出处 |
|---|---|---|
| 层 | 武器整棵子树 `layers.set(1)`，挂在世界相机下（`camera.add(root)`） | SL:6061 `e.traverse(Me=>{Me.layers.set(zc)}),i.camera.add(e)` |
| 相机 | 独立 `PerspectiveCamera(54°, near 0.01, far 10)`，每帧拷贝世界相机的 matrixWorld | SL:4187 `viewFov:54`；SL:4740 `function C(){` |
| 深度 | 同一个 HDR 目标；画武器时 `gl.depthRange(0, 0.05)`。好处：永远不穿墙、仍写深度、后处理靠 `d < 0.05` 识别武器 | SL:4740 `s.depthRange(0,.05)` |
| 环境光 | 画武器时 `environmentIntensity *= 1.35`；在室内用室内探针 | SL:4740 `viewFill\|\|1.35` |
| 阴影 | 不投、只收；`frustumCulled = false` | SL:6061 `function o(Me,we)` 内 |
| 枪口世界坐标 | 两个相机 FOV 不同，要换算：先在武器局部坐标求位置，xy 乘 `tan(fov/2) / tan(viewFov/2)`，再变到世界相机空间。曳光、闪光、弹壳都从换算后的点发出 | SL:6061 `function Pe(Me,we)` |
| 设置项 | 世界 FOV 可调 55–100，默认 74；视图模型 FOV 固定 | SL:5935 `setFov(F){C.baseFov=Zn(+F\|\|Pi.fov,55,100)`；SL:6083 `fov:Pi.fov` |

**Hi3D 步枪的资产要求**：
- 在 Blender 或 gltf-transform 里加空节点 `Muzzle`、`Eject`、`MagWell`、`Sight`（命名习惯参照 SW `Muzzle/FlareL/Missile_L1`，SW:tools/blender/heli_verify.txt）。
- 弹匣、枪机拆成独立节点。
- 原点放在握把。
- 按真实长度归一化（参照 Saltline 枪口在 z = −0.531 m，SL:5935 `mi={name:"PAC-9 Longshore",muzzle:[0,0,-.531]`）。
- `sightY` 写进武器表，即瞄具中心到原点的高度（Saltline 是 0.069 m）。

### 4.2 姿态

都在武器相机空间，单位米和弧度（SL:6061 `eu={p:[.118,-.122,-.275]`）。

| 姿态 | p | r |
|---|---|---|
| 腰射 hip | (0.118, −0.122, −0.275) | (0.034, 0.085, −0.03) |
| 开镜 ADS | (0, −sightY, −0.135) | (0, 0, 0) |
| 冲刺叠加 | (−0.035, +0.004, +0.03) | (−0.04, 0.62, 0.26) |
| 换弹叠加 | (−0.03, +0.10, −0.02) | (0.46, 0.22, −0.80) |

目标图里枪更大、更靠右下。用 §9 对照目标图微调 hip 的 p，r 不动。

### 4.3 弹簧

所有瞬时动作都用弹簧：`v += ((target - x)*k - v*c) * dt`，8 ms 子步（SL:6061 `function ma(`；参数在 `kZ:pa(520,30)` 处）。

| 弹簧 | k | c | 用途 |
|---|---|---|---|
| kZ | 520 | 30 | 后坐向后 |
| kP | 380 | 26 | 后坐上扬 |
| kY | 300 | 22 | 后坐偏航 |
| kR | 300 | 20 | 后坐滚转 |
| swY / swP | 110 | 15 | 视角拖拽晃动 |
| jY / jP | 140 | 13 | 起跳、落地 |
| bump | 600 | 30 | 换弹撞击（卸弹匣 −0.25、装弹匣 +0.55、拍击 +0.4、拉机柄 +0.3） |

### 4.4 晃动（SL:6061 函数 `Xe` 末段）

**行走摆动**
- 相位速率：`5.2 + 1.55 × 速度`。
- 幅度：`bobAmt = smooth(speed/3.6, 速率 8)`，再乘 `(ADS ? 0.12 : 1) × (1 + 1.4 × 冲刺)`。
- 位移：x = `sin φ × 0.006`；y = `sin 2φ × 0.0042 − ((0.5 + 0.5 cos(2φ + 0.6))^4) × 0.0048`。
- 旋转：pitch `+ sin(2φ + 0.5) × 0.008`；yaw `+ sin φ × 0.01`；roll `+ sin φ × 0.014`。

**呼吸**（ADS 时乘 0.3）
- x `sin(0.85t + 1) × 0.0012`；y `sin(1.7t) × 0.0016`。
- 旋转：pitch `sin(1.7t + 0.8) × 0.0035`；yaw `sin(0.6t) × 0.002`；roll `sin(0.5t) × 0.004`。

**视角拖拽**
- 本帧鼠标增量夹到 ±0.2；yaw 弹簧速度 `+= dx × 3.2`，pitch 弹簧速度 `+= dy × 2.6`；ADS 时乘 0.4。
- 结果夹到 ±0.09（yaw）和 ±0.07（pitch）。
- 位置也跟着动：x `− swY × 0.06`，y `+ swP × 0.05`；roll 再加 `swY × 0.7`。

**移动倾斜**：x `− strafe × 0.004`，roll `− strafe × 0.035`，z `+ forward × 0.004`；ADS 时都乘 0。

**跳跃**
- 起跳时 jY 速度 −0.22，jP 速度 +0.7。
- 空中目标：jY = `clamp(−vy × 0.0045, −0.02, 0.024)`，jP = `clamp(vy × 0.012, ±0.06)`。
- 落地冲量 `I = clamp(−vy × 0.06, 0, 0.6)`：jY −I，jP −3.2I，kR 随机 ±I。

**检视**：静止 24 s 后自动做一次 3.5 s 的检视动作；任何输入都会打断（SL:6061 `k.idleT>24`）。

**扳机手指**：在两套网格之间做顶点插值，速率 30（SL:6061 `function z(Me)`）。用 Hi3D 手臂时改为手指骨骼旋转。

### 4.5 射击、散布、后坐

**基础参数**（SL:6061 `Gv=30,B_=150,O_=720,H_=26,V_=300`）

| 项 | 值 |
|---|---|
| 射速 | 720 RPM，冷却 `60/720 s`；每帧最多补 3 发，保证低帧率下射速不掉 |
| 伤害 | 26；弱点 ×2.2（SL:5935 `c.part==="weak"?2.2:1`） |
| 射程 | 300 m |
| 弹匣 / 备弹 | 30 / 150 |
| 判定 | 先射线打环境求距离，再在这个距离内测敌人碰撞体（SL:5935 `playerShot(n,s,`） |

**散布**（锥半角，弧度），平滑速率 18：

```
spread = lerp(0.0125, 0.0012, ads)                              // 腰射 / 开镜底值
       + clamp(speed/6) * lerp(0.013, 0.004, ads)               // 移动
       + bloom * lerp(0.0065, 0.0022, ads)                      // 连射扩散；每发 +0.17，上限 1，每秒衰减 1.5
       + (空中 ? 0.022 : 0)
       - (蹲 ? 0.002 * (1 - ads) : 0)
```

散布方向：均匀角度，半径 `tan(spread) × sqrt(rand)`。

**镜头后坐**（玩家侧，SL:5935 `recoilKeep:.35`）

每发：
- `bt = lerp(1, 0.55, ads) × (蹲 ? 0.85 : 1)`
- 上扬 `0.0068 × (第 1–9 发 ? 1 : 0.38) × bt × (0.85…1.15)`
- 偏航：前 3 发随机 ±0.0011；之后 `sin(n × 0.57 + 随机相位) × 0.0042 + ±0.001`，乘 bt
- 连射计数在停火 0.24 s 后清零，并重新随机相位

后坐在玩家侧的分配：
- 35% 直接永久加到视角（`recoilKeep`）；
- 65% 进可回复偏移，夹到 ±0.3（pitch）、±0.2（yaw）；
- 以速率 34 追上偏移；停火 0.09 s 后以速率 6.5 回正。

**武器侧（视觉）**：kZ 速度 `+= 1.5 × lerp(1, 0.6, ads)`，kP `+= 1.5 bt`，kY `+= ±0.5 bt`，kR `+= ±0.9 bt`；z 位移取 `kZ × 0.55`。

**震屏**：每发 `addShake(0.12 × bt)`。

**过热**：每发 heat +0.05（上限 1.3），每秒衰减 0.2。停火 0.11 s 时若 heat > 0.4，枪口冒烟 `min(1.6, heat × 1.3)` 秒，每 0.085 s 一团（size `0.1 + 0.06 × smoke`，life 1.3，alpha 0.22）。

**空仓**：`weapon:dry` 事件，bump −0.08；0.32 s 后自动换弹。

### 4.6 开镜（ADS）

- 线性进度 0.18 s 走完，经五次 smootherstep `t³(t(6t − 15) + 10)` 得到 `adsE`（SL:6061 `k.adsLin+(Os?Me:-Me)/.18`）。
- 冲刺进度 ≥ 0.35 或换弹中，禁止开镜。
- 世界 FOV：`lerp(base + (冲刺 ? 6 : 0), 52, ads)`。过渡中 FOV 平滑速率 30，过渡外 7（SL:5935 `fovSprint:6,fovAds:52`）。
- 视角灵敏度 ×0.6（`adsLook`）；移动速度上限 2.4 m/s。
- 后处理：周边模糊 0.75，暗角 +0.22（§2.4）。
- 枪口闪光缩放 ×0.62。

### 4.7 换弹时间线

单位秒，见 SL:6061 `me=.47,ee=1.345` 与姿态关键帧数组 `$=[[0,G],[.1,G],[.36,N]...`。

| 事件 | 战术换弹（2.1 s） | 空仓换弹（2.72 s） |
|---|---|---|
| 左手离开护木 | 0.10 | 同 |
| 卸弹匣 `magout`（音效 + bump −0.25） | 0.47 | 同 |
| 新弹匣可见 | 0.86 | 同 |
| 装弹匣 `magin`（音效 + bump +0.55，弹药入账） | 1.345 | 同 |
| 拍击 | 1.50（bump +0.4） | 同 |
| 手到拉机柄 | — | 1.96–2.02 |
| 拉机柄行程 | — | 2.02 → 2.14 → 2.19 释放（`bolt` 事件，bump +0.3，kZ −0.5） |
| 回到握持 | 2.02 → 2.1 | 2.36 → 2.66 |

- 左手是关键帧插值：位置 lerp，旋转 slerp，权重是五次 smootherstep。
- 弹匣在卸下和装上之间跟着左手走。
- 换弹叠加权重 `min(ease(t/0.3), 1 − ease((t − (T − 0.46))/0.4))`。
- 空仓换弹还有拉机柄权重：在 1.62 s 后缓入，roll +0.62，pitch −0.16。
- 枪机：射击时做 72 ms 正弦往返；空仓后锁在 0.86 行程。

### 4.8 枪口火焰、光、烟

**几何**（SL:5981 `function N_()`；着色器 SL:5982-6012）：一个加色混合网格，由 5 类面片组成：
1. 正面花瓣：两层 0.26 m 方片。瓣数分两组，3–5 瓣和 5–8 瓣，`pow(|cos|, 5 和 14)`。
2. 侧喷：两张正交片，半宽 0.065，长 0.34，高斯截面并带扰动。
3. 侧口喷流：0.34 × 0.1 片，强度 `uJet ∈ [0.6, 1.2]`。
4. 白热核心：`exp(−5r²) × 2.4`，色 `(1, 0.82, 0.58)`。
5. 枪口热发光：`uHeat = clamp((heat − 0.45)/0.8) × 2.2`，色 `(1, 0.28, 0.06)`。

基础色 `(1, 0.50, 0.16)`，高强度处趋向 `(1, 0.90, 0.70)`。

**每发参数**：
- 持续 `0.036 + rand × 0.02` s。
- 强度 `9.5 × sqrt(剩余/总时长)`。
- 随机种子；绕 z 轴转 ±0.2 rad。
- 缩放 `(0.8–1.3) × lerp(1, 0.62, ads)`，z 方向再乘 0.8–1.3。
- `renderOrder = 10`，`depthWrite = false`。

**枪口光**：点光池 `flash(muzzle, 0xFFB060, 45, 9 m, 0.05 s)`（SL:6061 `lightPool.flash(We,16756832,45,9,.05)`）。

**世界版火焰**（敌人或第三人称用，SL:5935 `function j(ee,B,P={})`）：
- 4 个加色精灵：34× / 22× / 22× / 白，尺寸 0.13–1.15 m。
- 一条拉伸前向闪。
- 3 颗火星，速度 8–22 m/s。
- 一团烟。
- 点光 `0xFFB060, 16 × scale, 7 m, 0.05 s`。

### 4.9 弹壳

参数见 SL:5935 `var Z1=class` 与 SL:6061 `xe.set(2+ae()*1.2`。

| 项 | 值 |
|---|---|
| 实例池 | 60 发，一个 InstancedMesh（车削几何，黄铜材质），不投影 |
| 初速（相机空间） | x 2.0–3.2，y 1.2–2.0，z −0.1–0.5，再加玩家速度 |
| 角速度 | 初始 (±20, ±10, ±20) rad/s，每次弹跳重新随机 (±25, ±15, ±25) |
| 重力 | 9.81 |
| 地面 | 生成时向下射线求地面高度和表面材质 |
| 弹跳 | `vy = −vy × (0.32–0.48)`；水平 `× 0.6 + ±0.3` |
| 停止 | `vy > −0.9` 或已弹 4 次，躺平随机朝向；8 s 强制停止 |
| 音效 | 只在前 2 次弹跳触发 `shell:bounce`（按表面切换音色），同类 40 ms 内去重 |
| 消失 | 静止 4 s 后 0.7 s 内缩小消失 |

### 4.10 曳光、命中、贴花

**曳光**：池 48；速度 260 m/s；宽 0.024 m；强度 16；色 `(1, 0.8, 0.46)`。每 70 ms 最多在弹道前 7 m 内留 5 团轻烟（SL:5935 `function G(ee,B,P={})`）。

**命中效果（按表面）**（SL:5935 `function C(ee,B,P,V,Y)`）
- 距离 > 55 m 时粒子数减半。
- **金属**：18 火星（6–24 m/s，带拉伸）；2–4 块热碎；2 个闪光精灵；2 团烟；近距离加碎屑；贴花 `bullet_metal`。
- **混凝土（默认）**：粉尘喷射；2–4 碎块；4 颗高速碎屑（3–9 m/s）；30% 概率加火星；贴花。
- **木**：木屑 3–7；贴花。
- **玻璃**：12 颗亮片（2.6 倍亮度）；碎块；贴花。
- **泥土 / 橡胶**：5 团土烟 + 碎土；`soot` 贴花。
- **水**：5 根水柱 + 2 团雾 + 14 滴 + 2 个涟漪环。
- **敌人**：13 火星 + 2 热碎 + 闪光精灵；点光 `0xFFB060, 8, 4.5 m, 0.05 s`（最多每 90 ms 一次）；2 团暗烟；35% 概率掉红色碎屑。目标图 t2 正是"机器人中弹火花迸溅"。

**贴花**：池 160；超出时最旧的 14 个渐隐（`Yb = 14`）。尺寸（米）：`metal 0.25 / concrete 0.34 / wood 0.24 / glass 0.3 / soot 0.3 / scorch 2.4`（SL:5935 `bullet_metal:.25,bullet_concrete:.34`）。旧项目经验：贴花用 `polygonOffset + depthWrite:false`，在水面上要 `DoubleSide`（SC 提交 17ca7c5）。

**粒子系统**（SL:5935 `$b=1400,Zb=3200`）
- 受光粒子池 1400：带自阴影近似、太阳与天光环境项、拖曳、风、湍流，按距离排序。
- 加色粒子池 3000：不排序。
- 曳光 48、碎块 256、弹壳 60、贴花 160。
- 整个 fx 共 5 个 draw call。
- 特效原则（GZ:references/vfx-ui-audio.md:9-12）：节奏是"蓄力 → 爆发 → 残留消散"，热核软边，不要"一张贴图贴在面片上"。

**爆炸**（敌人自爆或场景爆炸，SL:5935 `function K(ee,B=1)`）
- 两盏点光：`0xFFE0B0 320s / 10 + 9s m / 0.08 s` 和 `0xFF8A30 55s / 8 + 6s / 0.45 s`。
- 火球 `13 + 5s` 团；火星 `34s` 颗（上限 90）；烟 `11 + 5s` 团；余烬 `10s`。
- 贴地时加冲击环 `12 + 3s` 和焦痕 `2.3s` m。
- 广播 `explosion` 事件，驱动震屏和听觉闷化。

### 4.11 手臂

Saltline 的手和手套是代码生成的刚性网格，手指姿势用关节角数组（SL:6061 `Vv({mirror:!1,fingers:[null,[.62,1.72,.8,0]...`），右手握把、左手护木。

本项目：两只固定握姿的手套手（Hi3D 各生成一件），作为刚体挂在握把和护木节点上，不绑骨、不做手指动画。换弹时左手带着弹匣按 §4.7 的时间线走"手目标点轨迹"。退路：只露袖口。

---

## 5. 移动与手感

### 5.1 移动

所有数值来自 SL:5935 的 `Mt = {...}` 与 SL:4187 的 `Pi = {...}`。

| 参数 | 值 |
|---|---|
| 走 / 冲刺 / 蹲 / 开镜上限 | 3.8 / 6.4 / 1.9 / 2.4 m/s |
| 后退 | ×0.82（按后退输入量插值） |
| 地面加速 / 减速 | 34 / 26 m/s²（向目标速度做定长逼近） |
| 空中加速 | 9 m/s²；空中无输入时以 0.6 m/s² 缓慢减速 |
| 冲刺条件 | 前进输入 > 0.55、横移 < 0.6、未蹲、ads < 0.35、未开火、当前速度 > 走速 × 0.6；空中保持冲刺状态 |
| 重力 | 21 m/s² |
| 跳跃 | 顶点高 1.0 m → 起跳速度 `sqrt(2 × 21 × 1) = 6.48 m/s` |
| 土狼时间 / 跳跃缓冲 | 0.12 s / 0.13 s |
| 胶囊 | 半径 0.32；站高 1.8；蹲高 1.15 |
| 眼高 | 站 1.68，蹲 1.05；平滑速率 11 |
| 起身检查 | 头顶空间不够就保持蹲姿 |
| 摔落伤害 | 落地速度 > 13 m/s 时 `(v − 13) × 7` |
| 生命 | 100；受伤 4 s 后以 25/s 回复 |
| 俯仰限制 | ±1.5 rad |
| 鼠标 | 0.0021 rad/px × 灵敏度；单帧 \|movementX\| 或 \|movementY\| > 400 视为尖峰丢弃（SL:5935 `Math.abs(V)>400`）；ADS ×0.6 |
| 越界救援 | 掉出关卡回到最近安全点，扣 12 血，转 180° |

### 5.2 镜头

**脚步摆动**：步长 走 1.55 m / 冲刺 2.1 m / 蹲 1.05 m。每跨过一整步发 `player:step`（带表面类型）。
- y = `−cos(2πh) × 0.024 × A`；x = `sin(πh) × 0.013 × A`。
- `A = clamp(speed/3.8) × (冲刺 ? 1.9 : 1) × lerp(1, 0.22, ads) × (蹲 ? 0.7 : 1)`，以速率 9 平滑。
- roll 叠加 `x × 0.35`。

**横移滚转**：`−横向速度 / 6.4 × 0.02 × lerp(1, 0.4, ads)`，速率 8。

**落地下沉**：空中超过 0.12 s 才算落地事件。
- 弹簧 k = 150、c = 17；冲量 `min(落地速度 × 0.36, 3.2)`；位移夹到 −0.20 … +0.05 m。
- 镜头 pitch 加 `dip × 0.12`。
- 落地速度 > 7.5 m/s 时再震屏 `min(0.5, (v − 7.5) × 0.06)`。

**震屏（trauma 模型）**
- `trauma ∈ [0, 1]`，每秒衰减 1.7；输出强度 `trauma²`。
- 三轴：pitch `0.03 × (sin 43.1t + 0.6 sin(71.7t + 1.3))`；yaw `0.03 × (sin(37.3t + 2.1) + 0.6 sin 83.9t)`；roll `0.045 × (sin(29.7t + 0.7) + 0.5 sin(61.3t + 4))` rad（SL:5935 `shakePitch:.03`）。
- 来源：
  - 每发 0.12 bt；
  - 受伤 `0.22 + 伤害/70`；
  - 爆炸 `clamp(1 − d/(14 + 10 size)) × (0.35 + 0.35 size)`；
  - 重落地见上。
- 对照：siege-wing 用和式正弦，`phase += dt × 38`（SW:src/heli.js:479-481）。

**FOV**：基础 74；冲刺 +6；ADS → 52（§4.6）。

**死亡镜头**：0.85 s 内眼高降到 0.22 m，roll 1.15，pitch 先抬后落（SL:5935 `function K(F)`）。

### 5.3 打击反馈

| 反馈 | 值 | 出处 |
|---|---|---|
| 命中标记 | 普通：0 → 35% 时从 1.15 倍缩到 1，然后淡出，240 ms。<br>弱点或击杀：起始 1.5 倍；击杀 420 ms。<br>CSS 类名 `hit / weak / kill`，用不同颜色区分 | SL:6083 `duration:k==="kill"?420:240` |
| 击杀播报 | `<b>类型</b> destroyed`，弱点击杀追加 "Weak point"；保留 4.2 s，最多 4 条 | SL:6083 `feed(k){` |
| 准星 | 4 段线，间距 `tan(spread)/tan(fov/2) × (H/2) + 4 px`；冲刺 +10；夹 4–70 px，按 0.5 px 取整；ADS 超过 0.6 时隐藏 | SL:6083 `Math.tan(we)/Math.tan(be)*(F/2)+4` |
| 受伤 | 后处理 `damage += 0.35 + 伤害/40`（上限 1），每秒衰减 1.9；`lowHealth = smoothstep(0.55, 0.12, hp/max)`，速率 4。见 §2.4 的红边、饱和、色差 | SL:5935 `w=Math.min(1,w+.35+F/40)` |
| 受伤方向 | HUD 方向弧（`player:hit` 带 `fromPos`） | SL:6083 `i.events.on("player:hit"` |
| 弹药 | 逐发格子；剩余 ≤ 27% 显示 "Low ammo" | SL:6083 `dt<=Math.ceil(Ne*.27)` |
| 听觉 | 受伤 ≥ 6 时耳鸣（1.8 s 冷却）；爆炸和受伤触发闷化低通（§7） | SL:5935 `ear_ring` |
| 命中音 | 敌人命中音，弱点音高 ×1.25 | SL:5935 `impact_enemy` |
| 顿帧 | Saltline 没有。FPS 不做全局顿帧（会显黏，GZ:references/combat-feel.md:10）。可选：只让被击杀的敌人定格 0.06 s 再进入死亡动作（本项目定，默认关） | — |

### 5.4 输入健壮性

规则来自 GZ:references/pitfalls.md:13-19 与 SL:5935 输入模块。

- 指针锁定：失败时回退到拖拽模式（`pointerlockerror`）；请求锁定后 `focus({ preventScroll: true })`；解锁时清空鼠标按键和 fire/ads 状态。
- 按键丢失：窗口 `blur` / `focus` / `visibilitychange` / `pagehide` 以及 Cmd/Alt/Ctrl 按下或松开时清空按键集合；**不要把 Shift 列为修饰键**，它是冲刺。
- F3 调试面板：显示当前按住的键、状态、速度、最后 8 个键盘事件（GZ:references/pitfalls.md:18）。

---

## 6. 敌人 AI 与动画

### 6.1 Saltline 的做法（照搬 AI 层）

**感知**（SL:6083 `think(T,D,C){`；参数在 SL:6061 `Ui={gull:Zv`）
- 每 0.11–0.19 s 检测一次（错开相位）。
- 视距 45 m，视锥 200°；3.5 m 内无视朝向；已交战时也无视朝向。都要通过视线射线。
- 看见：`seeT += dt`，`lastKnown = 玩家位置`，`exposure += dt × 0.1`。
- 看不见：`seeT −= dt × 0.6`，`exposure −= dt × 0.45`。
- 状态机：`patrol → investigate/search → engage`。
  - 进入 engage：巡逻时 `seeT > C`，其他状态 `seeT > 0.45C`。C 值：地面机器人 0.55，飞行器 0.4。进入时发 `enemy:alert`，并把 18 m 内的同伴拉去调查。
  - engage 中失去视线 4 s → search，持续 `8 + rand(3)` s → 回 patrol，并把巡逻原点改为当前位置。
- 被打：没在交战的进入 investigate（10 s），并拉 20 m 内同伴（`provoke`）。
- 听觉半径 45 m（枪声），见 `Ui.hearRadius`。

**攻击令牌**：同时开火的最多 2 个（人多时 3 个），令牌间隔 1.25 s。要开火必须先 `requestToken`；进入非交战状态时释放（SL:6061 `maxTokens:2`）。GZ:references/combat-feel.md:27 也要求"同一时间只一个近身攻击者，其余绕圈"。

**地面型（hound → 本项目的人形机器人）参数**（SL:6061 `hp:140,shotDamage:5`）

| 项 | 值 |
|---|---|
| hp | 140；弱点（头）半径 0.155 m，伤害 ×2.2。我方 26 伤害约 6 发打身体，约 3 发爆头 |
| 射击 | 每轮 4 发，每发 5 伤害，间隔 0.11 s；轮间冷却 1.8–3 s |
| 预警 | 0.5 s（镜头 / 传感器发光 + 预警音，音高 `0.55/时长`） |
| 散布 | 远 0.12，近 0.045 |
| 速度 | 奔跑 4.5，潜行 2，巡逻 1.5 m/s；加速度 7；转向 2.5 rad/s |
| 理想距离 | 8–18 m |
| 近战 | 3 m 内扑击：蓄力 0.28 s，15 伤害，冷却 3.5 s，冲刺速度 9.5 |
| 寻路 | 每 0.6 s 重新规划（0.5 m 网格 A*）；航点到达半径 0.55 m；朝向偏差 > 1.1 rad 时原地转身 |

**开火站位打分**（SL:6061 `function w(){`；分数越低越好）

候选点 = 关卡掩体点（−2 分优先）+ 玩家周围 7 个随机可走点 + 以玩家为中心、在当前方位 ±1.3 rad 弧上取 5 个点。

```
score = 到自己的距离 × 0.9 + 优先级 + rand(0..3)
      + 与其他交战同伴相对玩家的方向夹角余弦 > 0.86 时 +14 × (cos − 0.86)/0.14   // 不扎堆
      + 与同伴站位 < 3 m 时 +16
      + 站位到玩家眼睛没有视线时 +22
      （距离不在 8–18 m 内，或不可走的点直接剔除）
```

**行为流程**：move → aim（站定后转向玩家，偏差 < 0.14 rad 且拿到令牌）→ tele（预警）→ burst → cool。
- 玩家走出原站位 7 m，或距离 < rangeMin − 3 → 重新选点。
- 移动超过 7 s 强制开打。

**飞行型（gull 无人机）参数**（SL:6061 `hp:45,boltDamage:7`）：
- hp 45；能量弹每发 7 伤害，速度 70 m/s，每轮 3 发，间隔 0.12 s。
- 预警 0.55 s，冷却 1.9–3.3 s。
- 理想距离 12–25 m，高度 4–8 m。
- 速度上限 8 m/s，巡逻 3 m/s，加速度 11。
- 散布 远 0.065 / 近 0.018；最大射程 42 m。
- 死亡时爆炸：半径 3 m，30 伤害。

本项目第二种敌人可以直接用这套参数。

**波次**（SL:6190 `waves:[{gull:3,hound:1}`）
- 开场巡逻：2 架无人机 + 1 个机器人。
- 三波：(3, 1)、(3, 2)、(4, 3)。
- 同时存活上限 9；生成间隔 0.85 s；生成点距玩家 ≥ 18 m。
- 追击补员：每 7 s 检查一次，存活 < 4 时补，最多补 5。

**对象池**：无人机 10，机器人 8，能量弹 32，残骸 5（`Ui.poolGulls / poolHounds / maxBolts / maxWrecks`）。

### 6.2 Saltline 的动画做法

全部程序化，不用 AnimationMixer。
- **骨架**：代码建骨架（`class iu`），每个部件只绑一根骨骼，权重为 1，即刚性蒙皮（SL:6061 `u[p*4]=r.i,h[p*4]=1`）。机械体用刚性蒙皮不会出现装甲"橡皮化"。
- **腿**：三段腿解析 IK（外展 / 髋 / 膝，`function q_(`）。脚步按落点规划交替抬放，脚步发 `enemy:step` 事件。
- **受击**：在机体上打弹簧冲量。sL、sR、sP、sY 分别是侧移、滚转、俯仰、下沉。强度 `Q = min(1.6, 伤害/28)`，弱点时俯仰再 ×1.6。没有受击动画剪辑。
- **死亡**（`function q(T)`）：
  - 随机侧滚 `±(0.25–0.55)` rad，俯仰 ±0.125；
  - 四只脚向外滑开 0.16–0.36 m，机体塌下；
  - 头部位置放 16 颗火星 + 4 块碎片；
  - 发 `enemy:killed`；
  - 残骸保留，超过 5 个时最旧的以 0.22 m/s 下沉 3.2 s 后回收。
- **持续音**：每个敌人一个循环音（伺服 / 旋翼），用 HRTF 定位（§7）。

### 6.3 siege-wing 的做法（参照）

- 2200 名士兵：动画烘焙成骨骼矩阵浮点纹理（11 个剪辑，15 fps，16 根骨），顶点着色器做蒙皮和 2 剪辑混合，每个士兵有哈希出的个体差异。每种类型和 LOD 一次 instanced draw（SW:src/crowd.js:11-40,142-143）。
- 死亡没有布娃娃：给速度"抛出去"，落地后播 `Die` 剪辑（SW:src/crowd.js:239-260）。
- 威胁有明确预警：号角 2.4 s 后放箭；弩车瞄准时光斑逐渐变大，1.05 s 锁定提前量（SW:src/threats.js:118-151）。
- 导演层：语音优先级队列加音乐状态机（SW:src/director.js:23,106-167,203-211）。

### 6.4 本项目规格：外部绑骨人形机器人

**资产**
- `t3-enemy` 概念图 → Hi3D 生成网格 → 烘焙到 60k / 15k（§3.2）→ 绑骨：首选 Hi3D Agent 的 `rig-retarget` skill，退路是本机 `rig_character.py`。不用任何竞品工具。
- 机器人是一整块融合网格，不能按连通块分。按骨骼分区做刚性蒙皮：每个区域权重 1 绑一根骨骼，关节处留窄过渡带。
- 动画用 mesh2motion 的 CC0 人形库（本机已有）。它只有手枪持握，步枪的左手用 IK 贴到护木。
- 武器挂右手 socket，换弹或收枪时 reparent（GZ:references/characters-animation.md:33）。

**导入归一化**（GZ:references/characters-animation.md:4-12）
- 回绑定姿势，量包围盒，脚贴地；从大腿骨求朝向；记录骨骼静止变换。
- 每个剪辑单独测朝向偏移（有的剪辑和绑定姿势差 90°）。
- 根运动在模型空间把水平分量钉回静止位置，保留竖直起伏，不要直接清零根骨位移轨道。

**剪辑清单**：
- idle_combat、walk、run、strafe_L/R、walk_back、crouch_aim、fire（上身）、reload；
- hit_front / back / left / right（加性）、flinch_heavy；
- death_front / back / left / right；
- 蓄力、扑击（近战）。

**混合**（TS:threejs-animation/SKILL.md:120-185,349-373,415-423,487）
- 每个根一个 mixer；剪辑在 mixer 之间共享；只更新可见或 40 m 内的 mixer，远处半频更新（本项目定）。
- 移动混合：idle / walk / run 按速度用 `setEffectiveWeight` 线性分配，横移按速度方向混合。
- 状态切换 `crossFadeTo` 0.2 s；进入射击 0.12 s。
- 上身瞄准：`mixer.update` 之后程序化旋转 spine 和 neck 的 yaw/pitch。yaw 夹 ±60°，pitch 夹 ±40°，三根脊椎骨按 0.3 / 0.3 / 0.4 分配。
- 受击（两层叠加）：
  1. 移植 SL 弹簧冲量：在 spine_02 和 head 上加弹簧旋转，强度 `min(1.6, 伤害/28)`，弱点 ×1.6，弹簧 k 300、c 20（本项目定，量级取自武器弹簧）。
  2. 伤害 ≥ 40 或累计硬直时，播 `makeClipAdditive` 后的 hit 剪辑，权重 1、单次。
- 死亡：
  - 按受击方向选 death 剪辑，`LoopOnce` + `clampWhenFinished`，从当前姿势 0.08 s 进入。
  - 姿势差太大时（比如从扑击中死亡），先 0.15 s 程序化塌落，再接剪辑；0.1 s 交叉淡入会"折叠"（GZ:references/characters-animation.md:29）。
- **不做物理布娃娃，改做"解体"**：刚性分区本来就是一块块的，击杀时让 3–5 块（头、肩甲、前臂、胸甲）脱离骨骼变成独立碎件，按子弹方向给初速，只做抛物线和地面碰撞，不引入物理引擎。其余部分照下面的做法塌落：
  - 死亡剪辑加上沿子弹方向的根位移冲量（0.3–0.8 m/s，0.4 s 衰减）；
  - 塌落后保留尸体，最多 5 具，第 6 具出现时最旧的下沉回收（SL 规则）；
  - 死亡瞬间头部或胸口火花 16 颗 + 碎片 4 块 + 短促电弧光 `0x9FD8FF, 6, 3 m, 0.15 s`（颜色和光参数本项目定）。

**命中判定**：不对蒙皮网格做射线（太贵），用跟随骨骼的解析碰撞体（SL 也是球和胶囊，`function sM(`、`function nM(`）。
- 头：球，半径 0.13，`part:'weak'`。
- 躯干：胶囊，半径 0.22。
- 上臂和前臂、大腿和小腿：胶囊，半径 0.07–0.10。

每帧在 `mixer.update` 之后从骨骼世界矩阵更新。移动过的 SkinnedMesh 要重算包围球，或设足够大的固定包围球（SL:6061 `c.boundingSphere=new Dn(...,s)`）。

**AI**：照搬 §6.1，人形机器人就是"hound"那一套（去掉扑击换成枪托近战也可以）。
- 预警的视觉：面罩橙色传感器亮度从 1 升到 6，持续预警时长，同时出预警音。
- 掩体点：关卡数据里手标 `coverPoints`，每个掩体两侧各标一个。

**LOD**：25 m 外切 LOD1，40 m 外 mixer 半频，60 m 外不投影（本项目定）。

---

## 7. 音频

### 7.1 架构（照抄 SL:5935 `function u_(`）

```
                 ┌ world(1.0) ─┐                    ┌──────────── 主链 ──────────────────────┐
各 voice ─panner→├ near(0.95) ─┤→ 闷化低通 S → z(暂停静音) → A(1) → 压缩器 → ×0.45 → 软削波 → ×0.9(主音量) → out
                 ├ amb(0.55) ──┘                ↑
                 ├ dry(1.0) ────────────────────┘ (不进低通，不进混响)
                 └ music(0.62) → O(避让) → A
混响送：world ×0.9 + near ×0.32 → q ┬→ U(1 − 0.9·室内度) → 卷积器(ir_outdoor) → ×0.75 → S
                                     └→ T(室内度)       → 卷积器(ir_shed)    → ×0.95 → S
       music ×0.2 → 室内卷积器
```

| 节点 | 参数 | 出处 |
|---|---|---|
| 压缩器 | 阈值 −10 dB，knee 6，比率 6，攻击 2 ms，释放 140 ms | SL:5935 `_.threshold.value=-10` |
| 软削波 | 输入 ×2 映射；\|x\| ≤ 0.6 线性，以上 `0.6 + 0.4 tanh((x − 0.6)/0.4)`；`oversample = '2x'` | 同上 |
| 闷化低通 | `f = 20000 × 0.03^Z`，Z 是闷化量。受伤 `Z = max(Z, clamp(伤害/40, 0.2, 0.7))`；爆炸 `clamp(1 − (d − 5)/10, 0, 0.8)`；死亡 1；随后回落 | SL:5935 `S.frequency.value=2e4*Math.pow(.03,pi(Z,0,1))` |
| 室内度 | 相机在室内盒中为 1，以速率 3 平滑；控制两路混响和 rain/rain_interior 的交叉淡化 | SL:5935 `U.gain.value=1-.9*P,T.gain.value=P` |
| 音乐避让 | 开火时 J 降到 0.55，爆炸降到 0.4，以速率 3.5 回到 1 | SL:5935 `J=Math.min(J,.55)` |

**声部池**：world 22 个（每个带 panner）、near 12、dry 8、music 3。

**抢占规则**：同名声音数量 ≥ max 时抢最老的同名；否则用空闲声部；否则抢优先级 ≤ 自己的里面最低、最老的。被抢的声部 4 ms 淡出，25 ms 后停止。

**Panner**：`equalpower`；`distanceModel = 'inverse'`；`refDistance = 3`、`rolloffFactor = 0.6`、`maxDistance = 400`。每个声音可以覆盖 ref 和 roll（例：爆炸 12 / 0.5，弹壳 2 / 1）。只有敌人的持续音（伺服、旋翼）用 HRTF（SL:5935 `he.panningModel=te?"HRTF":"equalpower"`）。

**混响脉冲**（离线生成，SL:5935 `function Q8`、`function eC`）
- 户外：1.4 s；6 个早期反射（62 / 89 / 118 / 151 / 178 / 243 ms，增益 0.55 → 0.10），左右声道错开 −4% / +7%；噪声尾 1.3 s，高通 300，低通 6000 → 900，衰减 τ 0.27 s。
- 室内：2.2 s；早期反射 18–139 ms；两段尾音（低通 5200 → 650，τ 0.33；低通 260 的低频隆隆，τ 0.4）。
- siege-wing 的户外脉冲：2.4 s，衰减 `exp(−t/0.55)`，每声道 4 个回声（110–740 ms），回送前高通 140 Hz（SW:src/audio.js:651-663,860-861）。

**自动播放**：首次 `pointerdown` 或 `keydown` 时 `resume()`，此前请求的循环音排队等待（SC:src/audio/audio.js:15,23,29-31）。

### 7.2 变体与随机

- 每个声音有 n 个变体，轮流取，n > 2 时有 30% 概率跳过一个（SL:5935 `Pe[te]=((Pe[te]||0)+1+(pe.n>2&&s()<.3?1:0))%pe.n`）。
- 音高抖动默认 ±3.5%：枪声 ±1.2%，命中 ±7%，跳弹 ±12%，掠过声 ±10%。音量随机 −0 到 −8%。
- 限频：同类命中 22 ms、弹壳 40 ms、警报 120 ms 内去重；跳弹在金属上 24%、混凝土上 7% 的概率，间隔 ≥ 220 ms。
- 掠过声（whiz）：敌方弹道离听者 < 3.2 m 时，在最近点播放，增益 `clamp(1.15 − d/3.5, 0.3, 1)`，间隔 ≥ 90 ms。
- siege-wing 的做法：默认音高 ±3%，随机不重复上一个变体；全局上限 44 声部，满了就抢旧的那一半里最安静的（SW:src/audio.js:797,826,1107,1142-1146）。

### 7.3 枪声分层

Saltline 的枪声是合成的（SL:5935 `function KR(`）。本项目改用 CC0 采样，每类 ≥ 3 个变体（GZ:references/assets.md:39），但分层结构照抄：
- 主枪声 0.32 s：12 ms 高通 2600 的爆裂 + 中频噪声 + 160 → 45 Hz 的正弦扫频冲击 + 220 ms 低频噪声体 + 35 ms 后两次机械咔哒。4 个变体，音高系数 `[1, 0.955, 1.045, 0.985]`，亮度系数 `[1, 1.12, 0.9, 1.05]`。
- 尾音分户外和室内两份（SL:5935 `function QR`、`function e8`）：
  - 户外 1.55 s，5 个拍击回声（58–262 ms）；
  - 室内 2.3 s，有 54 / 81 / 117 / 163 / 228 Hz 的房间模态，外加 44–51 ms 间隔的颤动回声。
- 按室内度 P 交叉播放：`tail_out × (1 − P)`，`tail_in × P`。连射时距上次尾音 > 0.28 s 才再触发尾音（SL:5935 `function fo(te)`、`te-R>.28&&fo(1)`）。

### 7.4 音量比例

各声音的 peak 是离线归一化目标（SL:5935 `Go` 表）；播放时增益来自事件处理。

| 类 | peak / 播放增益 | 总线 |
|---|---|---|
| 主枪声 | 0.97 / 1.0 | near |
| 枪声尾音 | 0.5–0.62 / 1.0 | dry |
| 空仓、换弹 | 0.5–0.8 | near |
| 脚步 | 0.45–0.5 / 走 0.55、冲刺 0.8 | near |
| 落地 | 0.7 / `0.35 + v/10` | near |
| 弹壳 | 0.3 / 0.8–1 | world（ref 2） |
| 命中环境 | 0.7 / 我方 0.9、敌方 0.8 | world（ref 4） |
| 命中敌人 | 0.75 / 0.85，弱点 1.0 | world（ref 5） |
| 敌人开火 | 0.85–0.95 / 1.0 | world（ref 7–8） |
| 敌人预警 / 警报 | 0.42 / 0.5 | world |
| 敌人死亡 | 0.85–0.9 | world |
| 爆炸 | 0.97 / `0.6 + 0.25 size` | world（ref 12） |
| 受伤 | 0.85 / `0.5 + 伤害/40` | dry |
| 环境循环（风、远景） | 0.5 | amb 0.55 |
| 音乐 | 0.45–0.7 | music 0.62，再经避让 |
| UI | 0.3 / 悬停 0.12 | dry |

- guizang 的经验值：配乐约为音效的 1/3（GZ:references/vfx-ui-audio.md:44）。上表 music 0.62 × peak 0.45–0.7，相对枪声 0.97，正好落在约 1/3。
- siege-wing 的母带目标：单次音效峰值 −1 dBFS，循环 −22 dBFS RMS，音乐 −16 LUFS，48 kHz Ogg（SW:tools/audio_gen/gen.py:18,334）。本项目的采样按这个标准预处理；人声先把峰值归一到 −2 dB，再切静音（GZ:references/assets.md:30）。

### 7.5 自检

Saltline 有离线自检：用 OfflineAudioContext 渲一段完整混音，统计 peak、超限样本数、NaN、各段 RMS dB（SL:5935 `startRendering`）。本项目照做，并放进 §9 的自动检查清单。旧项目的教训：从来没有人认真听过混音（SC:docs/POLISH.md:23），所以音频验收里要有一项"人工试听"。

---

## 8. 性能预算（M 系 Mac 浏览器 60 fps）

| 项 | 预算 | 依据 |
|---|---|---|
| 帧率 | high 档在 M1 Pro 及以上、1080p 窗口：avg ≥ 60，p99 ≤ 25 ms；交战最差 ≥ 45 fps。M1/M2 基础款以 medium 达标 | SC:docs/CONTRACTS.md:18（M5 Pro 1080p 60 fps，战斗最低 45）；p99 指标来自 SL:6190 bench。本项目定 |
| 动态分辨率触发线 | 21.5 ms 降，17.4 ms 升，最低 0.6 | SL:4740 |
| draw call | 主画面 ≤ 300，阴影 ≤ 150，合计 ≤ 450 | SC:docs/CONTRACTS.md:18-20 |
| 三角形 | 同屏 ≤ 1.5M（含阴影 pass 另计 ≤ 1.0M） | 同上；阴影部分本项目定 |
| 内部渲染像素 | high ≤ 2.3M，ultra ≤ 3.7M | SL:4740 |
| 贴图显存 | ≤ 1.0 GB；单张 ≤ 4096，只有武器可以用到 4096 | §3.5 |
| 着色器程序 | ≤ 60；补丁变体用 `customProgramCacheKey` 收敛 | SL:5449；`__stats().programs` |
| GPU 时间分配（high，估算，以实测为准） | 阴影 1.5 ms（隔帧摊薄）/ 世界 6 / 武器 1 / depthHalf + AO 0.8 / 体积光 1.5 / 合成 0.4 / 运动模糊 0.4 / 泛光 + 横条 0.8 / 调色 + final 0.6，合计约 13 ms | 本项目定 |
| 首帧 | 首帧 ≤ 1 s；可玩 ≤ 10 s（本地） | GZ:references/packaging.md:31-45 实测约 1 s 和 10 s |
| CPU | 主循环不分配新对象；射线检测用显式列表、不递归；静态物体 `matrixAutoUpdate = false` | TS:threejs-performance/SKILL.md:252-282 |

降低开销的手段（全部有出处）：
- 静态环境按材质合并网格，按簇合并，避免整片一起被剔除（SL:4187 `function By(`；TS:threejs-performance/SKILL.md:117-135）。
- 重复 10 次以上的东西用 InstancedMesh（SC:docs/CONTRACTS.md:19）。
- 粒子池每池一次 draw（SL fx 共 5 次）。
- 阴影隔帧更新；远处敌人不投影。
- 透明的 DoubleSide 物体会画两遍，用 `forceSinglePass`。场景里只要出现 transmission 材质，就会把所有不透明物体重画一遍，所以禁止使用 transmission（TS:threejs-performance/SKILL.md:115）。
- 不在运行时切换 `transparent`、`side`、贴图有无；不增删灯；不开关 `castShadow`（会触发重编译，TS:threejs-performance/SKILL.md:303-314,374；TS:threejs-lighting/SKILL.md:394）。
- 标签页隐藏时停循环；处理 `webglcontextlost`；没有 WebGL2 时给出提示（GZ:references/packaging.md:63）。
- 降级顺序：分辨率 → 阴影 → 泛光 → 植被（GZ:references/packaging.md:63）。本项目对应：动态分辨率 → 降档（AO 关、体积光步数减、阴影 2048）。

---

## 9. 质量验收

### 9.1 目标图闭环（dream-loop）

**目标图**：`target/t1-courtyard.png`（庭院，逆光体积光）、`target/t2-corridor.png`（长廊，开火、积水、火花）。它们都是"实机截图"式的目标，不是概念画（DL:SKILL.md:29-40）。

**机位复现**：为每张目标图记录 `?shot=1&cam=...&fov=...&noweapon=0`，再加一个"开火冻结"开关，用来复现 t2 的枪口火焰和弹壳。办法是加 `?freeze=fire@0.02`，用 `weapon.debug.flash / freeze` 冻结在第 N 帧（Saltline 已经有 `debug: {freeze, reloadT, flash, noFire}` 钩子，SL:6061 `ce={freeze:!1,reloadT:null,empty:!1,flash:!1,noFire:!1}`）。

**每轮流程**（DL:references/pro-mode/workflow.md:8-15）：实现 → 自测 → 截图 → 盲评 → 修**全部**问题 → 自测 → 检查退出条件。

**盲评**（DL:references/pro-mode/workflow.md:23-39）
- 每轮新开一个干净上下文的评审子代理。只给三样：本轮截图、目标图、上一轮截图和评语。
- 评分（满分 10）：
  - 构图 0–3：机位、取景、主要元素的位置与比例；
  - 光照 0–3：色板、曝光、阴影、对比、大气、反射与辉光；
  - 材质 0–3：纹理、粗糙度、半透、湿润；不能块状、塑料、发假；
  - 细节 0–1。
- 允许小数分。必须列出可执行的全部差距；"看着假"这种评语不收，要指出原因和改法。退步要扣分。

**退出条件**（DL:references/pro-mode/workflow.md:43-47）
- ≥ 8 分且帧率达标 → 交给用户看。
- ≥ 8 分但帧率不达标 → 先做无损优化，再复评。
- 连续 2 轮最高分没涨满 1 分，或同一差距连续被点名 2 次 → 停止微调，做架构级重想（资产、布光、机位）。
- 重想后仍无效 → 停下来问用户。

**并排对照图**：`node tools/compare.mjs out.png "target" a.png "ours" b.png`，每格 1280×720（SC:tools/compare.mjs，SC:docs/BIBLE.md:3-4）。

### 9.2 guizang 的过程纪律

- 每一阶段都以"用户能看到的东西"收尾：截图、陈列页或试玩（GZ:SKILL.md:20-31）。
- TODO 里把"已验证"和"只是没报错"分开写（GZ:SKILL.md:33）。
- 数字比截图可信：先读状态数值，再看截图；截图可能是旧的（GZ:SKILL.md:75-77；GZ:references/pitfalls.md:33-35）。
- 隐藏标签页不渲染，测试要手动步进帧；用游戏时间，不用 `setTimeout`；测试时静音（GZ:references/pitfalls.md:33-36）。
- 汇报分三栏：已验证 / 只是无报错 / 需要用户确认（GZ:SKILL.md:84-89）。

### 9.3 自动检查脚本清单（`tools/`）

| 脚本 | 检查内容 | 通过条件 | 来源 |
|---|---|---|---|
| `shot.mjs` | Playwright 驱动系统 Chrome，参数 `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`，1920×1080；等 `__ready`，再等 2 个 RAF 后截图；收集控制台错误和警告；输出 `__stats()` | `__errors` 为空；`__fatal` 为 null | SC:tools/shot.mjs:17-28；SL:6190 |
| `gpuinfo.mjs` | 确认无头浏览器不是软件渲染（SwiftShader） | 渲染器串含 "Apple" | SC:tools/gpuinfo.mjs |
| `bench.mjs` | 跑 `?bench` 30 s，读 avg / median / p99、分辨率、`calls`、`tris` | 满足 §8 预算 | SL:6190 `function eP` |
| `perf-combat.mjs` | 脚本化交战：满波敌人，持续开火，记录 fps、p95、calls、tris | 交战 ≥ 45 fps | SC:tools/perf-combat.mjs |
| `check-assets.mjs` | 对 `public/models/*.glb` 做 inspect：面数、贴图尺寸和格式（KTX2）、颜色空间（baseColor 是 sRGB，其余线性）、零 / NaN 法线、包围盒与 `MODELS` 表尺寸偏差 < 5%、蒙皮模型没有被量化、albedo 亮度 p5/p95、metalness 中间值占比 | 全部符合 §3.3 和 §3.6 | 本项目定；参照 TS:threejs-asset-pipeline/SKILL.md:15-17、SW:tools/blender/heli_verify.py |
| `shader-guard` | 启动时统计 `onShaderError` 次数；自写着色器末尾加 `isnan / isinf` 兜底 | 0 次编译错误；画面无黑块 | SL:4740；SC 提交 ddaffb5 |
| `nan-probe` | 读回 1×1 自适应亮度（`readAdapt()`），检查 lum 是有限值 | 有限且在 0.002–40 之间 | SL:4740 `function Z(){` |
| `audio-check.mjs` | 用 OfflineAudioContext 渲染 10 s 交战混音 | peak ≤ 0.99、NaN = 0、超限样本 = 0 | SL:5935 `startRendering` |
| `viewmodel-clip` | 贴墙站立并转一圈，截 8 张图 | 武器不穿墙；AO 和体积光不作用于武器 | 本项目定 |
| `stuck-scan` | 关卡网格扫描：每个可走点向 8 个方向走几十帧，记录卡住点 | 0 个卡点 | GZ:references/combat-feel.md:47 |
| `showcase-shots` | 对每个模块的 `?show=` 截图存档，比对前后两版 | 人眼确认，不自动判定 | SL:6190 `gM` |

---

## 10. 旧项目踩坑：必须避免的事

来源：sunken-city 的 docs、提交记录，以及 guizang 的 pitfalls。

1. **色调映射只做一次**：渲染器 `NoToneMapping`，后处理负责；材质里不做 tone map，也不做 gamma。陈列页如果不走后处理，就在渲染器上开 AgX，二选一，不能两个都开（SC:docs/CONTRACTS.md:14-15；SC:src/gallery.js:14）。
2. **不用 pmndrs postprocessing**：它忽略 `toneMappingExposure`，旧项目只好额外加一个曝光 pass（SC:src/core/renderer.js:8-22）。本项目自写后处理，移除 `postprocessing` 和 `n8ao` 两个依赖。
3. **NaN 黑屏**：一个 NaN 像素经过泛光会扩散成整屏黑。所有 `normalize`、`pow` 都要防退化输入；自写着色器末尾加 `if (any(isnan(col)) || any(isinf(col)))` 兜底；简化后的网格修复零法线（SC 提交 a7a8738、9dec78b、ddaffb5；SC:docs/POLISH.md:12）。
4. **量化坑**：quantize 后顶点是归一化的 int16。代码要按米改写顶点时先拷成 Float32；蒙皮网格不量化（SC 提交 be65b1e；GZ:references/packaging.md:47-51）。
5. **生成模型的尺寸、原点、朝向都是任意的**：一律按表归一化；量测锚点（枪口、抛壳口、瞄具、角色眼高）要从真实模型上测，不用占位数（SC:src/core/assets.js:52-69；SC:tools/hull-profile.mjs）。
6. **生成模型多出的部件**：例如旧项目船上自带的钟。用着色器丢弃盒或在 Blender 里删掉，再用代码件替换（SC:src/game/damage.js:72-100）。武器概念图里不要画瞄具光点、枪口火焰（GZ:references/assets.md:9：特效会被建模成实体面片）。
7. **共享材质**：`clone()` 共享材质，单体染色或闪白前要先克隆材质（SC:src/core/assets.js:84-98）。
8. **着色器编译卡顿**：所有隐藏物体在启动时临时显示，`compileAsync` 后再隐藏；后处理 pass 一开始就全部创建、默认 `enabled = false`，后加的 pass 深度附件会是空的（SC 提交 0564ef3、25012ee、db511ce）。
9. **灯光太亮**：第一版的自发光和点光几乎一定过曝，旧项目把眼灯从 45 降到 12、闪光从 9 降到 4（SC 提交 be65b1e）。预期要调 2–3 轮亮度（GZ:references/vfx-ui-audio.md:22）。
10. **逆光剪影**：要有对侧补光或足够的环境光（SC:src/world/environment.js:32-35）。
11. **dt 上限**：上限设成 1/20 时，低帧率下游戏时间会变慢；旧项目改成 1/10（SC 提交 f41f908）。本项目取 0.1，物理和弹簧另做子步（§1.4）。
12. **确定性**：用种子随机数和 dt，不用 `Date.now()` 或 `Math.random()` 驱动玩法；录屏、截图时锁定游戏时间（SC:docs/CONTRACTS.md:21-22；SC 提交 398458b）。
13. **透明贴花**：`polygonOffset`、`depthWrite: false`；贴在水面上要 `DoubleSide`（SC 提交 17ca7c5）。
14. **WebP 不省显存**：解码后是完整的 RGBA8，显存要靠 KTX2 省（§3.5）。
15. **音频自动播放**：首个手势后 `resume`；测试时 `?mute=1` 加 `--mute-audio`（SC:src/audio/audio.js:15；SC 提交 3c1a3b1）。
16. **陈旧标签页**：开发时提供 `/version.json` 并提示刷新（SC:vite.config.js:5-19）。
17. **验收靠截图**：没有截图或测试，就不说"可以了"（SC:docs/CONTRACTS.md:23-25；GZ:references/pitfalls.md:40-42）。
18. **输入**：按键会丢失松开事件；修一个按键问题时加的"保险"常常造成新问题，输入处理只做最少的事（GZ:SKILL.md 七个翻车点第 6 条；GZ:references/pitfalls.md:13-19）。
19. **依赖外网**：不从 CDN 加载库，three 和解码器全部本地化（GZ:references/pitfalls.md:7）。Saltline 从 Google Fonts 加载字体，本项目把字体也放到本地。
20. **打包要早做**：中期就把生产构建和体积检查跑通（GZ:SKILL.md 七个翻车点第 7 条）。
21. **r186+ API**：`HDRLoader`、`PCFShadowMap`、`Timer`、`environmentIntensity`；`setDecoderConfig` 和 `detectSupportAsync` 已弃用（SC:docs/CONTRACTS.md:11-13；TS:threejs-asset-pipeline/SKILL.md:231-232）。
22. **不在帧循环里查 window 焦点**：嵌入式浏览器里不可靠（GZ:references/pitfalls.md:17）。

---

## 附录

实施先后、过关条件和需要拍板的事项都在 `PLAN.md`。
