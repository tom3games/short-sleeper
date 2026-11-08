import './mute-auto.mjs'
// SNS 用画像 og.png（1200x630）。一番おかしい場面: 講演中に立ったまま爆睡 から 記者が撮る・客が叫ぶ・「瞑想です」
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const PORT = 5463
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH)
const ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await muteContext(ctx)
const p = await ctx.newPage()
await p.goto(`http://localhost:${PORT}/privacy.html`)
await p.setContent(`<!doctype html><html><head><base href="http://localhost:${PORT}/"><link href="https://fonts.googleapis.com/css2?family=RocknRoll+One&family=M+PLUS+1p:wght@800&display=swap" rel="stylesheet"><style>
*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;overflow:hidden;position:relative;background:#2a1b2e;font-family:'M PLUS 1p',sans-serif}
.cur{position:absolute;top:0;bottom:0;width:120px;background:#a3202a}.cur.l{left:0}.cur.r{right:0}
.top{position:absolute;left:0;right:0;top:0;height:40px;background:#c22c33}
.floor{position:absolute;left:0;right:0;bottom:0;height:150px;background:#6b3d22;border-top:8px solid #e9c27a}
.spot{position:absolute;left:420px;top:-80px;width:520px;height:800px;background:radial-gradient(closest-side,rgba(255,240,190,.55),transparent);}
img{position:absolute;filter:drop-shadow(5px 8px 0 rgba(0,0,0,.3))}
.t{position:absolute;left:44px;top:46px;width:560px}
.t .en{display:inline-block;font-family:'RocknRoll One';font-size:22px;letter-spacing:.16em;background:#1d1a17;color:#ffe9c8;padding:4px 12px}
.t h1{font-family:'RocknRoll One';font-weight:400;font-size:78px;line-height:1.05;color:#fff;-webkit-text-stroke:10px #1d1a17;paint-order:stroke fill;margin-top:12px}
.t h1 em{font-style:normal;color:#ffd23a;font-size:1.25em}
.bub{position:absolute;background:#ffd23a;border:5px solid #1d1a17;border-radius:30px;padding:10px 26px;font-family:'RocknRoll One';font-size:46px;white-space:nowrap}
.bub::after{content:'';position:absolute;right:60px;bottom:-26px;border:20px solid transparent;border-top-color:#1d1a17;border-bottom:0}
.ono{position:absolute;font-family:'RocknRoll One';font-size:64px;color:#fff;-webkit-text-stroke:9px #1d1a17;paint-order:stroke fill;transform:rotate(12deg)}
.flash{position:absolute;left:560px;top:170px;width:260px;height:260px;background:radial-gradient(closest-side,#fff,rgba(255,255,255,0));}
.mark{position:absolute;font-family:'RocknRoll One';font-size:70px;color:#ffd23a;-webkit-text-stroke:9px #1d1a17;paint-order:stroke fill}
</style></head><body>
<div class="cur l"></div><div class="cur r"></div><div class="top"></div><div class="spot"></div><div class="floor"></div>
<div class="flash"></div>
<img src="img/guru_deep.webp" style="right:120px;bottom:20px;height:560px">
<img src="img/jour_gotcha.webp" style="left:450px;bottom:235px;height:230px">
<img src="img/aud0_shock.webp" style="left:20px;bottom:-10px;height:250px">
<img src="img/aud1_shock.webp" style="left:265px;bottom:-14px;height:250px">
<img src="img/aud2_shock.webp" style="left:445px;bottom:-12px;height:250px">
<div class="mark" style="left:480px;top:130px">!?</div>
<div class="ono" style="right:70px;top:40px">ぐおー</div>
<div class="t"><span class="en">THE 3-MINUTE SLEEPER</span><h1>1日<em>3分</em>の<br>ショート<br>スリーパー</h1></div>
<div class="bub" style="right:330px;top:250px">瞑想です</div>
</body></html>`)
await p.waitForLoadState('networkidle'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400)
await p.screenshot({ path: ROOT + '/og.png' })
await b.close(); server.kill()
console.log('og.png')
