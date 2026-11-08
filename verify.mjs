import './mute-auto.mjs'
// 検証。node verify.mjs   （音は出さない: mute-auto + muteContext）
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 5461
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(msg) }
async function open(browser, opts = {}, q = '') {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  await ctx.addInitScript(() => { try { localStorage.clear() } catch (e) {} })
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0 + q); await p.waitForFunction(() => window.__ssReady, null, { timeout: 15000 })
  await p.waitForTimeout(450)
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('main:not([hidden]) *')) {
    if (el.closest('[hidden]') || el.closest('#stage') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className.baseVal || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
const fit = q => q.evaluate(() => {
  const H = innerHeight, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('main:not([hidden]) button, main:not([hidden]) a, main:not([hidden]) .mag, main:not([hidden]) .poster, main:not([hidden]) .inst')) { if (!el.offsetParent && el.id !== 'tmSupport') continue; const r = el.getBoundingClientRect(); if (!r.height) continue; if (r.bottom > H + 1 || r.top < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)) }
  return { H, over: over.slice(0, 6) }
})
// 本物のポインタで押す（座標は窓口 itemXY から）
async function tapReal(p, name, touch) { const xy = await p.evaluate(n => SS.itemXY(n), name); if (!xy) throw new Error('no ' + name); if (touch) await p.touchscreen.tap(xy.x, xy.y); else await p.mouse.click(xy.x, xy.y); return xy }
async function toPlay(p) { await p.evaluate(() => { SS.dbg.pause(true); const r = SS.run; let n = 0; while (r.phase !== 'play' && n++ < 300) SS.dbg.step(1) }) }
// 全員がよそ見している時刻まで進める
async function toSafe(p) { return p.evaluate(() => { const r = SS.run, C = SSCore; let n = 0; const safe = () => r.scene.ws.every(w => { const s = C.wState(w, r.scene.t); return s === 'away' || s === 'zzz' }) && r.scene.ws.every(w => { const s = C.wState(w, r.scene.t + 1.2); return s === 'away' || s === 'zzz' }); while (!safe() && n++ < 2000 && !r.over) SS.dbg.step(1); return { t: r.scene.t, idx: r.idx, ok: safe() } }) }

const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [430, 932, 'max']]
const browser = await chromium.launch(MUTE_LAUNCH)
const p = await open(browser)
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('ブラウザの拡大が起きない', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', JSON.stringify(r))
})
await t('OGP 一式がある', async () => {
  const r = await p.evaluate(() => ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map(k => !!document.querySelector(`meta[property="${k}"]`)).concat(!!document.querySelector('meta[name="twitter:card"]')))
  expect(r.every(Boolean), JSON.stringify(r))
})
await t('画面に「AI」「画像生成」の文字が無い', async () => { const s = await p.evaluate(() => document.documentElement.outerHTML + JSON.stringify(window.SS_TXT)); expect(!/画像生成|\bAI\b|生成AI/.test(s), 'found') })

// ---- 本物のポインタで通す
await t('始めるボタンを本物のクリックで押すと1日が始まる', async () => { await tapReal(p, 'start'); await p.waitForTimeout(200); const v = await p.evaluate(() => !document.querySelector('#vPlay').hidden && !!SS.run); expect(v, v) })
await t('音を鳴らす操作のあとも実際には無音（Chromium）', async () => { const r = await p.evaluate(() => ({ ok: window.__muteOk(), calls: window.__soundCalls })); expect(r.ok, JSON.stringify(r)); return r })
await t('最初の1回はチュートリアルが出る（誰も見ていない時に「目を長押し」）', async () => {
  await toPlay(p); const s = await toSafe(p); await p.evaluate(() => SS.dbg.step(2))
  const h = await p.evaluate(() => ({ shown: !document.querySelector('#hint').hidden, text: document.querySelector('#hint').textContent, finger: !document.querySelector('#finger').hidden }))
  expect(h.shown && /長押し/.test(h.text) && h.finger, JSON.stringify({ s, h })); return h.text
})
await t('目を本物のマウスで押している間だけ寝る（離すと起きる）', async () => {
  const xy = await p.evaluate(() => SS.itemXY('eye'))
  await p.mouse.move(xy.x, xy.y); await p.mouse.down()
  await p.evaluate(() => SS.dbg.step(30))
  const a = await p.evaluate(() => ({ st: SS.run.g.st, depth: +SS.run.g.depth.toFixed(2), D: +SS.run.D.toFixed(1), lid: document.querySelector('#eye').classList.contains('hold') }))
  await p.mouse.up(); await p.evaluate(() => SS.dbg.step(40))
  const b = await p.evaluate(() => ({ st: SS.run.g.st }))
  expect(a.st === 'sleep' && a.depth > 0.3 && a.lid && b.st === 'awake', JSON.stringify({ a, b })); return { a, b }
})
await t('寝ると眠気が減り、起きていると増える', async () => {
  const r = await p.evaluate(() => { SS.dbg.hold(false); const d0 = SS.run.D; SS.dbg.step(60); const d1 = SS.run.D; return { d0, d1 } })
  expect(r.d1 > r.d0, JSON.stringify(r))
})
await t('見られている時に寝ると見つかり、言い訳ボタンが本物のクリックで押せる', async () => {
  const r0 = await p.evaluate(() => { const r = SS.run; SS.dbg.hold(true); let n = 0; while (!r.spot && n++ < 1500) SS.dbg.step(1); SS.dbg.hold(false); return { spot: !!r.spot, ex: !document.querySelector('#ex').disabled, txt: document.querySelector('#exTxt').textContent } })
  expect(r0.spot && r0.ex, JSON.stringify(r0))
  await p.evaluate(() => SS.dbg.step(1))
  await tapReal(p, 'ex'); await p.evaluate(() => SS.dbg.step(2))
  const r1 = await p.evaluate(() => ({ excuses: SS.run.excuses, st: SS.run.g.st, exposures: SS.run.exposures, bub: [...document.querySelectorAll('.bub')].map(b => b.textContent) }))
  expect(r1.excuses === 1 && r1.st === 'excuse' && r1.exposures === 0 && r1.bub.includes(r0.txt), JSON.stringify({ r0, r1 })); return { r0, r1 }
})
await t('言い訳しないとバレる（フォロワーが減り、記者のメモに印）', async () => {
  const r = await p.evaluate(() => { const r = SS.run; r.flags.trend = false; let n = 0; SS.dbg.step(120); const f0 = r.followers; SS.dbg.hold(true); while (!r.spot && n++ < 2000 && !r.over) { SS.dbg.step(1); if (r.g.st !== 'sleep' && !r.spot) { SS.dbg.hold(false); SS.dbg.step(1); SS.dbg.hold(true) } } SS.dbg.hold(false); SS.dbg.step(Math.ceil(SSCore.P.SPOT_WIN * 60) + 2); return { exp: r.exposures, df: +(r.followers - f0).toFixed(1), marks: document.querySelectorAll('#marks svg circle[stroke="#d8261c"]').length } })
  expect(r.exp === 1 && r.df < -10 && r.marks === 1, JSON.stringify(r)); return r
})
await t('いびき から 腕時計「睡眠を検知しました」で全員が見る', async () => {
  const r = await p.evaluate(() => {
    SS.start(99, { tutorial: false }); SS.dbg.pause(true); const r = SS.run, C = SSCore; let n = 0
    while (r.phase !== 'play') SS.dbg.step(1)
    // 見ている人を全部よそ見にして（検証用）、寝続ける
    for (const w of r.scene.ws) w.segs = [{ s: 0, e: 99, st: 'away' }]
    SS.dbg.hold(true); const ev = []
    while (n++ < 60 * 6 && !r.spot) { SS.dbg.step(1); for (const e of r.log) if (!ev.includes(e.type)) ev.push(e.type) }
    return { ev, watch: document.querySelector('#wMsg').textContent, cls: document.querySelector('#watch').className, spot: !!r.spot, depth: +r.g.depth.toFixed(2) }
  })
  expect(r.ev.includes('snore') && r.ev.includes('buzz') && r.spot && /検知しました/.test(r.watch), JSON.stringify(r)); return r
})
await t('何もしないと寝落ちで3回バレて週刊誌に載る（最低の判定 E）', async () => {
  const r = await p.evaluate(() => { SS.start(5, { tutorial: false }); SS.dbg.pause(true); SS.dbg.hold(false); const r = SS.run; let n = 0; while (!r.over && n++ < 60 * 400) SS.dbg.step(1); return r.result })
  expect(r.rank === 'E' && r.reason === 'scoop', JSON.stringify(r)); return { rank: r.rank, f: r.followers }
})
await t('ずっと寝ていても週刊誌に載る（E）', async () => {
  const r = await p.evaluate(() => { SS.start(5, { tutorial: false }); SS.dbg.pause(true); window.__ssBot = SSBot.BOTS.nap(); const r = SS.run; let n = 0; while (!r.over && n++ < 60 * 400) SS.dbg.step(1); window.__ssBot = null; return r.result })
  expect(r.rank === 'E', JSON.stringify(r)); return { rank: r.rank, f: r.followers }
})
let maxText = 0
await t('読んで寝る bot で1日を通せる（画面の文字は同時に2つまで）', async () => {
  const r = await p.evaluate(() => { SS.start(1074, { tutorial: false }); SS.dbg.pause(true); window.__ssBot = SSBot.BOTS.read(); const r = SS.run; let n = 0, mx = 0; while (!r.over && n++ < 60 * 400) { SS.dbg.step(1); mx = Math.max(mx, document.querySelectorAll('#fxl .bub').length) } window.__ssBot = null; return { res: r.result, mx } })
  maxText = r.mx
  expect(['S', 'A', 'B'].includes(r.res.rank) && r.mx <= 2, JSON.stringify(r)); return { rank: r.res.rank, f: r.res.followers, sleep: r.res.sleepMin, maxBubbles: r.mx }
})
await t('結果は週刊誌の表紙（判定は少し遅れて押される）・保存画像が描ける・Xの本文', async () => {
  await p.evaluate(() => SS.dbg.pause(false)); await p.waitForTimeout(1300)
  const before = await p.evaluate(() => getComputedStyle(document.querySelector('#rStamp')).opacity)
  await p.waitForTimeout(1400)
  const r = await p.evaluate(async () => { const cv = await SS.drawMag(); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 97) { const v = d[i]; s += v; s2 += v * v; n++ } return { vis: !document.querySelector('#vResult').hidden, head: document.querySelector('#rHead').textContent, rank: document.querySelector('#rRank').textContent, op: getComputedStyle(document.querySelector('#rStamp')).opacity, varc: Math.round(s2 / n - (s / n) ** 2), support: !!document.querySelector('#tmSupport'), supportTxt: document.querySelector('#tmSupport') && document.querySelector('#tmSupport').textContent } })
  expect(r.vis && r.head && Number(before) < 0.5 && Number(r.op) > 0.9 && r.varc > 300 && r.support && /枕/.test(r.supportTxt), JSON.stringify({ before, r })); return { head: r.head, rank: r.rank, support: r.supportTxt }
})
await t('「もう一回」を本物のクリックで押すと次の1日', async () => { await tapReal(p, 'again'); await p.waitForTimeout(200); const v = await p.evaluate(() => !document.querySelector('#vPlay').hidden && SS.run.idx === 0 && !SS.run.over); expect(v, v) })
await t('英語に切り替えられる', async () => {
  const q = await open(browser, { locale: 'en-US' })
  const r = await q.evaluate(() => ({ h: document.querySelector('#tTitle').textContent, start: document.querySelector('#bStart').textContent, lang: SS.lang() }))
  await q.screenshot({ path: ROOT + '/shots/v-en-title.png' })
  await q.close()
  expect(r.lang === 'en' && /Minute/.test(r.h) && /Start/.test(r.start), JSON.stringify(r)); return r
})
await t('途中でエラーが出ていない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await p.close()

// ---- 3サイズ × 全画面（日英）で一画面に収まる
for (const lang of ['ja', 'en']) for (const [w, h, name] of SIZES) {
  const q = await open(browser, { viewport: { width: w, height: h }, locale: lang === 'en' ? 'en-US' : 'ja-JP' })
  const views = {}
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${lang}-${name}-title.png` })
  await q.click('#bHow'); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${lang}-${name}-how.png` }); await q.click('#bHowBack')
  await q.evaluate(() => { SS.start(321, { tutorial: false }); SS.dbg.pause(true); SS.dbg.step(30) }); views.card = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${lang}-${name}-card.png` })
  await toPlay(q); await q.evaluate(() => SS.dbg.step(60)); views.play = await fit(q)
  const reach = await q.evaluate(() => ['eye', 'ex'].map(n => { const r = SS.itemXY(n); return r && r.y + r.h / 2 <= innerHeight && r.y - r.h / 2 >= 0 && r.w >= 44 }))
  await q.evaluate(() => { const r = SS.run; SS.dbg.hold(true); let n = 0; while (!r.spot && n++ < 2000) SS.dbg.step(1); SS.dbg.hold(false); SS.dbg.step(1) }); views.spot = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${lang}-${name}-spot.png` })
  // 吹き出し・掲示が画面の外に出ていない
  const bubOut = await q.evaluate(() => { const W = innerWidth; return [...document.querySelectorAll('#fxl .bub, #sign')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.left < -1 || r.right > W + 1) }).map(e => e.textContent) })
  await q.evaluate(() => { window.__ssBot = SSBot.BOTS.read(); const r = SS.run; let n = 0; while (!r.over && n++ < 60 * 400) SS.dbg.step(1); window.__ssBot = null; SS.dbg.pause(false) })
  await q.waitForTimeout(3200); views.result = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${lang}-${name}-result.png` })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${lang} ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, JSON.stringify(r)) })
  await t(`${lang} ${name}: 目と言い訳ボタンが画面内で44px以上`, async () => { expect(reach.every(Boolean), JSON.stringify(reach)) })
  await t(`${lang} ${name}: 吹き出しがはみ出さない`, async () => { expect(!bubOut.length, JSON.stringify(bubOut)) })
  await t(`${lang} ${name}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  await q.close()
}
await browser.close()

// ---- WebKit（iPhone 相当）: 本物のタップと押しっぱなし
const wb = await webkit.launch(), wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})
await t('WebKit: 始めるを本物のタップで押せる', async () => { await tapReal(wp, 'start', true); await wp.waitForTimeout(250); const v = await wp.evaluate(() => !document.querySelector('#vPlay').hidden); expect(v, v) })
await t('WebKit: タップのあとも実際には無音', async () => { const r = await wp.evaluate(() => ({ ok: window.__muteOk(), calls: window.__soundCalls })); expect(r.ok, JSON.stringify(r)); return r })
await t('WebKit: 目を本物の指で押している間だけ寝る', async () => {
  await toPlay(wp); await toSafe(wp)
  const xy = await wp.evaluate(() => SS.itemXY('eye'))
  // 指を置いたまま（touchstart から 進める から touchend）。WebKit の touchscreen は tap しか無いので、CDP 相当の低レベル入力の代わりに mouse を使う
  await wp.mouse.move(xy.x, xy.y); await wp.mouse.down(); await wp.evaluate(() => SS.dbg.step(30))
  const a = await wp.evaluate(() => SS.run.g.st)
  await wp.mouse.up(); await wp.evaluate(() => SS.dbg.step(30))
  const b = await wp.evaluate(() => SS.run.g.st)
  expect(a === 'sleep' && b === 'awake', a + '/' + b); return a + '/' + b
})
await t('WebKit: 言い訳を本物のタップで押せる', async () => {
  await wp.evaluate(() => { const r = SS.run; SS.dbg.hold(true); let n = 0; while (!r.spot && n++ < 2000) SS.dbg.step(1); SS.dbg.hold(false); SS.dbg.step(1) })
  await tapReal(wp, 'ex', true); await wp.evaluate(() => SS.dbg.step(2))
  const r = await wp.evaluate(() => ({ ex: SS.run.excuses, st: SS.run.g.st })); expect(r.ex === 1, JSON.stringify(r)); return r
})
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
