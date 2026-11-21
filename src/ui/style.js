// SANDLINE interface language (concept board C, "HAZARD"): heavy condensed type, signal orange and bone white
// on near-black plates, hazard stripes used sparingly, stencil numerals, part-number microtext, crop marks.
// Everything is sized in rem; the root font size follows the viewport (16px at 1080p).
import '@fontsource/big-shoulders-display/700';
import '@fontsource/big-shoulders-display/800';
import '@fontsource/big-shoulders-display/900';
import '@fontsource/big-shoulders-stencil-display/800';
import '@fontsource/barlow-condensed/500';
import '@fontsource/barlow-condensed/600';
import '@fontsource/barlow-condensed/700';
import '@fontsource/jetbrains-mono/500';

export const CSS = `
:root{--o:#ff6a14;--o2:#ff8f45;--bone:#efe5cf;--bone2:rgba(239,229,207,.55);--ink:rgba(10,8,6,.8);--ink2:rgba(10,8,6,.5);--haz:#f2be12;--red:#ff3b2b;--cy:#62f1ff;
  --H:'Big Shoulders Display',Impact,sans-serif;--N:'Big Shoulders Stencil Display','Big Shoulders Display',Impact,sans-serif;--B:'Barlow Condensed','Arial Narrow',sans-serif;--M:'JetBrains Mono',ui-monospace,monospace;
  --ease:cubic-bezier(.2,.9,.1,1)}
#hud,#ui{font-family:var(--B);color:var(--bone);user-select:none;-webkit-font-smoothing:antialiased}
#hud{position:fixed;inset:0;pointer-events:none;overflow:hidden}
#ui{position:fixed;inset:0;pointer-events:none}
.hz{background:repeating-linear-gradient(-45deg,var(--haz) 0 .42rem,#0d0b09 .42rem .84rem)}
.mono{font-family:var(--M);font-weight:500;font-size:.6rem;letter-spacing:.06em;color:var(--bone2)}
.plate{background:var(--ink);border:1px solid rgba(239,229,207,.75)}
.kc{display:inline-block;min-width:1.25rem;padding:.05rem .32rem;margin-right:.35rem;border:1px solid var(--bone);font-family:var(--B);font-weight:700;font-size:.78rem;line-height:1.1rem;text-align:center;color:var(--bone);background:rgba(10,8,6,.55)}

/* ---------- boot-in: every HUD part powers on with a wipe and a flicker ---------- */
#hud .pw{opacity:0}
#hud.live .pw{animation:pw .55s var(--d,0s) both}
@keyframes pw{0%{opacity:0;clip-path:inset(0 100% 0 0)}35%{opacity:1;clip-path:inset(0 35% 0 0)}42%{opacity:.15}48%{opacity:1}60%{opacity:.5}66%{opacity:1;clip-path:inset(0 0 0 0)}100%{opacity:1;clip-path:inset(0 0 0 0)}}
#hud.glitch{animation:gl .32s steps(2) both}
@keyframes gl{0%{transform:translate(0)}20%{transform:translate(-.5rem,.1rem);clip-path:polygon(0 0,100% 0,100% 18%,0 18%,0 24%,100% 24%,100% 61%,0 61%,0 70%,100% 70%,100% 100%,0 100%)}40%{transform:translate(.6rem,-.1rem)}60%{transform:translate(-.2rem,0);clip-path:polygon(0 0,100% 0,100% 40%,0 40%,0 47%,100% 47%,100% 100%,0 100%)}100%{transform:translate(0);clip-path:none;filter:none}}

/* ---------- HUD v2: edge-hugging, transparent, orange only as accent; solid fills only for alerts ---------- */
#hud .sh0{text-shadow:0 1px 2px rgba(0,0,0,.85),0 0 .6rem rgba(0,0,0,.45)}
/* objective (top-left) */
#hud .obj{position:absolute;left:2.4rem;top:2.1rem;min-width:19rem;padding:.55rem 1.6rem .6rem .9rem;border-left:3px solid var(--o);background:linear-gradient(90deg,rgba(10,8,6,.55),rgba(10,8,6,0))}
#hud .obj .act{display:flex;align-items:center;gap:.55rem;font-family:var(--H);font-weight:800;font-size:.95rem;letter-spacing:.12em}
#hud .obj .act b{background:var(--o);color:#0d0b09;padding:0 .4rem;line-height:1.15rem;font-weight:900}
#hud .obj .act span{color:var(--bone2)}
#hud .obj .ln{display:flex;align-items:center;gap:.6rem;margin-top:.35rem;font-family:var(--H);font-weight:900;font-size:1.75rem;line-height:2rem;letter-spacing:.015em}
#hud .obj .ln .dm{width:.7rem;height:.7rem;border:2px solid var(--o);transform:rotate(45deg);flex:none}
#hud .obj .ln .ct{font-family:var(--N);color:var(--o);font-size:1.6rem;margin-left:.3rem}
#hud .obj .ln.flash{animation:objF .9s var(--ease)}
@keyframes objF{0%{opacity:0;transform:translateX(-1rem);clip-path:inset(0 100% 0 0)}40%{opacity:1;clip-path:inset(0 0 0 0);color:var(--o)}100%{transform:none;color:var(--bone)}}
#hud .obj .sub{margin-top:.3rem;font-family:var(--B);font-weight:600;font-size:1rem;letter-spacing:.08em;display:none}
#hud .obj .sub .pb{height:.25rem;background:rgba(239,229,207,.18);margin-top:.25rem;width:14rem}#hud .obj .sub .pb i{display:block;height:100%;width:0;background:var(--o)}
#hud .obj .ho{margin-top:.3rem;font-family:var(--B);font-weight:600;font-size:.95rem;letter-spacing:.14em;color:var(--bone2)}#hud .obj .ho em{font-style:normal;font-family:var(--N);color:var(--bone);font-size:1.15rem;margin-left:.35rem}

/* compass (top-centre) */
#hud .cmp{position:absolute;left:50%;top:1.5rem;width:44rem;margin-left:-22rem;height:5.4rem}
#hud .cmp .win{position:absolute;left:0;right:0;top:.9rem;height:2rem;overflow:hidden;-webkit-mask:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent);mask:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)}
#hud .cmp .strip{position:absolute;left:0;top:0;height:100%;will-change:transform}
#hud .cmp .strip i{position:absolute;bottom:0;width:1.5px;margin-left:-.75px;background:var(--bone);height:.4rem;opacity:.6;box-shadow:0 0 2px rgba(0,0,0,.9)}
#hud .cmp .strip i.m{height:.7rem;opacity:.95}
#hud .cmp .strip b{position:absolute;top:.1rem;width:3rem;margin-left:-1.5rem;text-align:center;font-family:var(--H);font-weight:800;font-size:.95rem;line-height:1rem;opacity:.85;text-shadow:0 0 .35rem rgba(0,0,0,.95),0 1px 1px rgba(0,0,0,.9)}
#hud .cmp .strip b.c{font-size:1.3rem;opacity:1}
#hud .cmp .base{position:absolute;left:14%;right:14%;top:2.9rem;height:1px;background:var(--bone);opacity:.5}
#hud .cmp .hd{position:absolute;left:50%;top:-.25rem;transform:translateX(-50%);color:var(--o);font-family:var(--N);font-size:1.25rem;line-height:1.3rem;padding:0 .4rem;white-space:nowrap;text-shadow:0 0 .4rem rgba(0,0,0,.9)}
#hud .cmp .hd:after{content:'';position:absolute;left:50%;bottom:-.4rem;margin-left:-.35rem;border:.35rem solid transparent;border-top-color:var(--o);border-bottom:0}
#hud .cmp .mk{position:absolute;top:3.15rem;left:0;width:0;will-change:transform;transition:opacity .2s}
#hud .cmp .mk .d{position:absolute;left:-.62rem;top:0;width:1.24rem;height:1.24rem;transform:rotate(45deg);background:var(--o);box-shadow:0 0 .6rem rgba(255,106,20,.6)}
#hud .cmp .mk .l{position:absolute;left:-.62rem;top:0;width:1.24rem;text-align:center;font-family:var(--H);font-weight:900;font-size:.85rem;line-height:1.24rem;color:#0d0b09}
#hud .cmp .mk .r{position:absolute;left:-2.5rem;top:1.45rem;width:5rem;text-align:center;font-family:var(--N);font-size:1.05rem;color:var(--o);text-shadow:0 0 .35rem rgba(0,0,0,.95)}
#hud .cmp .mk.boss .d{background:var(--red);box-shadow:0 0 1rem rgba(255,59,43,.9);width:1.7rem;height:1.7rem;left:-.85rem;top:-.2rem}
#hud .cmp .mk.boss .l{width:1.7rem;left:-.85rem;line-height:1.3rem;color:#fff}#hud .cmp .mk.boss .r{color:var(--red)}
#hud .cmp .mk.ext .d{background:var(--bone)}#hud .cmp .mk.ext .r{color:var(--bone)}
#hud .cmp .mk.edge{opacity:.75}
#hud .cmp .en{position:absolute;top:1.95rem;left:0;width:0;height:0;border-left:.32rem solid transparent;border-right:.32rem solid transparent;border-top:.55rem solid var(--red);margin-left:-.32rem;will-change:transform}

/* world objective marker */
#hud .wmk{position:absolute;left:0;top:0;width:0;height:0;opacity:0;will-change:transform;transition:opacity .25s}
#hud .wmk.ctr .r{opacity:0}
#hud .wmk .d{position:absolute;left:-.8rem;top:-.8rem;width:1.6rem;height:1.6rem;transform:rotate(45deg);border:2px solid var(--o);background:rgba(255,106,20,.18);box-shadow:0 0 .8rem rgba(255,106,20,.5)}
#hud .wmk .l{position:absolute;left:-.8rem;top:-.8rem;width:1.6rem;text-align:center;line-height:1.6rem;font-family:var(--H);font-weight:900;font-size:1rem;color:var(--bone)}
#hud .wmk .r{position:absolute;left:-5rem;top:1.25rem;width:10rem;text-align:center;font-family:var(--H);font-weight:800;font-size:.95rem;letter-spacing:.06em;text-shadow:0 0 .35rem #000,0 0 .15rem #000,0 1px 1px #000}
#hud .wmk .r>*{background:rgba(10,8,6,.62);padding:.05rem .35rem}
#hud .wmk .r em{font-style:normal;font-family:var(--N);color:var(--o);font-size:1.1rem;margin-left:.3rem}
#hud .wmk.boss .d{border-color:var(--red);background:rgba(255,59,43,.25)}#hud .wmk.boss .r em{color:var(--red)}
#hud .wmk.ext .d{border-color:var(--bone)}
#hud .wmk.pulse .d{animation:wpul 1.4s ease-out infinite}
@keyframes wpul{0%{box-shadow:0 0 0 0 rgba(255,106,20,.7)}100%{box-shadow:0 0 0 1.2rem rgba(255,106,20,0)}}

/* top-right: storm + radar + feed */
#hud .tr{position:absolute;right:2.4rem;top:2.1rem;display:flex;gap:1rem;align-items:flex-start}
#hud .storm{text-align:right;padding-top:.3rem}
#hud .storm .t{font-family:var(--B);font-weight:600;font-size:.85rem;letter-spacing:.22em;color:var(--bone2)}
#hud .storm .v{font-family:var(--N);font-size:2.3rem;line-height:2.4rem;color:var(--bone)}
#hud .storm .v.tx{font-family:var(--H);font-weight:900;font-size:1.4rem;line-height:1.8rem}
#hud .storm .z{height:.3rem;width:100%;margin-top:.15rem;background:var(--bone);transform-origin:right;transition:transform .3s}
#hud .storm.crit .v{color:var(--red);animation:blink .5s steps(2) infinite;text-shadow:0 0 .5rem rgba(0,0,0,.9),0 1px 1px #000}#hud .storm.crit .z{background:var(--red)}
@keyframes blink{50%{opacity:.5}}
#hud .radar{width:8.6rem;height:8.6rem;position:relative}
#hud .radar canvas{width:100%;height:100%}
#hud .feed{position:absolute;right:2.4rem;top:13.2rem;display:flex;flex-direction:column;align-items:flex-end;gap:.25rem}
#hud .feed div{display:flex;align-items:center;gap:.55rem;padding:.12rem .6rem .12rem 1.4rem;background:linear-gradient(270deg,rgba(10,8,6,.6),rgba(10,8,6,0));border-right:3px solid var(--o);font-family:var(--H);font-weight:800;font-size:1.05rem;line-height:1.4rem;animation:fdIn .35s var(--ease) both}
#hud .feed div em{font-style:normal;font-family:var(--N);color:var(--o);font-size:1.15rem}
#hud .feed div.crit{border-right-color:var(--haz)}#hud .feed div.crit em{color:var(--haz)}
#hud .feed div.out{transition:opacity .5s,transform .5s;opacity:0;transform:translateX(1rem)}
@keyframes fdIn{0%{opacity:0;transform:translateX(2rem);clip-path:inset(0 0 0 100%)}100%{opacity:1;transform:none;clip-path:inset(0 0 0 0)}}

/* bottom-left: shield / health / abilities */
#hud .vit{position:absolute;left:2.4rem;bottom:2.2rem;display:flex;align-items:flex-end;gap:1.1rem;transition:opacity .6s}
#hud .vit .bars{width:17rem}
#hud .vit .lb{display:flex;justify-content:space-between;align-items:baseline;font-family:var(--B);font-weight:600;font-size:.8rem;letter-spacing:.2em;color:var(--bone2);margin-bottom:.2rem}
#hud .vit .lb b{font-family:var(--N);font-size:2.2rem;line-height:2rem;color:var(--bone);letter-spacing:0;font-weight:800}
#hud .vit .lb b s{text-decoration:none;font-size:1.3rem;color:var(--o);margin-right:.5rem}
#hud .vit .seg{display:flex;gap:3px}
#hud .vit .seg i{flex:1;position:relative;overflow:hidden;background:rgba(239,229,207,.16);transform:skewX(-18deg)}
#hud .vit .seg i b{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--bone)}
#hud .vit .sh{height:.42rem;margin-bottom:3px}#hud .vit .sh i b{background:var(--o)}
#hud .vit .hp{height:.8rem}
#hud .vit .sh.brk i{animation:shb .5s steps(2) 3}
@keyframes shb{50%{background:rgba(255,59,43,.8)}}
#hud .vit.low .hp i b{background:var(--red)}#hud .vit.low .lb b{color:var(--red);animation:blink .6s steps(2) infinite}
#hud .vit .ab{display:flex;gap:.5rem}
#hud .vit .ab .a{position:relative;width:3.1rem;height:3.1rem;display:flex;align-items:center;justify-content:center}
#hud .vit .ab .a svg.rg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
#hud .vit .ab .a .ic{width:1.5rem;height:1.5rem;opacity:.55}#hud .vit .ab .a .ic svg{width:100%;height:100%}
#hud .vit .ab .a .kk{position:absolute;bottom:-1.05rem;left:-1rem;right:-1rem;text-align:center;font-family:var(--B);font-weight:700;font-size:.7rem;letter-spacing:.1em;color:var(--bone2);white-space:nowrap}
#hud .vit .ab .a .cd{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--N);font-size:1.05rem;color:var(--bone)}
#hud .vit .ab .a.rdy .ic{opacity:1}#hud .vit .ab .a.rdy .kk{color:var(--o)}
#hud .vit .ab .a.pop{animation:pop .4s var(--ease)}
@keyframes pop{0%{transform:scale(1.4);filter:brightness(2)}100%{transform:scale(1)}}

/* bottom-right: ammo */
#hud .amm{position:absolute;right:2.4rem;bottom:2.2rem;width:15.5rem;text-align:right;transition:opacity .6s}
#hud .amm .top{display:flex;align-items:baseline;justify-content:flex-end;gap:.35rem}
#hud .amm .top b{font-family:var(--N);font-size:4rem;line-height:3.8rem;color:var(--bone);font-weight:800}
#hud .amm .top span{font-family:var(--N);font-size:1.5rem;color:var(--bone2)}
#hud .amm .top.low b{color:var(--red);animation:blink .5s steps(2) infinite}
#hud .amm .tk{display:flex;gap:2px;height:.5rem;margin-top:.3rem}
#hud .amm .tk.big{gap:5px;height:.65rem}#hud .amm .tk.big i{background:#8fe3ff;box-shadow:0 0 6px rgba(120,210,255,.6)}#hud .amm .tk.big i.e{background:rgba(143,227,255,.14);box-shadow:none}
#hud .amm .ws{display:none;justify-content:flex-end;gap:.6rem;margin-top:.35rem;font-family:var(--B);font-weight:600;font-size:.8rem;letter-spacing:.18em;color:var(--bone2)}#hud .amm .ws.has{display:flex}
#hud .amm .ws span{opacity:.45}#hud .amm .ws span.on{opacity:1;color:var(--bone)}#hud .amm .ws em{font-style:normal;display:inline-block;border:1px solid currentColor;padding:0 .3rem;margin-right:.35rem;font-size:.75rem}
#hud .chg{position:absolute;left:50%;top:50%;width:4.2rem;height:4.2rem;transform:translate(-50%,-50%) rotate(-90deg);opacity:0;transition:opacity .12s;pointer-events:none;overflow:visible}#hud .chg.on{opacity:1}
#hud .chg circle{fill:none;stroke-width:2.2}#hud .chg .bg{stroke:rgba(143,227,255,.18)}#hud .chg .fg{stroke:#8fe3ff;stroke-dasharray:100;stroke-dashoffset:100;filter:drop-shadow(0 0 4px rgba(120,210,255,.9))}
#hud .chg .tk{stroke:#8fe3ff;stroke-width:2;opacity:0}#hud .chg.full .tk{opacity:1;animation:blink .18s steps(2) infinite}#hud .chg.full .fg{stroke:#fff}
#hud .amm .tk i{flex:1;background:var(--bone);transform:skewX(-18deg)}
#hud .amm .top.low~.tk i{background:var(--red)}#hud .amm .tk i.e{background:rgba(239,229,207,.16)}
#hud .amm .tk.rl i{background:rgba(239,229,207,.16)}#hud .amm .tk.rl i.f{background:var(--bone)}
#hud .amm .bot{display:flex;justify-content:flex-end;align-items:center;gap:.9rem;margin-top:.35rem;font-family:var(--H);font-weight:800;font-size:1.05rem;letter-spacing:.06em}
#hud .amm .bot .gl{display:flex;align-items:center;gap:.25rem;color:var(--bone2)}#hud .amm .bot .gl i{width:.42rem;height:.8rem;background:rgba(239,229,207,.2);transform:skewX(-18deg)}#hud .amm .bot .gl i.f{background:var(--o)}
#hud .amm .rl{position:absolute;right:0;top:-1.7rem;font-family:var(--H);font-weight:900;font-size:1rem;letter-spacing:.1em;color:var(--haz);opacity:0}
#hud .amm .rl.on{opacity:1;animation:blink .4s steps(2) infinite}
#hud .amm .gain{position:absolute;right:0;top:-1.5rem;font-family:var(--N);font-size:1.2rem;color:var(--o);opacity:0}
#hud .amm .gain.go{animation:pts 1.1s var(--ease) both}
#hud .idle{opacity:.72}

/* ---------- centre: crosshair, markers, tags, prompts ---------- */
#hud .xh{position:absolute;left:50%;top:50%;width:0;height:0;transition:opacity .15s}
#hud .xh i{position:absolute;background:var(--bone);box-shadow:0 0 0 1px rgba(0,0,0,.55)}
#hud .xh .t,#hud .xh .b{width:2px;height:.62rem;left:-1px}#hud .xh .l,#hud .xh .r{height:2px;width:.62rem;top:-1px}
#hud .xh .d{width:3px;height:3px;left:-1.5px;top:-1.5px;background:var(--o)}
#hud .xh.on i{background:var(--o)}
#hud .hm{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0}
#hud .hm i{position:absolute;width:.8rem;height:2px;background:var(--bone);left:-.4rem;top:-1px;box-shadow:0 0 0 1px rgba(0,0,0,.5)}
#hud .hm.weak i{background:var(--haz)}#hud .hm.kill i{background:var(--red);height:3px;width:1.1rem;left:-.55rem}
#hud .pts{position:absolute;left:50%;top:50%;margin:-3.6rem 0 0 1.6rem;font-family:var(--N);font-size:1.8rem;color:var(--o);opacity:0;text-shadow:0 0 .4rem rgba(0,0,0,.7)}
#hud .pts.go{animation:pts .9s var(--ease) both}
@keyframes pts{0%{opacity:0;transform:translateY(.6rem) scale(1.4)}15%{opacity:1;transform:none}75%{opacity:1}100%{opacity:0;transform:translateY(-.8rem)}}
#hud .dmg{position:absolute;left:50%;top:50%;width:0;height:0}
#hud .dmg i{position:absolute;width:15rem;height:15rem;left:-7.5rem;top:-7.5rem;border-radius:50%;border-top:.35rem solid var(--red);opacity:0;-webkit-mask:linear-gradient(90deg,transparent 30%,#000 45%,#000 55%,transparent 70%);mask:linear-gradient(90deg,transparent 30%,#000 45%,#000 55%,transparent 70%)}
#hud .tag{position:absolute;left:0;top:0;width:0;height:0;opacity:0;will-change:transform}
#hud .tag .br{position:absolute;border:2px solid var(--o);-webkit-mask:linear-gradient(#000,#000) 0 0/30% 30% no-repeat,linear-gradient(#000,#000) 100% 0/30% 30% no-repeat,linear-gradient(#000,#000) 0 100%/30% 30% no-repeat,linear-gradient(#000,#000) 100% 100%/30% 30% no-repeat;mask:linear-gradient(#000,#000) 0 0/30% 30% no-repeat,linear-gradient(#000,#000) 100% 0/30% 30% no-repeat,linear-gradient(#000,#000) 0 100%/30% 30% no-repeat,linear-gradient(#000,#000) 100% 100%/30% 30% no-repeat}
#hud .tag .lb{position:absolute;white-space:nowrap;background:var(--ink);border:1px solid var(--bone);padding:.05rem .45rem .2rem;font-family:var(--H);font-weight:800;font-size:1.05rem;line-height:1.2rem}
#hud .tag .lb .hb{height:.22rem;background:rgba(239,229,207,.2);margin-top:.1rem}#hud .tag .lb .hb i{display:block;height:100%;background:var(--red)}
#hud .tag.scan .br{border-color:var(--cy)}#hud .tag.scan .lb{border-color:var(--cy)}
#hud .rlp{position:absolute;left:calc(50% + 3.4rem);top:calc(50% + 1.4rem);font-family:var(--H);font-weight:800;font-size:1.15rem;letter-spacing:.08em;opacity:0;transition:opacity .15s}#hud .rlp.on{opacity:1}#hud .rlp .kc{border-color:var(--haz);color:var(--haz)}
#hud .use{position:absolute;left:50%;top:57%;transform:translateX(-50%);display:flex;align-items:center;gap:.5rem;opacity:0;transition:opacity .15s}
#hud .use.on{opacity:1}
#hud .use .kc{font-size:1.5rem;line-height:2.4rem;min-width:2.6rem;border-width:2px;background:var(--o);color:#0d0b09;border-color:var(--o)}
#hud .use .w{background:var(--ink);border:1px solid var(--bone);padding:.2rem .6rem}
#hud .use .w b{font-family:var(--H);font-weight:900;font-size:1.7rem;display:block;line-height:1.9rem}
#hud .use .w .pb{height:.4rem;background:rgba(239,229,207,.2);margin-top:.15rem;width:12rem}#hud .use .w .pb i{display:block;height:100%;width:0;background:var(--o)}

/* ---------- radio subtitles / banners / hints ---------- */
#hud .rad{position:absolute;left:50%;bottom:2.6rem;transform:translateX(-50%);max-width:62rem;white-space:nowrap;display:flex;align-items:center;gap:.6rem;opacity:0;transition:opacity .3s}
#hud .rad.on{opacity:1}
#hud .rad .bars{display:flex;gap:2px;align-items:center;height:1.2rem}#hud .rad .bars i{width:3px;background:var(--o);height:30%}
#hud .rad .box{background:rgba(10,8,6,.62);border:0;padding:.42rem 1.3rem;font-family:var(--B);font-weight:600;font-size:1.25rem;letter-spacing:.02em;line-height:1.6rem;clip-path:polygon(.8rem 0,calc(100% - .8rem) 0,100% 50%,calc(100% - .8rem) 100%,.8rem 100%,0 50%)}
#hud .rad .box b{color:var(--o);font-family:var(--H);font-weight:900;margin-right:.45rem;letter-spacing:.04em}
#hud .ban{position:absolute;left:50%;top:22%;transform:translateX(-50%);display:flex;align-items:stretch;opacity:0;height:3.6rem}
#hud .ban.on{animation:ban var(--dur,3s) var(--ease) both}
#hud .ban .hz{width:3.2rem}
#hud .ban.minor{height:2.6rem;top:24%}#hud .ban.minor b{font-size:1.7rem;line-height:2.6rem;padding:0 1rem}#hud .ban.minor .hz{width:2.2rem}#hud .ban.minor s{font-size:.85rem}
#hud .ban b{background:#0d0b09;color:var(--o);font-family:var(--H);font-weight:900;font-size:2.7rem;line-height:3.6rem;padding:0 1.3rem;white-space:nowrap;letter-spacing:.03em}
#hud .ban.crit b{color:var(--red)}#hud .ban.good b{background:var(--o);color:#0d0b09}
#hud .ban s{position:absolute;left:0;right:0;top:100%;margin-top:.3rem;text-align:center;text-decoration:none;font-family:var(--B);font-weight:600;font-size:1.05rem;letter-spacing:.3em}
@keyframes ban{0%{opacity:0;clip-path:inset(0 50% 0 50%)}6%{opacity:1;clip-path:inset(0 0 0 0)}9%{opacity:.3}12%{opacity:1}88%{opacity:1;clip-path:inset(0 0 0 0)}100%{opacity:0;clip-path:inset(50% 0 50% 0)}}
#hud .hint{position:absolute;left:50%;bottom:13.4rem;transform:translateX(-50%);display:flex;gap:1.6rem;opacity:0;transition:opacity .4s;font-family:var(--H);font-weight:800;font-size:1.4rem;align-items:center;color:var(--bone);padding:.45rem 1.2rem;background:linear-gradient(90deg,rgba(10,8,6,0),rgba(10,8,6,.55) 15%,rgba(10,8,6,.55) 85%,rgba(10,8,6,0))}
#hud .hint.on{opacity:1}
#hud .alert{position:absolute;left:50%;top:9.2rem;transform:translateX(-50%);display:flex;align-items:center;gap:.6rem;background:rgba(150,20,10,.85);border:1px solid var(--red);padding:0 1rem;font-family:var(--H);font-weight:900;font-size:1.6rem;line-height:2.3rem;color:#fff;opacity:0}
#hud .alert.on{animation:alt 1.6s steps(1) both}
@keyframes alt{0%{opacity:1}10%{opacity:.2}14%{opacity:1}22%{opacity:.4}26%{opacity:1}85%{opacity:1}100%{opacity:0}}
#hud .boss{position:absolute;left:50%;top:7.4rem;width:40rem;margin-left:-20rem;opacity:0;transition:opacity .4s}
#hud .boss.on{opacity:1}
#hud .boss .t{display:flex;justify-content:space-between;align-items:end;font-family:var(--H);font-weight:900;font-size:1.5rem;line-height:1.6rem}
#hud .boss .t span{font-family:var(--B);font-weight:600;font-size:.95rem;letter-spacing:.2em;color:var(--bone2)}
#hud .boss .bar{display:flex;gap:3px;height:1rem;background:var(--ink);border:1px solid var(--bone);padding:2px}
#hud .boss .bar i{flex:1;background:var(--o);transform:skewX(-20deg)}#hud .boss .bar i.e{background:rgba(239,229,207,.12)}
#hud .crop i{position:absolute;width:1.4rem;height:1.4rem;border:2px solid var(--bone2)}
#hud .crop .a{left:.8rem;top:.8rem;border-right:0;border-bottom:0}#hud .crop .b{right:.8rem;top:.8rem;border-left:0;border-bottom:0}#hud .crop .c{left:.8rem;bottom:.8rem;border-right:0;border-top:0}#hud .crop .d{right:.8rem;bottom:.8rem;border-left:0;border-top:0}
#hud .crack{position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity 2.5s}
#hud .crack.on{opacity:1;transition:none}
#hud .speed{position:absolute;inset:0;opacity:0;background:repeating-conic-gradient(from 0deg at 50% 50%,rgba(239,229,207,.0) 0deg 3deg,rgba(239,229,207,.14) 3.2deg 3.5deg,rgba(239,229,207,0) 3.7deg 7deg);-webkit-mask:radial-gradient(circle at 50% 50%,transparent 32%,#000 75%);mask:radial-gradient(circle at 50% 50%,transparent 32%,#000 75%)}

/* ---------- screens (boot / title / pause / settings / end) ---------- */
#ui .scr{position:absolute;inset:0;pointer-events:auto;display:none}
#ui .scr.on{display:block}
#ui .scr.boot.on{display:flex}
#ui .boot{background:#0b0907;display:flex;flex-direction:column;justify-content:center;padding-left:8vw}
#ui .boot .lg{font-family:var(--H);font-weight:900;font-size:2.2rem;color:var(--o);letter-spacing:.06em}
#ui .boot .log{margin-top:1.2rem;font-family:var(--M);font-size:.85rem;line-height:1.35rem;color:var(--bone2);white-space:pre;min-height:9.5rem}
#ui .boot .log b{color:var(--o);font-weight:500}
#ui .boot .bar{display:flex;gap:4px;width:28rem;height:.9rem;margin-top:1rem}#ui .boot .bar i{flex:1;background:rgba(239,229,207,.12)}#ui .boot .bar i.f{background:var(--o)}
#ui .boot .pc{margin-top:.5rem;font-family:var(--N);font-size:1.6rem;color:var(--bone)}
#ui .boot.out{animation:bootOut .6s ease-in both}
@keyframes bootOut{to{opacity:0;visibility:hidden}}
#ui .title{background:linear-gradient(90deg,rgba(8,6,4,.78) 0,rgba(8,6,4,.42) 36%,rgba(8,6,4,0) 60%)}
#ui .title:before,#ui .title:after{content:'';position:absolute;left:0;right:0;height:7.5vh;background:#070504;z-index:0}#ui .title:before{top:0}#ui .title:after{bottom:0}
#ui .title>*{z-index:1}
#ui .title .wm{position:absolute;left:7vw;top:25vh}
#ui .title .ov{font-family:var(--B);font-weight:600;font-size:1.05rem;letter-spacing:.42em;color:var(--o);display:flex;align-items:center;gap:.8rem}
#ui .title .ov i{display:inline-block;width:3rem;height:.9rem}
#ui .title h1{margin:.4rem 0 0;font-family:var(--H);font-weight:900;font-size:13rem;line-height:11rem;letter-spacing:.03em;color:var(--bone);text-shadow:0 .5rem 2.5rem rgba(0,0,0,.45)}
#ui .title h1 span{display:inline-block;animation:let .9s var(--ease) both}
@keyframes let{0%{opacity:0;transform:translateY(2.5rem);clip-path:inset(0 0 100% 0)}100%{opacity:1;transform:none;clip-path:inset(0 0 -10% 0)}}
#ui .title .pr{margin-top:1.2rem;padding-top:.9rem;border-top:2px solid var(--o);width:30rem;font-family:var(--B);font-weight:500;font-size:1.3rem;line-height:1.75rem;letter-spacing:.02em;color:var(--bone);text-transform:none}
#ui .title .pr b{font-family:var(--H);font-weight:800;color:var(--o);letter-spacing:.12em;font-size:1rem;display:block;margin-bottom:.2rem}
#ui .menu{margin-top:2.4rem;display:flex;flex-direction:column;gap:.2rem;width:20rem}
#ui .menu button{all:unset;cursor:pointer;position:relative;display:flex;align-items:center;height:3rem;padding:0 1rem;font-family:var(--H);font-weight:800;font-size:1.8rem;letter-spacing:.08em;color:rgba(239,229,207,.8);border-left:3px solid transparent;transition:background .15s,color .12s,padding .2s var(--ease),border-color .12s}
#ui .menu button .n{font-family:var(--M);font-size:.7rem;color:var(--bone2);margin-right:1rem;font-weight:500}
#ui .menu button:after{content:'';position:absolute;right:.9rem;width:.7rem;height:.7rem;border-top:3px solid currentColor;border-right:3px solid currentColor;transform:rotate(45deg);opacity:0;transition:opacity .12s}
#ui .menu button.sel{color:#0d0b09;border-left-color:var(--o);padding-left:1.5rem;background:linear-gradient(90deg,var(--o) 0,var(--o) 55%,rgba(255,106,20,0))}
#ui .menu button.sel .n{color:#0d0b09}
#ui .menu button.sel .n{color:var(--o)}#ui .menu button.sel:after{opacity:1}
#ui .menu button.dis{opacity:.4;cursor:default}
#ui .title .st{position:absolute;right:2.4rem;top:calc(7.5vh + 1.4rem);text-align:right;font-family:var(--H);font-weight:800;font-size:1.15rem;line-height:1.5rem}
#ui .title .st div:first-child{color:var(--o)}
#ui .title .st .hz{height:.7rem;margin-top:.5rem;margin-left:auto;width:9rem}
#ui .title .keys{position:absolute;left:7vw;bottom:calc(7.5vh + 1.6rem);display:flex;gap:1.2rem;font-family:var(--H);font-weight:800;font-size:1rem;align-items:center}
#ui .title .cr{position:absolute;right:2.4rem;bottom:calc(7.5vh + 1.4rem);text-align:right}
#ui .title .cr b{display:block;font-family:var(--H);font-weight:900;font-size:1.3rem;letter-spacing:.04em}
#ui .title.out{animation:tOut .55s var(--ease) both}
@keyframes tOut{0%{opacity:1}30%{opacity:1;clip-path:inset(0 0 0 0)}100%{opacity:0;clip-path:inset(0 0 0 100%)}}
#ui .pnl{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:36rem;background:rgba(10,8,6,.92);border:1px solid var(--bone);animation:pIn .3s var(--ease) both}
@keyframes pIn{0%{opacity:0;clip-path:inset(0 0 100% 0)}100%{opacity:1;clip-path:inset(0 0 0 0)}}
#ui .pnl .hd{display:flex;height:2.8rem}#ui .pnl .hd b{flex:1;background:var(--o);color:#0d0b09;font-family:var(--H);font-weight:900;font-size:1.9rem;line-height:2.8rem;padding:0 1rem}#ui .pnl .hd i{width:2.8rem}
#ui .pnl .bd{padding:1.2rem 1.4rem 1.4rem}
#ui .pnl .menu{margin-top:0;width:auto}
#ui .pnl .ctl{display:grid;grid-template-columns:auto 1fr;gap:.55rem 1.2rem;font-family:var(--H);font-weight:800;font-size:1.25rem;align-items:center}
#ui .pnl .ctl .kc{font-size:1rem;line-height:1.5rem}
#ui .pnl .set{display:grid;grid-template-columns:11rem 1fr 3.2rem;gap:1rem 1rem;align-items:center;font-family:var(--H);font-weight:800;font-size:1.25rem}
#ui .pnl .set input[type=range]{-webkit-appearance:none;appearance:none;height:.5rem;background:rgba(239,229,207,.2);outline:none}
#ui .pnl .set input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:1rem;height:1.6rem;background:var(--o);border:0;cursor:pointer}
#ui .pnl .set .v{font-family:var(--N);font-size:1.4rem;color:var(--o);text-align:right}
#ui .pnl .set .opt{display:flex;gap:.3rem}#ui .pnl .set .opt button{all:unset;cursor:pointer;padding:0 .7rem;line-height:1.8rem;border:1px solid var(--bone2);font-size:1.1rem}#ui .pnl .set .opt button.sel{background:var(--o);color:#0d0b09;border-color:var(--o)}
#ui .pnl .back{margin-top:1.3rem}
#ui .pause{background:rgba(8,6,4,.55);backdrop-filter:blur(3px) saturate(.6)}
#ui .end{background:radial-gradient(ellipse at 50% 50%,rgba(8,6,4,.45),rgba(8,6,4,.88))}
#ui .end .big{position:absolute;left:6.5vw;top:22vh}
#ui .end .big .ov{font-family:var(--B);font-weight:600;font-size:1.1rem;letter-spacing:.42em;color:var(--o)}
#ui .end .big h1{margin:0;font-family:var(--H);font-weight:900;font-size:9rem;line-height:8.4rem;color:var(--bone)}
#ui .end.kia .big h1{color:var(--red)}
#ui .end .stats{display:flex;gap:.4rem;margin-top:1.4rem}
#ui .end .stats div{background:var(--ink);border:1px solid var(--bone);padding:.5rem 1rem;min-width:7.5rem}
#ui .end .stats div span{display:block;font-family:var(--B);font-weight:600;font-size:.85rem;letter-spacing:.25em;color:var(--bone2)}
#ui .end .stats div b{font-family:var(--N);font-size:2.8rem;line-height:3rem;color:var(--o)}
#ui .end .menu{width:20rem}

/* ---------- cutscene: letterbox, boss card, callouts ---------- */
#ui .cine{position:absolute;inset:0;pointer-events:none;display:none}
#ui .cine.on{display:block}
#ui .cine .bar{position:absolute;left:0;right:0;height:11vh;background:#050403;animation:lbIn .5s var(--ease) both}
#ui .cine .bar.t{top:0}#ui .cine .bar.b{bottom:0}
@keyframes lbIn{from{height:0}}
#ui .cine .card{position:absolute;left:6vw;bottom:15vh;opacity:0;transform:translateX(-2rem);transition:opacity .25s,transform .6s var(--ease)}
#ui .cine .card.in{opacity:1;transform:none}
#ui .cine .card .cl{display:inline-block;background:var(--o);color:#0d0b09;font-family:var(--H);font-weight:900;font-size:1.3rem;letter-spacing:.12em;padding:.05rem .6rem}
#ui .cine .card .nm{font-family:var(--H);font-weight:900;font-size:9.5rem;line-height:8.2rem;color:var(--bone);letter-spacing:.02em;text-shadow:0 .4rem 2rem rgba(0,0,0,.6)}
#ui .cine .card.in .nm{animation:nmIn .9s var(--ease) both}
@keyframes nmIn{0%{clip-path:inset(0 100% 0 0);filter:brightness(3)}60%{clip-path:inset(0 0 0 0)}100%{filter:none}}
#ui .cine .card .th{font-family:var(--H);font-weight:800;font-size:1.5rem;letter-spacing:.18em;color:var(--bone2)}#ui .cine .card .th b{color:var(--red)}
#ui .cine .call{position:absolute;left:0;top:0;width:0;height:0;opacity:0;transition:opacity .2s}
#ui .cine .call.on{opacity:1}
#ui .cine .call i{position:absolute;left:-.45rem;top:-.45rem;width:.9rem;height:.9rem;border:2px solid var(--o);border-radius:50%;box-shadow:0 0 .8rem var(--o);animation:wpul 1.2s ease-out infinite}
#ui .cine .call b{position:absolute;left:0;top:0;height:2px;background:var(--o);transform-origin:0 50%}
#ui .cine .call span{position:absolute;white-space:nowrap;background:rgba(10,8,6,.85);border:1px solid var(--o);font-family:var(--H);font-weight:800;font-size:1.1rem;letter-spacing:.1em;padding:.1rem .55rem}
#ui .cine .skip{position:absolute;right:2.4rem;bottom:calc(11vh + 1rem);font-family:var(--H);font-weight:800;font-size:.95rem;letter-spacing:.1em;color:var(--bone2)}

/* ---------- kill emblem (centre), wave clear, overdrive ---------- */
#hud .kb{position:absolute;left:50%;top:63%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;opacity:0}
#hud .kb.go{animation:kbIn 1.6s var(--ease) both}
@keyframes kbIn{0%{opacity:0;transform:translateX(-50%) scale(1.9)}10%{opacity:1;transform:translateX(-50%) scale(.92)}16%{transform:translateX(-50%) scale(1)}80%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-.6rem)}}
#hud .kb svg{width:4.4rem;height:4.4rem;overflow:visible}
#hud .kb svg .rg{fill:none;stroke-width:2.5}#hud .kb svg .core{stroke:none}
#hud .kb .lb{margin-top:.2rem;font-family:var(--H);font-weight:900;font-size:1.5rem;letter-spacing:.14em;text-shadow:0 0 .8rem rgba(0,0,0,.8)}
#hud .kb.t1{--kc:#efe5cf}#hud .kb.t2{--kc:#ff8f45}#hud .kb.t3{--kc:#ff6a14}#hud .kb.t4{--kc:#ff3b2b}#hud .kb.t5{--kc:#ffd23f}
#hud .kb svg .rg{stroke:var(--kc)}#hud .kb svg .core{fill:var(--kc)}#hud .kb .lb{color:var(--kc)}
#hud .kb.go svg{filter:drop-shadow(0 0 .6rem var(--kc))}
#hud .vit .ab .a.od .ic svg *{stroke:var(--cy)}
#hud .vit .ab .a.od.rdy{animation:odR 1s ease-in-out infinite}
@keyframes odR{50%{filter:drop-shadow(0 0 .7rem var(--cy)) brightness(1.4)}}
#hud .vit .ab .a.od .c{stroke:var(--cy)}
#hud .odf{position:absolute;inset:0;opacity:0;pointer-events:none;box-shadow:inset 0 0 6rem rgba(98,241,255,.45),inset 0 0 1.2rem rgba(98,241,255,.8);transition:opacity .3s}
#hud .odf.on{opacity:1;animation:odF .7s ease-in-out infinite}
@keyframes odF{50%{box-shadow:inset 0 0 8rem rgba(98,241,255,.6),inset 0 0 1.6rem rgba(98,241,255,1)}}
#hud .odt{position:absolute;left:50%;top:auto;bottom:9.6rem;transform:translateX(-50%);width:22rem;opacity:0;text-align:center;font-family:var(--H);font-weight:900;font-size:1.25rem;letter-spacing:.3em;color:var(--cy);text-shadow:0 0 .8rem rgba(98,241,255,.8)}
#hud .odt.on{opacity:1}
#hud .odt i{display:block;height:.3rem;margin-top:.25rem;background:var(--cy);box-shadow:0 0 .8rem var(--cy);transform-origin:center}
`;
