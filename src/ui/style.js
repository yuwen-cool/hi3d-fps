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
@keyframes gl{0%{transform:translate(0)}20%{transform:translate(-.5rem,.1rem);clip-path:polygon(0 0,100% 0,100% 18%,0 18%,0 24%,100% 24%,100% 61%,0 61%,0 70%,100% 70%,100% 100%,0 100%);filter:drop-shadow(.25rem 0 0 rgba(255,40,20,.8)) drop-shadow(-.25rem 0 0 rgba(90,240,255,.6))}40%{transform:translate(.6rem,-.1rem)}60%{transform:translate(-.2rem,0);clip-path:polygon(0 0,100% 0,100% 40%,0 40%,0 47%,100% 47%,100% 100%,0 100%)}100%{transform:translate(0);clip-path:none;filter:none}}

/* ---------- objective (top-left) ---------- */
#hud .obj{position:absolute;left:2.2rem;top:2rem;width:23rem}
#hud .obj .hd{display:flex;align-items:stretch;height:2.45rem}
#hud .obj .hd b{flex:1;background:var(--o);color:#0d0b09;font-family:var(--H);font-weight:900;font-size:1.75rem;line-height:2.45rem;padding:0 .7rem;letter-spacing:.01em;white-space:nowrap;overflow:hidden}
#hud .obj .hd i{width:2.45rem}
#hud .obj .ln{display:flex;align-items:center;gap:.6rem;margin-top:.25rem;padding:.38rem .7rem;font-family:var(--H);font-weight:800;font-size:1.3rem;letter-spacing:.02em;transition:background .3s}
#hud .obj .ln .dm{width:.75rem;height:.75rem;border:2px solid var(--bone);transform:rotate(45deg);flex:none}
#hud .obj .ln .tx{flex:1;white-space:nowrap;overflow:hidden}
#hud .obj .ln .bx{display:flex;gap:.3rem}#hud .obj .ln .bx s{width:.95rem;height:.95rem;border:2px solid var(--bone);text-decoration:none}#hud .obj .ln .bx s.f{background:var(--o);border-color:var(--o)}
#hud .obj .ln.flash{background:rgba(255,106,20,.55)}
#hud .obj .ft{display:flex;align-items:center;margin-top:.25rem;padding:.3rem .7rem;gap:1rem}
#hud .obj .ft .ho{font-family:var(--H);font-weight:800;font-size:1.25rem}#hud .obj .ft .ho em{font-style:normal;font-family:var(--N);color:var(--o);font-size:1.6rem;margin-left:.4rem;vertical-align:-.1rem}
#hud .obj .ft .mono{line-height:.8rem;margin-left:auto;text-align:left}
#hud .obj .sub{margin-top:.25rem;padding:.25rem .7rem;font-family:var(--B);font-weight:600;font-size:1rem;letter-spacing:.08em;display:none}
#hud .obj .sub .pb{height:.35rem;background:rgba(239,229,207,.18);margin-top:.25rem}#hud .obj .sub .pb i{display:block;height:100%;width:0;background:var(--o)}

/* ---------- compass (top-centre) ---------- */
#hud .cmp{position:absolute;left:50%;top:1.6rem;width:46rem;margin-left:-23rem;height:5.2rem}
#hud .cmp .win{position:absolute;left:0;right:0;top:.9rem;height:2.1rem;overflow:hidden;background:linear-gradient(rgba(10,8,6,.0),rgba(10,8,6,.5));-webkit-mask:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
#hud .cmp .strip{position:absolute;left:0;top:0;height:100%;will-change:transform}
#hud .cmp .strip i{position:absolute;bottom:0;width:2px;margin-left:-1px;background:var(--bone);height:.45rem;opacity:.75;box-shadow:0 0 2px rgba(0,0,0,.8)}
#hud .cmp .strip i.m{height:.8rem;opacity:1}
#hud .cmp .strip b{position:absolute;top:0;width:3rem;margin-left:-1.5rem;text-align:center;font-family:var(--H);font-weight:800;font-size:1.05rem;line-height:1rem;text-shadow:0 0 .3rem rgba(0,0,0,.9),0 1px 1px rgba(0,0,0,.9)}
#hud .cmp .strip b.c{font-size:1.45rem;color:var(--bone)}
#hud .cmp .base{position:absolute;left:12%;right:12%;top:3rem;height:2px;background:var(--bone);opacity:.8}
#hud .cmp .hd{position:absolute;left:50%;top:-.2rem;transform:translateX(-50%);background:var(--o);color:#0d0b09;font-family:var(--H);font-weight:900;font-size:1.3rem;line-height:1.5rem;padding:0 .55rem;white-space:nowrap}
#hud .cmp .hd:after{content:'';position:absolute;left:50%;bottom:-.45rem;margin-left:-.45rem;border:.45rem solid transparent;border-top-color:var(--o);border-bottom:0}
#hud .cmp .mk{position:absolute;top:3.25rem;left:0;width:0;will-change:transform;transition:opacity .2s}
#hud .cmp .mk .d{position:absolute;left:-.72rem;top:0;width:1.44rem;height:1.44rem;transform:rotate(45deg);background:var(--o);border:2px solid #0d0b09;box-shadow:0 0 0 1px var(--o)}
#hud .cmp .mk .l{position:absolute;left:-.72rem;top:0;width:1.44rem;text-align:center;font-family:var(--H);font-weight:900;font-size:.95rem;line-height:1.44rem;color:#0d0b09}
#hud .cmp .mk .r{position:absolute;left:-2rem;top:1.65rem;width:4rem;text-align:center}#hud .cmp .mk .r span{background:var(--ink);border:1px solid var(--bone);font-family:var(--H);font-weight:800;font-size:.85rem;padding:0 .3rem;line-height:1rem}
#hud .cmp .mk.boss .d{background:var(--red);box-shadow:0 0 0 1px var(--red),0 0 1rem rgba(255,59,43,.8);width:1.9rem;height:1.9rem;left:-.95rem;top:-.2rem}
#hud .cmp .mk.boss .l{width:1.9rem;left:-.95rem;line-height:1.5rem;color:#fff}
#hud .cmp .mk.ext .d{background:var(--bone)}
#hud .cmp .mk.edge .d{opacity:.7}
#hud .cmp .en{position:absolute;top:2.05rem;left:0;width:0;height:0;border-left:.38rem solid transparent;border-right:.38rem solid transparent;border-top:.62rem solid var(--red);margin-left:-.38rem;will-change:transform}

/* ---------- top-right: storm + radar + feed ---------- */
#hud .tr{position:absolute;right:2.2rem;top:2rem;display:flex;gap:.9rem;align-items:flex-start}
#hud .storm{width:9.6rem}
#hud .storm .t{background:var(--ink);border:1px solid var(--bone);border-bottom:0;font-family:var(--H);font-weight:800;font-size:1.2rem;text-align:center;line-height:1.75rem}
#hud .storm .v{background:var(--o);color:#0d0b09;font-family:var(--N);font-size:3.1rem;text-align:center;line-height:3.3rem}
#hud .storm .z{height:.95rem}
#hud .storm .v.tx{font-family:var(--H);font-weight:900;font-size:1.9rem}
#hud .storm.crit .v{background:var(--red);color:#fff;animation:blink .5s steps(2) infinite}
@keyframes blink{50%{opacity:.55}}
#hud .radar{width:10.5rem;height:10.5rem;position:relative}
#hud .radar canvas{width:100%;height:100%}
#hud .feed{position:absolute;right:2.2rem;top:13.4rem;display:flex;flex-direction:column;align-items:flex-end;gap:.3rem}
#hud .feed div{display:flex;align-items:stretch;background:var(--ink);border:1px solid var(--bone);font-family:var(--H);font-weight:800;font-size:1.2rem;line-height:1.8rem;animation:fdIn .35s var(--ease) both}
#hud .feed div span{padding:0 .6rem}#hud .feed div em{font-style:normal;background:var(--o);color:#0d0b09;padding:0 .5rem;font-family:var(--N);font-size:1.35rem}
#hud .feed div.crit em{background:var(--haz)}
#hud .feed div.out{transition:opacity .5s,transform .5s;opacity:0;transform:translateX(1rem)}
@keyframes fdIn{0%{opacity:0;transform:translateX(3rem);clip-path:inset(0 0 0 100%)}100%{opacity:1;transform:none;clip-path:inset(0 0 0 0)}}

/* ---------- bottom-left: shield / health / abilities ---------- */
#hud .vit{position:absolute;left:2.2rem;bottom:2rem;width:23.5rem}
#hud .vit .row{display:flex;align-items:stretch;background:var(--ink);border:1px solid var(--bone);margin-bottom:.25rem;height:2.5rem}
#hud .vit .row .k{width:5.8rem;font-family:var(--H);font-weight:800;font-size:1.25rem;line-height:2.5rem;padding-left:.6rem;border-right:1px solid var(--bone)}
#hud .vit .row .seg{flex:1;display:flex;gap:.22rem;padding:.55rem .55rem}
#hud .vit .row .seg i{flex:1;background:rgba(239,229,207,.12);border:1px solid rgba(239,229,207,.35);position:relative;overflow:hidden}
#hud .vit .row .seg i b{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--bone)}
#hud .vit .sh .seg i b{background:var(--o)}
#hud .vit .row .n{width:4.6rem;text-align:center;font-family:var(--N);font-size:2.3rem;line-height:2.5rem;color:var(--o);border-left:1px solid var(--bone)}
#hud .vit .sh.brk{animation:shb .5s steps(2) 3}
@keyframes shb{50%{background:rgba(255,59,43,.6)}}
#hud .vit .hp.low .seg i b{background:var(--red)}#hud .vit .hp.low .n{color:var(--red);animation:blink .6s steps(2) infinite}
#hud .vit .ab{display:flex;align-items:center;background:var(--ink);border:1px solid var(--bone);height:4.4rem;padding:0 .6rem;gap:.55rem}
#hud .vit .ab .a{display:flex;align-items:center;gap:.45rem;flex:1}
#hud .vit .ab .a .ic{width:2.6rem;height:2.6rem;border:2px solid var(--bone);display:flex;align-items:center;justify-content:center;position:relative}
#hud .vit .ab .a .ic svg{width:1.6rem;height:1.6rem}
#hud .vit .ab .a .ic .kk{position:absolute;left:-.35rem;top:-.55rem;background:var(--bone);color:#0d0b09;font-family:var(--B);font-weight:700;font-size:.62rem;line-height:.8rem;padding:0 .2rem}
#hud .vit .ab .a .nm{font-family:var(--H);font-weight:800;font-size:1.1rem;line-height:1rem}
#hud .vit .ab .a .rg{width:3rem;height:3rem;position:relative}
#hud .vit .ab .a .rg svg{width:100%;height:100%;transform:rotate(-90deg)}
#hud .vit .ab .a .rg span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--N);font-size:1rem}
#hud .vit .ab .a.rdy .ic{background:var(--o);border-color:var(--o)}#hud .vit .ab .a.rdy .ic svg *{stroke:#0d0b09}
#hud .vit .ab .a.pop .ic{animation:pop .35s var(--ease)}
@keyframes pop{0%{transform:scale(1.35)}100%{transform:scale(1)}}
#hud .vit .ab .sep{width:1px;align-self:stretch;margin:.6rem 0;background:var(--bone2)}
#hud .vit .mono{margin-top:.3rem;display:flex;justify-content:space-between}

/* ---------- bottom-right: ammo ---------- */
#hud .amm{position:absolute;right:2.2rem;bottom:2rem;width:24rem}
#hud .amm .top{display:flex;align-items:stretch;background:var(--ink);border:1px solid var(--bone);height:5.4rem}
#hud .amm .top .c{flex:1;display:flex;align-items:baseline;padding:0 .8rem}
#hud .amm .top .c b{font-family:var(--N);font-size:5rem;line-height:5.4rem;color:var(--o);font-weight:800;min-width:5.6rem}
#hud .amm .top .c span{font-family:var(--N);font-size:2rem;color:var(--bone);margin-left:.4rem}
#hud .amm .top .c.low b{color:var(--red);animation:blink .5s steps(2) infinite}
#hud .amm .top .g{width:5.6rem;border-left:1px solid var(--bone);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.2rem}
#hud .amm .top .g .p{display:flex;gap:.25rem}#hud .amm .top .g .p i{width:.7rem;height:1.2rem;border:2px solid var(--bone)}#hud .amm .top .g .p i.f{background:var(--o);border-color:var(--o)}
#hud .amm .top .g .nm{font-family:var(--H);font-weight:800;font-size:1rem}
#hud .amm .tk{display:flex;gap:2px;height:1.25rem;background:var(--ink);border:1px solid var(--bone);border-top:0;padding:.22rem .5rem}
#hud .amm .tk i{flex:1;background:var(--o)}#hud .amm .tk i.e{background:rgba(239,229,207,.18)}
#hud .amm .tk.rl i{background:rgba(239,229,207,.18)}#hud .amm .tk.rl i.f{background:var(--bone)}
#hud .amm .bot{display:flex;align-items:stretch;margin-top:.25rem;height:2.1rem;gap:.25rem}
#hud .amm .bot .wn{background:var(--bone);color:#0d0b09;font-family:var(--H);font-weight:900;font-size:1.45rem;line-height:2.1rem;padding:0 .7rem}
#hud .amm .bot .mono{flex:1;line-height:.8rem;padding:.2rem .4rem;background:var(--ink);border:1px solid var(--bone2)}
#hud .amm .bot .hz{width:3rem}
#hud .amm .rl{position:absolute;right:0;top:-1.9rem;font-family:var(--H);font-weight:800;font-size:1.15rem;background:var(--haz);color:#0d0b09;padding:0 .5rem;line-height:1.5rem;opacity:0}
#hud .amm .rl.on{opacity:1;animation:blink .4s steps(2) infinite}

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
#hud .use{position:absolute;left:50%;top:57%;transform:translateX(-50%);display:flex;align-items:center;gap:.5rem;opacity:0;transition:opacity .15s}
#hud .use.on{opacity:1}
#hud .use .kc{font-size:1.5rem;line-height:2.4rem;min-width:2.6rem;border-width:2px;background:var(--o);color:#0d0b09;border-color:var(--o)}
#hud .use .w{background:var(--ink);border:1px solid var(--bone);padding:.2rem .6rem}
#hud .use .w b{font-family:var(--H);font-weight:900;font-size:1.7rem;display:block;line-height:1.9rem}
#hud .use .w .pb{height:.4rem;background:rgba(239,229,207,.2);margin-top:.15rem;width:12rem}#hud .use .w .pb i{display:block;height:100%;width:0;background:var(--o)}

/* ---------- radio subtitles / banners / hints ---------- */
#hud .rad{position:absolute;left:50%;bottom:2.6rem;transform:translateX(-50%);max-width:46rem;display:flex;align-items:center;gap:.6rem;opacity:0;transition:opacity .3s}
#hud .rad.on{opacity:1}
#hud .rad .bars{display:flex;gap:2px;align-items:center;height:1.2rem}#hud .rad .bars i{width:3px;background:var(--o);height:30%}
#hud .rad .box{background:var(--ink);border:1px solid var(--bone);padding:.45rem 1rem;font-family:var(--B);font-weight:600;font-size:1.35rem;letter-spacing:.02em;line-height:1.6rem;clip-path:polygon(.8rem 0,calc(100% - .8rem) 0,100% 50%,calc(100% - .8rem) 100%,.8rem 100%,0 50%)}
#hud .rad .box b{color:var(--o);font-family:var(--H);font-weight:900;margin-right:.45rem;letter-spacing:.04em}
#hud .ban{position:absolute;left:50%;top:22%;transform:translateX(-50%);display:flex;align-items:stretch;opacity:0;height:3.6rem}
#hud .ban.on{animation:ban var(--dur,3s) var(--ease) both}
#hud .ban .hz{width:3.2rem}
#hud .ban b{background:#0d0b09;color:var(--o);font-family:var(--H);font-weight:900;font-size:2.7rem;line-height:3.6rem;padding:0 1.3rem;white-space:nowrap;letter-spacing:.03em}
#hud .ban.crit b{color:var(--red)}#hud .ban.good b{background:var(--o);color:#0d0b09}
#hud .ban s{position:absolute;left:0;right:0;top:100%;margin-top:.3rem;text-align:center;text-decoration:none;font-family:var(--B);font-weight:600;font-size:1.05rem;letter-spacing:.3em}
@keyframes ban{0%{opacity:0;clip-path:inset(0 50% 0 50%)}6%{opacity:1;clip-path:inset(0 0 0 0)}9%{opacity:.3}12%{opacity:1}88%{opacity:1;clip-path:inset(0 0 0 0)}100%{opacity:0;clip-path:inset(50% 0 50% 0)}}
#hud .hint{position:absolute;left:50%;bottom:7.2rem;transform:translateX(-50%);display:flex;gap:1.4rem;opacity:0;transition:opacity .4s;font-family:var(--H);font-weight:800;font-size:1.15rem;align-items:center}
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
#ui .boot{background:#0b0907;display:flex;flex-direction:column;justify-content:center;padding-left:8vw}
#ui .boot .lg{font-family:var(--H);font-weight:900;font-size:2.2rem;color:var(--o);letter-spacing:.06em}
#ui .boot .log{margin-top:1.2rem;font-family:var(--M);font-size:.85rem;line-height:1.35rem;color:var(--bone2);white-space:pre;min-height:9.5rem}
#ui .boot .log b{color:var(--o);font-weight:500}
#ui .boot .bar{display:flex;gap:4px;width:28rem;height:.9rem;margin-top:1rem}#ui .boot .bar i{flex:1;background:rgba(239,229,207,.12)}#ui .boot .bar i.f{background:var(--o)}
#ui .boot .pc{margin-top:.5rem;font-family:var(--N);font-size:1.6rem;color:var(--bone)}
#ui .boot.out{animation:bootOut .6s ease-in both}
@keyframes bootOut{to{opacity:0;visibility:hidden}}
#ui .title{background:linear-gradient(90deg,rgba(8,6,4,.82) 0,rgba(8,6,4,.55) 38%,rgba(8,6,4,0) 62%),linear-gradient(0deg,rgba(8,6,4,.7),rgba(8,6,4,0) 30%)}
#ui .title .wm{position:absolute;left:6.5vw;top:24vh}
#ui .title .ov{font-family:var(--B);font-weight:600;font-size:1.05rem;letter-spacing:.42em;color:var(--o);display:flex;align-items:center;gap:.8rem}
#ui .title .ov i{display:inline-block;width:3rem;height:.9rem}
#ui .title h1{margin:.2rem 0 0;font-family:var(--H);font-weight:900;font-size:11.5rem;line-height:9.6rem;letter-spacing:-.005em;color:var(--bone)}
#ui .title h1 span{display:inline-block;animation:let .9s var(--ease) both}
@keyframes let{0%{opacity:0;transform:translateY(2.5rem);clip-path:inset(0 0 100% 0)}100%{opacity:1;transform:none;clip-path:inset(0 0 -10% 0)}}
#ui .title .pr{margin-top:1.1rem;display:flex;align-items:stretch;height:2.3rem}
#ui .title .pr b{background:var(--o);color:#0d0b09;font-family:var(--H);font-weight:900;font-size:1.55rem;line-height:2.3rem;padding:0 .8rem}
#ui .title .pr span{background:var(--ink);border:1px solid var(--bone);border-left:0;font-family:var(--B);font-weight:600;font-size:1.25rem;line-height:2.15rem;padding:0 .9rem;letter-spacing:.06em}
#ui .menu{margin-top:2.6rem;display:flex;flex-direction:column;gap:.45rem;width:22rem}
#ui .menu button{all:unset;cursor:pointer;position:relative;display:flex;align-items:center;height:3.1rem;padding:0 1rem;font-family:var(--H);font-weight:800;font-size:1.9rem;letter-spacing:.03em;color:var(--bone);background:rgba(10,8,6,.55);border:1px solid rgba(239,229,207,.35);transition:background .12s,color .12s,padding .18s var(--ease)}
#ui .menu button .n{font-family:var(--M);font-size:.7rem;color:var(--bone2);margin-right:1rem;font-weight:500}
#ui .menu button:after{content:'';position:absolute;right:.9rem;width:.7rem;height:.7rem;border-top:3px solid currentColor;border-right:3px solid currentColor;transform:rotate(45deg);opacity:0;transition:opacity .12s}
#ui .menu button.sel{background:var(--o);color:#0d0b09;border-color:var(--o);padding-left:1.6rem}
#ui .menu button.sel .n{color:#0d0b09}#ui .menu button.sel:after{opacity:1}
#ui .menu button.dis{opacity:.4;cursor:default}
#ui .title .st{position:absolute;right:2.4rem;top:2.2rem;text-align:right;font-family:var(--H);font-weight:800;font-size:1.15rem;line-height:1.5rem}
#ui .title .st div:first-child{color:var(--o)}
#ui .title .st .hz{height:.7rem;margin-top:.5rem;margin-left:auto;width:9rem}
#ui .title .keys{position:absolute;left:6.5vw;bottom:2.4rem;display:flex;gap:1.2rem;font-family:var(--H);font-weight:800;font-size:1rem;align-items:center}
#ui .title .cr{position:absolute;right:2.4rem;bottom:2.4rem;text-align:right}
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
`;
