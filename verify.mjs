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
// 見つかるまで寝る（見ている人がいる時刻まで進めてから）
async function toSpot(p) { return p.evaluate(() => { const r = SS.run; SS.dbg.hold(true); let n = 0; while (!r.spot && n++ < 2500 && !r.over) { SS.dbg.step(1); if (r.g.st !== 'sleep' && !r.spot && r.g.st !== 'waking') { SS.dbg.hold(false); SS.dbg.step(1); SS.dbg.hold(true) } } SS.dbg.hold(false); SS.dbg.step(1); return { spot: !!r.spot, opts: r.spot && r.spot.opts, scene: r.scene.id } }) }
await t('見つかると言い訳の吹き出しが3つ出て、場面に合う言い訳を本物のクリックで選べる（軽く済む）', async () => {
  const r0 = await toSpot(p)
  const ui = await p.evaluate(() => ({ n: document.querySelectorAll('#choices .chc').length, vis: !document.querySelector('#choices').hidden, txt: [...document.querySelectorAll('#choices .chc')].map(b => b.textContent) }))
  expect(r0.spot && ui.n === 3 && ui.vis, JSON.stringify({ r0, ui }))
  const gi = await p.evaluate(() => SS.run.spot.opts.findIndex(id => SSCore.fitOf(id, SS.run.scene.id) === 'good'))
  const f0 = await p.evaluate(() => SS.run.followers), e0 = await p.evaluate(() => SS.run.exposures)
  await tapReal(p, 'c' + gi); await p.evaluate(() => SS.dbg.step(2))
  const r1 = await p.evaluate(() => { const e = SS.run.log.filter(e => e.type === 'excuse').pop(); return { excuses: SS.run.excuses, st: SS.run.g.st, exposures: SS.run.exposures, fit: e && e.fit, loss: e && e.loss, hidden: document.querySelector('#choices').hidden, bub: [...document.querySelectorAll('.bub')].map(b => b.textContent) } })
  expect(r1.excuses === 1 && r1.fit === 'good' && r1.exposures === e0 && r1.hidden && r1.bub.includes(ui.txt[gi]) && r1.loss < 1.5, JSON.stringify({ r0, ui, r1 })); return { scene: r0.scene, choices: ui.txt, picked: ui.txt[gi], loss: r1.loss, f0: +f0.toFixed(1) }
})
await t('場面とずれた言い訳は重く、ツッコミが返る（本物のクリック）', async () => {
  await p.evaluate(() => SS.dbg.step(150))
  const r0 = await toSpot(p)
  const bi = await p.evaluate(() => SS.run.spot.opts.findIndex(id => SSCore.fitOf(id, SS.run.scene.id) === 'bad'))
  await tapReal(p, 'c' + bi); await p.evaluate(() => SS.dbg.step(2))
  const r1 = await p.evaluate(() => { const e = SS.run.log.filter(e => e.type === 'excuse').pop(); const T = SS_TXT.ja; return { fit: e.fit, loss: e.loss, react: [...document.querySelectorAll('.bub')].map(b => b.textContent), want: T.reactBad[SS.run.scene.id] } })
  expect(r1.fit === 'bad' && r1.loss >= 3 && r1.react.includes(r1.want), JSON.stringify({ r0, r1 })); return r1
})
await t('言い訳の重さ: 合う < 普通 < ずれ、同じ言い訳の使い回しは重い、5回目から「影武者です」が出て1回だけ通る', async () => {
  const r = await p.evaluate(() => {
    const C = SSCore, out = {}
    const mk = () => { const run = C.makeRun(77); while (run.phase !== 'play') C.step(run, 1 / 60, {}); return run }
    const spotNow = run => { run.g.st = 'sleep'; run.g.depth = 0.5; for (const w of run.scene.ws) w.segs = [{ s: 0, e: 99, st: 'look', k: w.kind }]; let n = 0; while (!run.spot && n++ < 30) C.step(run, 1 / 60, { hold: true }); return run.spot }
    for (const fit of ['good', 'mid', 'bad']) { const run = mk(); const sp = spotNow(run); const i = sp.opts.findIndex(id => C.fitOf(id, run.scene.id) === fit); const f0 = run.followers; C.step(run, 1 / 60, { choice: i }); out[fit] = +(f0 - run.followers).toFixed(2) }
    const run = mk(); const ids = []; let kageAt = -1, kageOk = null, after = null
    for (let k = 1; k <= 7; k++) { run.grace = 0; const sp = spotNow(run); if (!sp) break; const ki = sp.opts.indexOf('kage'); if (ki >= 0 && kageAt < 0) { kageAt = k; const e0 = run.exposures; C.step(run, 1 / 60, { choice: ki }); kageOk = run.exposures === e0 } else { const g = sp.opts.findIndex(id => C.fitOf(id, run.scene.id) === 'good'); const e0 = run.exposures; ids.push(sp.opts[g]); C.step(run, 1 / 60, { choice: g }); if (kageAt > 0) after = run.exposures > e0 } for (let i = 0; i < 100; i++) C.step(run, 1 / 60, {}); if (run.over) break }
    const reuse = run.log.filter(e => e.type === 'excuse' && e.reuse > 0).length
    return { ...out, kageAt, kageOk, afterKageFails: after, reuse }
  })
  expect(r.good < r.mid && r.mid < r.bad && r.kageAt === 5 && r.kageOk && r.afterKageFails, JSON.stringify(r)); return r
})
await t('言い訳しないとバレる（フォロワーが減り、記者のメモに印）', async () => {
  const r = await p.evaluate(() => { const r = SS.run; r.flags.trend = false; SS.dbg.step(150); const f0 = r.followers, e0 = r.exposures; SS.dbg.hold(true); let n = 0; while (!r.spot && n++ < 2500 && !r.over) { SS.dbg.step(1); if (r.g.st !== 'sleep' && !r.spot) { SS.dbg.hold(false); SS.dbg.step(1); SS.dbg.hold(true) } } SS.dbg.hold(false); SS.dbg.step(Math.ceil(SSCore.P.SPOT_WIN * 60) + 2); return { exp: r.exposures - e0, df: +(r.followers - f0).toFixed(1), marks: document.querySelectorAll('#marks svg circle[stroke="#d8261c"]').length } })
  expect(r.exp === 1 && r.df < -10 && r.marks >= 1, JSON.stringify(r)); return r
})
// ---- 見る人ごとの合図
await t('見る人ごとに合図の長さが決まっていて、必ず合図のあとに見る（120日ぶんの予定を数えた）', async () => {
  const r = await p.evaluate(() => {
    const C = SSCore, len = {}, bad = [], kidStillLook = []
    for (let seed = 1; seed <= 120; seed++) {
      const run = C.makeRun(seed)
      for (let i = 0; i < C.SCENES.length; i++) {
        C.genScene(run, i)
        const sc = run.scene
        for (const w of sc.ws) {
          const sg = w.segs
          for (let j = 0; j < sg.length; j++) {
            if (sg[j].st !== 'look' || sg[j].s < 0.01) continue
            const prev = sg[j - 1]
            if (!prev || prev.st !== 'turn') { bad.push(sc.id + ':' + sg[j].k + ':' + (prev && prev.st)); continue }
            const k = sg[j].k; (len[k] = len[k] || []).push(prev.e - prev.s)
            if (k === 'kid') { const pp = sg[j - 2]; if (!pp || pp.st !== 'fidget') kidStillLook.push(sc.id) }
          }
        }
      }
    }
    const L = {}; for (const k in len) L[k] = { min: +Math.min(...len[k]).toFixed(2), max: +Math.max(...len[k]).toFixed(2), n: len[k].length }
    return { L, bad: bad.slice(0, 5), nbad: bad.length, kidStillLook: kidStillLook.length }
  })
  const want = { jour: 0.75, oba: 1.2, jii: 2.0, kid: 0.3, asst: 1.0, cam: 1.2, shacho: 1.0, phone: 1.4 }
  const ok = Object.entries(want).every(([k, v]) => r.L[k] && Math.abs(r.L[k].min - v) < 0.02 && Math.abs(r.L[k].max - v) < 0.02)
  expect(ok && r.nbad === 0 && r.kidStillLook === 0, JSON.stringify(r)); return r.L
})
await t('合図は画面で見える（人ごとの絵・擬音・光・指・コメント）', async () => {
  const r = await p.evaluate(() => {
    const C = SSCore, SCN = { cam: 0, oba: 1, kid: 1, jii: 1, jour: 4, asst: 3, shacho: 5, phone: 6 }, out = {}
    for (const [kind, sidx] of Object.entries(SCN)) {
      for (let seed = 11; seed < 40 && !out[kind]; seed++) {
        SS.start(seed, { tutorial: false }); SS.dbg.pause(true); const run = SS.run; let n = 0
        while ((run.idx < sidx || run.phase !== 'play') && !run.over && n++ < 60 * 300) { run.g.st = 'awake'; run.D = 30; SS.dbg.step(1) }
        if (run.idx !== sidx) continue
        const want = kind === 'kid' ? 'fidget' : 'turn'
        while (run.scene.t < run.scene.dur - 1 && n++ < 60 * 400) {
          run.D = 30
          const i = run.scene.ws.findIndex(w => C.wKind(w, run.scene.t) === kind), w = run.scene.ws[i]
          const sg = w && C.wSeg(w, run.scene.t)
          if (sg && sg.st === want && !sg.alert && run.scene.t - sg.s > 0.12) {
            const el = document.querySelector('#w' + i), img = el.querySelector('img'), mark = el.querySelector('.mark'), hand = el.querySelector('.hand svg'), chat = [...document.querySelectorAll('#chat p.h')].length
            const look = C.wState(w, run.scene.t) === 'look'
            out[kind] = { cls: el.className.replace(/^(spr w|cam|phonecam) /, ''), img: img ? img.getAttribute('src').replace(/img\/|\.webp/g, '') : '', mark: mark ? mark.textContent : '', hand: !!hand, chat, name: (el.querySelector('.nm') || {}).textContent, lookingYet: look }
            break
          }
          SS.dbg.step(1)
        }
      }
    }
    return out
  })
  const ok = r.jour && r.jour.mark && r.oba && /rustle/.test(r.oba.cls) && r.jii && r.jii.img === 'aud2_hear' && r.kid && /fidget/.test(r.kid.cls) && r.asst && /glow/.test(r.asst.cls) && r.cam && r.cam.hand && r.shacho && r.shacho.img === 'shacho_turn' && r.phone && r.phone.chat > 0 && Object.values(r).every(v => !v.lookingYet && v.name)
  expect(ok, JSON.stringify(r)); return r
})
await t('子どもはじっとしている間は見ない（そわそわ中だけ見る）', async () => {
  const r = await p.evaluate(() => { const C = SSCore; let still = 0, lookAfterStill = 0; for (let s = 1; s < 60; s++) { const run = C.makeRun(s); C.genScene(run, 1); const w = run.scene.ws.find(w => w.kind === 'kid'); for (let j = 1; j < w.segs.length; j++) { if (w.segs[j - 1].st === 'still') { still++; if (w.segs[j].st === 'look' || w.segs[j].st === 'turn') lookAfterStill++ } } } return { still, lookAfterStill } })
  expect(r.still > 50 && r.lookAfterStill === 0, JSON.stringify(r)); return r
})
// ---- 寝言・変装・傾き
await t('寝言: 熟睡で寝言を言い、聞かれると「深い…」でフォロワーが増える（バレない）', async () => {
  const r = await p.evaluate(() => {
    const C = SSCore; C.P.MUTTER_P = 1; C.P.VIRAL_P = 1
    SS.start(31, { tutorial: false }); SS.dbg.pause(true); const run = SS.run; let n = 0
    while ((run.idx < 4 || run.phase !== 'play') && n++ < 60 * 300) { run.g.st = 'awake'; run.D = 30; SS.dbg.step(1) }
    for (const w of run.scene.ws) w.segs = [{ s: 0, e: 99, st: 'away', k: w.kind }]
    SS.dbg.hold(true); n = 0; while (!run.mutter && n++ < 400) SS.dbg.step(1)
    const mut = !!run.mutter, bub = [...document.querySelectorAll('.bub.mut')].map(b => b.textContent)
    const f0 = run.followers, e0 = run.exposures
    n = 0; while (!run.log.some(e => e.type === 'viral') && !run.spot && n++ < 300) SS.dbg.step(1)
    SS.dbg.hold(false); SS.dbg.step(2)
    C.P.MUTTER_P = 0.12; C.P.VIRAL_P = 0.5
    return { mut, bub, viral: run.log.some(e => e.type === 'viral'), df: +(run.followers - f0).toFixed(1), exp: run.exposures - e0, quote: run.quotes.length, react: [...document.querySelectorAll('.bub')].map(b => b.textContent), tag: !!document.querySelector('#trendTag') }
  })
  expect(r.mut && r.bub.length && r.viral && r.df >= 5 && r.exp === 0 && r.react.includes('深い…'), JSON.stringify(r)); return r
})
await t('寝言はまれ（読む bot 40日で何回出て、何回「深い…」になったか）', async () => {
  const r = await p.evaluate(() => { const C = SSCore; let m = 0, v = 0; for (let s = 1; s <= 40; s++) { const run = C.makeRun(1000 + s * 37), bot = SSBot.BOTS.reader(); for (let i = 0; i < 60 * 400 && !run.over; i++) C.step(run, 1 / 60, bot(run, 1 / 60)); m += run.quotes.length; v += run.viral.length } return { mutterPerDay: +(m / 40).toFixed(2), viralPerDay: +(v / 40).toFixed(2) } })
  expect(r.viralPerDay > 0 && r.viralPerDay < 0.8 && r.mutterPerDay < 4, JSON.stringify(r)); return r
})
await t('変装: 朝のスタイリストからサングラス（数1）→ 本物のクリックで掛ける → うとうとなら見られても平気 → 熟睡でずれてバレる', async () => {
  await p.evaluate(() => { SS.start(5, { tutorial: false }); SS.dbg.pause(true); const r = SS.run; let n = 0; while ((r.phase !== 'play' || r.scene.t < 1.4) && n++ < 600) SS.dbg.step(1) })
  const a = await p.evaluate(() => ({ items: SS.run.items.slice(), n: document.querySelector('#itN').textContent, dis: document.querySelector('#item').disabled, bub: [...document.querySelectorAll('.bub')].map(b => b.textContent) }))
  await tapReal(p, 'item'); await p.evaluate(() => SS.dbg.step(2))
  const b = await p.evaluate(() => ({ wear: SS.run.wear && SS.run.wear.id, items: SS.run.items.length, dis: document.querySelector('#item').disabled, glass: !!document.querySelector('#gGlass svg') }))
  const c = await p.evaluate(() => { const r = SS.run; for (const w of r.scene.ws) w.segs = [{ s: 0, e: 99, st: 'look', k: 'cam' }]; SS.dbg.hold(true); SS.dbg.step(60); return { st: r.g.st, depth: +r.g.depth.toFixed(2), spot: !!r.spot, src: document.querySelector('#guruImg').getAttribute('src') } })
  const d = await p.evaluate(() => { const r = SS.run; let n = 0; while (!r.spot && n++ < 120) SS.dbg.step(1); SS.dbg.hold(false); return { spot: !!r.spot, slip: r.log.some(e => e.type === 'slip'), depth: r.spot && +r.spot.depth.toFixed(2) } })
  await p.evaluate(() => SS.dbg.step(140))
  expect(a.items[0] === 'shades' && a.n === '×1' && !a.dis && b.wear === 'shades' && b.items === 0 && b.dis && b.glass && c.st === 'sleep' && !c.spot && /shades/.test(c.src) && d.spot && d.slip && d.depth >= 1.8, JSON.stringify({ a, b, c, d })); return { a, b, c, d }
})
await t('変装: 室内で記者に長く見られると「室内でサングラス…？」、続けると見破られる', async () => {
  const r = await p.evaluate(() => {
    SS.start(8, { tutorial: false }); SS.dbg.pause(true); const run = SS.run; let n = 0
    while ((run.idx < 2 || run.phase !== 'play' || run.scene.t < 4.2) && n++ < 60 * 300) { run.g.st = 'awake'; run.D = 30; SS.dbg.step(1) }
    const items = run.items.slice()
    const j = run.scene.ws.findIndex(w => w.kind === 'jour')
    run.scene.ws.forEach((w, i) => { w.segs = [{ s: 0, e: 99, st: i === j ? 'look' : 'away', k: w.kind }] })
    SS.dbg.item(); SS.dbg.step(1)
    const id = run.wear && run.wear.id
    SS.dbg.step(Math.ceil(60 * 2.1)); const warn = [...document.querySelectorAll('.bub')].map(b => b.textContent)
    SS.dbg.step(Math.ceil(60 * 2.6))
    SS.dbg.hold(true); n = 0; while (!run.spot && n++ < 60) SS.dbg.step(1); SS.dbg.hold(false)
    return { items, id, warn, sus: +run.sus.toFixed(1), seenThrough: !!run.spot && run.g.depth < 1.8 }
  })
  expect(r.id === 'shades' && r.warn.some(s => /サングラス/.test(s)) && r.seenThrough, JSON.stringify(r)); return r
})
await t('傾き: 立ったまま熟睡すると体が傾き、倒れるとバレる（全員が見る）。浅く刻めば戻る', async () => {
  const r = await p.evaluate(() => {
    SS.start(9, { tutorial: false }); SS.dbg.pause(true); const run = SS.run; let n = 0
    while (run.phase !== 'play' && n++ < 300) SS.dbg.step(1)
    for (const w of run.scene.ws) w.segs = [{ s: 0, e: 99, st: 'away', k: 'cam' }]
    SS.dbg.hold(true); SS.dbg.step(150); const t1 = +run.tilt.toFixed(2), rot = document.querySelector('#guru').style.transform
    SS.dbg.hold(false); SS.dbg.step(90); const t2 = +run.tilt.toFixed(2)
    const e0 = run.exposures; SS.dbg.hold(true); n = 0; while (!run.log.some(e => e.type === 'fall') && n++ < 600) SS.dbg.step(1); SS.dbg.hold(false); SS.dbg.step(2)
    return { t1, rot, t2, fell: run.log.some(e => e.type === 'fall'), exp: run.exposures - e0, src: document.querySelector('#guruImg').getAttribute('src') }
  })
  expect(r.t1 > 0.3 && /rotate/.test(r.rot) && r.t2 < r.t1 && r.fell && r.exp === 1 && /collapse/.test(r.src), JSON.stringify(r)); return r
})
await t('いびき から 腕時計「睡眠を検知しました」で全員が見る', async () => {
  const r = await p.evaluate(() => {
    SS.start(99, { tutorial: false, tilt: false }); SS.dbg.pause(true); const r = SS.run, C = SSCore; let n = 0; C.P.MUTTER_P = 0
    while (r.phase !== 'play') SS.dbg.step(1)
    // 見ている人を全部よそ見にして（検証用）、寝続ける
    for (const w of r.scene.ws) w.segs = [{ s: 0, e: 99, st: 'away' }]
    SS.dbg.hold(true); const ev = []
    while (n++ < 60 * 6 && !r.spot) { SS.dbg.step(1); for (const e of r.log) if (!ev.includes(e.type)) ev.push(e.type) }
    C.P.MUTTER_P = 0.12
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
  const r = await p.evaluate(() => { SS.start(1074, { tutorial: false }); SS.dbg.pause(true); window.__ssBot = SSBot.BOTS.reader(); const r = SS.run; let n = 0, mx = 0; while (!r.over && n++ < 60 * 400) { SS.dbg.step(1); mx = Math.max(mx, document.querySelectorAll('#fxl .bub').length) } window.__ssBot = null; return { res: r.result, mx } })
  maxText = r.mx
  expect(['S', 'A', 'B'].includes(r.res.rank) && r.mx <= 2, JSON.stringify(r)); return { rank: r.res.rank, f: r.res.followers, sleep: r.res.sleepMin, maxBubbles: r.mx }
})
await t('結果は週刊誌の表紙（判定は少し遅れて押される）・保存画像が描ける・Xの本文', async () => {
  await p.evaluate(() => SS.dbg.pause(false)); await p.waitForTimeout(1300)
  const before = await p.evaluate(() => getComputedStyle(document.querySelector('#rStamp')).opacity)
  await p.waitForTimeout(1400)
  const r = await p.evaluate(async () => { const cv = await SS.drawMag(); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 97) { const v = d[i]; s += v; s2 += v * v; n++ } return { vis: !document.querySelector('#vResult').hidden, head: document.querySelector('#rHead').textContent, rank: document.querySelector('#rRank').textContent, op: getComputedStyle(document.querySelector('#rStamp')).opacity, varc: Math.round(s2 / n - (s / n) ** 2), support: !!document.querySelector('#tmSupport'), supportTxt: document.querySelector('#tmSupport') && document.querySelector('#tmSupport').textContent, quote: document.querySelector('#rQuote').textContent } })
  expect(r.vis && r.head && Number(before) < 0.5 && Number(r.op) > 0.9 && r.varc > 300 && r.support && /枕/.test(r.supportTxt), JSON.stringify({ before, r })); return { head: r.head, rank: r.rank, support: r.supportTxt, quote: r.quote }
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
  const reach = await q.evaluate(() => ['eye', 'item'].map(n => { const r = SS.itemXY(n); return r && r.y + r.h / 2 <= innerHeight && r.y - r.h / 2 >= 0 && r.w >= 44 }))
  await q.evaluate(() => { const r = SS.run; SS.dbg.hold(true); let n = 0; while (!r.spot && n++ < 2000) SS.dbg.step(1); SS.dbg.hold(false); SS.dbg.step(1) }); views.spot = await fit(q); await q.waitForTimeout(400); await q.screenshot({ path: `${ROOT}/shots/fit-${lang}-${name}-spot.png` })
  const chReach = await q.evaluate(() => ['c0', 'c1', 'c2'].map(n => { const r = SS.itemXY(n); return r && r.y + r.h / 2 <= innerHeight && r.x - r.w / 2 >= 0 && r.x + r.w / 2 <= innerWidth && r.h >= 44 }))
  // 吹き出し・掲示が画面の外に出ていない
  const bubOut = await q.evaluate(() => { const W = innerWidth; return [...document.querySelectorAll('#fxl .bub, #sign, #fxl .tip, #choices .chc')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.left < -1 || r.right > W + 1) }).map(e => e.textContent) })
  await q.evaluate(() => { window.__ssBot = SSBot.BOTS.reader(); const r = SS.run; let n = 0; while (!r.over && n++ < 60 * 400) SS.dbg.step(1); window.__ssBot = null; SS.dbg.pause(false) })
  await q.waitForTimeout(3200); views.result = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${lang}-${name}-result.png` })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${lang} ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, JSON.stringify(r)) })
  await t(`${lang} ${name}: 目と変装ボタンが画面内で44px以上`, async () => { expect(reach.every(Boolean), JSON.stringify(reach)) })
  await t(`${lang} ${name}: 言い訳の3択が画面内で44px以上`, async () => { expect(chReach.every(Boolean), JSON.stringify(chReach)) })
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
await t('WebKit: 言い訳の吹き出しを本物のタップで選べる', async () => {
  await toSpot(wp)
  await tapReal(wp, 'c1', true); await wp.evaluate(() => SS.dbg.step(2))
  const r = await wp.evaluate(() => ({ ex: SS.run.excuses, st: SS.run.g.st, id: (SS.run.log.filter(e => e.type === 'excuse').pop() || {}).id })); expect(r.ex === 1 && r.st === 'excuse', JSON.stringify(r)); return r
})
await t('WebKit: 変装ボタンを本物のタップで押せる', async () => {
  await wp.evaluate(() => { SS.start(5, { tutorial: false }); SS.dbg.pause(true); const r = SS.run; let n = 0; while ((r.phase !== 'play' || r.scene.t < 1.4) && n++ < 600) SS.dbg.step(1) })
  await tapReal(wp, 'item', true); await wp.evaluate(() => SS.dbg.step(2))
  const r = await wp.evaluate(() => ({ wear: SS.run.wear && SS.run.wear.id, left: SS.run.items.length })); expect(r.wear === 'shades' && r.left === 0, JSON.stringify(r)); return r
})
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
// ページを離れた時に音を止める（2026-11-11 練り消し: 横丁に戻っても iPhone で BGM が鳴り続けた）。音は鳴らさない（mute.mjs）
{
  const awb = await webkit.launch(), ap = await open(awb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await t('WebKit: 裏に回ると BGM と環境音が止まり suspend。戻っても触るまで鳴らない（bfcache の pageshow でも）', async () => {
    await ap.evaluate(() => { Snd.init(); 0; Snd.loop('awayTest', Object.values(Snd.files).flat()[0], 0.2) })
    await ap.waitForFunction(() => Snd.playing().length >= 1, null, { timeout: 15000 })
    const r = await ap.evaluate(async () => {
      const c = Snd.ctx; let sus = 0; const os = c.suspend.bind(c); c.suspend = () => { sus++; return os() }
      const before = Snd.playing().length
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))
      const hid = { away: Snd.away, playing: Snd.playing().length, sus, gain: Snd.master.gain.value }
      const name = Object.keys(Snd.files)[0], src = Snd.play(name); Snd.loop('awayTest2', Object.values(Snd.files).flat()[0], 0.2)   // 裏にいる間の音は鳴らさない
      await new Promise(r => setTimeout(r, 400)); const quiet = { playing: Snd.playing().length, src: src === null }
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
      await new Promise(r => setTimeout(r, 400)); const back = { away: Snd.away, playing: Snd.playing().length, gain: Snd.master.gain.value }
      Snd.loop('awayTest2', null)
      return { before, hid, quiet, back }
    })
    await ap.touchscreen.tap(12, 300); await ap.waitForTimeout(800)
    const after = await ap.evaluate(() => ({ away: Snd.away, playing: Snd.playing().length, wake: Snd.life.wake, mute: window.__muteOk() }))
    const pe = ap.errs.filter(e => e.startsWith('pageerror'))
    expect(r.before >= 1 && r.hid.away && r.hid.playing === 0 && r.hid.sus === 1 && r.hid.gain === 0 && r.quiet.playing === 0 && r.quiet.src && r.back.away && r.back.playing === 0 && r.back.gain === 0 && !after.away && after.playing >= r.before && after.wake === 1 && after.mute && !pe.length, JSON.stringify({ r, after, pe }))
    return { before: r.before, after: after.playing }
  })
  await t('WebKit: 別のページへ移る（pagehide）と止まり、戻るで戻っても鳴っていない', async () => {
    await ap.evaluate(() => addEventListener('pagehide', () => { try { sessionStorage.setItem('awayHide', JSON.stringify({ away: Snd.away, playing: Snd.playing().length, hide: Snd.life.hide })) } catch (e) {} }))
    await ap.goto(URL0 + 'privacy.html'); await ap.waitForTimeout(300)
    const hid = await ap.evaluate(() => sessionStorage.getItem('awayHide'))
    await ap.goBack(); await ap.waitForFunction(() => typeof Snd === 'object' && document.readyState === 'complete', null, { timeout: 30000 }); await ap.waitForTimeout(800)
    const back = await ap.evaluate(() => ({ playing: Snd.playing().length, ctx: !!Snd.ctx, away: Snd.away, mute: window.__muteOk() }))
    const h = JSON.parse(hid || '{}')
    expect(h.away && h.playing === 0 && back.playing === 0 && back.mute, JSON.stringify({ h, back })); return { h, back }
  })
  await awb.close()
}
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
