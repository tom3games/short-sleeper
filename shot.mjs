import './mute-auto.mjs'
// 画面を台本どおりに撮る。node shot.mjs [幅x高さ] から shots/s-*.png
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 5462
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const [W, H] = (process.argv[2] || '390x844').split('x').map(Number)
const lang = process.argv[3] || 'ja'
const b = await chromium.launch(MUTE_LAUNCH)
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, locale: lang === 'en' ? 'en-US' : 'ja-JP' })
await muteContext(ctx)
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/?lang=${lang}`); await p.waitForFunction(() => window.__ssReady, null, { timeout: 15000 })
await p.waitForTimeout(600)
const tag = `${W}x${H}-${lang}`
await p.screenshot({ path: `${ROOT}/shots/s-${tag}-title.png` })
await p.evaluate(() => { SS.start(4242, { tutorial: false }); SS.dbg.pause(true) })
// 台本: 各場面で、窓（全員よそ見）の中・誰かが見ている時・見つかった瞬間
async function to(scene, t) { await p.evaluate(([scene, t]) => { const r = SS.run; let n = 0; window.__ssBot = window.__ssBot || SSBot.BOTS.read(); while ((r.idx < scene || (r.idx === scene && (r.phase !== 'play' || r.scene.t < t))) && !r.over && n++ < 60 * 300) SS.dbg.step(1) }, [scene, t]) }
const shots = [[0, 1], [1, 3], [2, 4], [3, 5], [4, 6], [5, 5], [6, 6]]
for (const [s, t] of shots) { await to(s, t); await p.waitForTimeout(150); await p.screenshot({ path: `${ROOT}/shots/s-${tag}-scene${s}.png` }) }
// 見つかる から 言い訳（新しい1日で）
await p.evaluate(() => { window.__ssBot = null; SS.start(7, { tutorial: false }); SS.dbg.pause(true); const r = SS.run; let n = 0; while (r.phase !== 'play' && n++ < 300) SS.dbg.step(1); SS.dbg.hold(true); n = 0; while (!r.spot && n++ < 1200) SS.dbg.step(1); SS.dbg.step(10) })
await p.waitForTimeout(150)
await p.screenshot({ path: `${ROOT}/shots/s-${tag}-spot.png` })
await p.evaluate(() => { SS.dbg.hold(false); SS.dbg.excuse(); SS.dbg.step(24) }); await p.waitForTimeout(150)
await p.screenshot({ path: `${ROOT}/shots/s-${tag}-excuse.png` })
// 読む bot で最後まで から 結果
await p.evaluate(() => { SS.start(4242, { tutorial: false }); window.__ssBot = SSBot.BOTS.read(); const r = SS.run; let n = 0; while (!r.over && n++ < 60 * 400) SS.dbg.step(1); window.__ssBot = null; SS.dbg.pause(false) })
await p.waitForTimeout(3600)
await p.screenshot({ path: `${ROOT}/shots/s-${tag}-result.png` })
console.log('errors:', errs.length ? errs : 'none', await p.evaluate(() => ({ r: SS.run.result, mute: window.__muteOk && window.__muteOk() })))
await b.close(); server.kill()
