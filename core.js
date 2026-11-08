// 1日3分しか寝ない男 の中身（画面に依存しない）。game.js と sim.mjs の両方が使う
// 同じ seed と同じ入力なら同じ結果になる（乱数は seed から作るものだけ）
;(function (root) {
  'use strict'
  // ---- 数字（ideas/short-sleeper.md と合わせる）
  const P = {
    D0: 40,            // 始まりの眠気
    RISE: 4.2,         // 起きている間に増える眠気 /秒
    REST_LIGHT: 3.5,   // うとうと中に減る眠気 /秒
    REST_DEEP: 9,      // 熟睡中に減る眠気 /秒
    DEEP: 1.8,         // ここから熟睡（よく回復する）
    SNORE: 3.2,        // ここからいびき（周りの人が振り向き始める）
    WARN: 3.6,         // 腕時計が光り始める
    BUZZ: 4.6,         // 腕時計が「睡眠を検知しました」と鳴る（全員がこっちを見る）
    WAKE_LIGHT: 0.15,  // 離してから目が開くまで（うとうと）
    WAKE_DEEP: 0.5,    // 離してから目が開くまで（熟睡。はっ）
    FORCED: 3.6,       // 眠気が満タンで勝手に寝てしまう長さ
    SPOT_WIN: 1.25,    // 見つかってから言い訳できる時間（その間、時間は止まる）
    POSE: 1.3,         // 言い訳・はっ のポーズの長さ
    FOLLOW0: 100,      // フォロワー（万）
    GAIN: 0.05,        // 見られている間に起きていると増える（万/秒）
    EXPOSE: 12,        // バレたら減る（万）
    TREND: 18,         // 生放送で寝て「究極の瞑想」でトレンド入り（万）
    EXCUSE_K: 1.2,     // k回目の言い訳で減る = k × これ（万）
    EXCUSE_MAX: 5,     // 6回目からは信じてもらえない（バレたのと同じ）
    OUT: 3,            // 3回バレたら週刊誌に載って終わり
    SLEEP_MIN: 10,     // 実睡眠: 遊びの1秒 = 10分
    CARD: 1.6,         // 場面の間の手帳の時間
  }
  // ---- 1日の予定。w = 見る人。win = 全員が見ていない時間（VTR・ワークなど）
  const SCENES = [
    { id: 'tv', clock: '7:00', dur: 20, w: [{ t: 'cam', id: 'camA' }, { t: 'cam', id: 'camB' }], win: { n: 2, len: [4.5, 6.2] } },
    { id: 'seminar', clock: '10:00', dur: 22, w: [{ t: 'aud', who: 0 }, { t: 'aud', who: 1 }, { t: 'aud', who: 2 }, { t: 'jour' }], win: { n: 1, len: [5, 6.5] } },
    { id: 'sign', clock: '12:30', dur: 20, w: [{ t: 'fan' }, { t: 'asst' }, { t: 'jour' }], win: { n: 1, len: [3.5, 5] } },
    { id: 'gym', clock: '15:00', dur: 18, w: [{ t: 'cam', id: 'camG' }, { t: 'asst' }], win: { n: 1, len: [4, 5.5] } },
    { id: 'interview', clock: '17:00', dur: 20, w: [{ t: 'jour', near: true }, { t: 'asst' }], win: { n: 1, len: [5.5, 7] } },
    { id: 'dinner', clock: '19:30', dur: 20, w: [{ t: 'aud', who: 0 }, { t: 'aud', who: 1 }, { t: 'asst' }], win: { n: 1, len: [5, 6.5] } },
    { id: 'live', clock: '23:00', dur: 20, w: [{ t: 'phone' }, { t: 'asst' }], win: { n: 2, len: [3.5, 5] } },
  ]
  // 見る人の癖: away=よそ見の長さ turn=合図（顔を上げる・ランプ点滅）の長さ look=見ている長さ hear=いびきで振り向くか
  const KIND = {
    cam: { away: [2.5, 5], turn: [1.2, 1.2], look: [3, 5.5], hear: false },
    phone: { away: [0, 0], turn: [1.2, 1.2], look: [99, 99], hear: false },
    aud: { away: [2.2, 6], turn: [1.1, 1.4], look: [1.6, 3.6], hear: true },
    aud2: { away: [4.5, 9], turn: [1.2, 1.5], look: [1.4, 2.6], hear: true },   // おじいさん。よく居眠りしている
    jour: { away: [2.4, 5.6], turn: [0.8, 1.0], look: [1.6, 3.4], hear: true },
    asst: { away: [3, 6.5], turn: [1.1, 1.4], look: [1.2, 2.4], hear: true },
    fan: { away: [3, 4.8], turn: [1.1, 1.3], look: [2, 3.2], hear: true },
  }
  const EXCUSES = 8   // 言い訳の台詞の数（data.js）

  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
  const rr = (R, a, b) => a + (b - a) * R()

  // 全員が見ていない時間を置く
  function placeWins(R, S, tut) {
    const out = []
    if (!S.win.n) return out
    for (let i = 0; i < S.win.n; i++) {
      for (let k = 0; k < 40; k++) {
        const len = rr(R, S.win.len[0], S.win.len[1])
        const lo = 2.6, hi = S.dur - len - 1.2
        let s = tut && i === 0 ? 2.8 : rr(R, lo, hi)
        if (out.every(w => s > w.e + 2.5 || s + len < w.s - 2.5)) { out.push({ s, e: s + len }); break }
      }
    }
    return out.sort((a, b) => a.s - b.s)
  }
  // 1人ぶんの予定（awayからturnからlook のくり返し）。全員が見ていない時間には look を置かない
  function segs(R, kind, dur, wins, startLook) {
    const K = KIND[kind], out = []
    let t = 0
    if (startLook) { const l = rr(R, 1.2, 2.2); out.push({ s: 0, e: l, st: 'look' }); t = l }
    if (kind === 'phone') {   // 配信: ずっと映っている。通信が不安定な時だけ止まる
      let c = 0
      for (const w of wins) {
        if (w.s - 1.2 > c) out.push({ s: c, e: w.s, st: 'look' })
        out.push({ s: w.s, e: w.e - 1.2, st: 'away' }); out.push({ s: w.e - 1.2, e: w.e, st: 'turn' }); c = w.e
      }
      out.push({ s: c, e: dur + 5, st: 'look' }); return out
    }
    while (t < dur + 3) {
      let away = rr(R, K.away[0], K.away[1]), turn = rr(R, K.turn[0], K.turn[1]), look = rr(R, K.look[0], K.look[1])
      for (const w of wins) {
        const ts = t + away
        if (ts < w.e && ts + turn + look > w.s - 0.3) {
          if (ts + turn + 0.8 <= w.s - 0.3) look = w.s - 0.3 - (ts + turn)
          else away = w.e - t + rr(R, 0.2, 1.0)
        }
      }
      out.push({ s: t, e: t + away, st: 'away' }); t += away
      out.push({ s: t, e: t + turn, st: 'turn' }); t += turn
      out.push({ s: t, e: t + look, st: 'look' }); t += look
    }
    return out
  }
  // カメラ2台（生放送）: どちらか一方が映っている。切り替えの前に次のカメラのランプが点滅する
  function camPair(R, dur, wins) {
    const a = [], b = []
    let t = 0, on = R() < 0.5 ? 0 : 1
    const push = (arr, s, e, st) => { if (e > s) arr.push({ s, e, st }) }
    while (t < dur + 3) {
      let shot = rr(R, 2.4, 4.6)
      const w = wins.find(w => w.e > t && w.s < t + shot + 1.2)
      if (w) {   // VTR の前までこのカメラ から VTR（両方消える）から 明ける前に次のカメラが点滅
        const end = Math.max(t + 0.6, w.s)
        push(on ? b : a, t, end, 'look'); push(on ? a : b, t, end, 'away')
        const nx = R() < 0.5 ? 0 : 1
        push(a, end, w.e - (nx === 0 ? 1.2 : 0), 'away'); push(b, end, w.e - (nx === 1 ? 1.2 : 0), 'away')
        push(nx === 0 ? a : b, w.e - 1.2, w.e, 'turn')
        t = w.e; on = nx; continue
      }
      // このカメラで shot 秒 から 終わる1.2秒前から次のカメラが点滅
      const cur = on ? b : a, nxt = on ? a : b
      push(cur, t, t + shot, 'look'); push(nxt, t, t + shot - 1.2, 'away'); push(nxt, t + shot - 1.2, t + shot, 'turn')
      // 切り替えのすき間（スタジオ全体の引きの画）: たまに 1.5〜3 秒、両方消える
      t += shot; on = 1 - on
      if (R() < 0.3) { const g = rr(R, 1.5, 3); push(cur, t, t + g, 'away'); push(nxt, t, t + g - 1.2, 'away'); push(nxt, t + g - 1.2, t + g, 'turn'); t += g }
    }
    return [a, b]
  }

  function genScene(run, idx) {
    const S = SCENES[idx], R = run.R
    const tut = run.tutorial && idx === 0
    const wins = placeWins(R, S, tut)
    let pair = null
    if (S.id === 'tv') pair = camPair(R, S.dur, wins)
    const ws = S.w.map((spec, i) => {
      let kind = spec.t
      if (kind === 'aud' && spec.who === 2) kind = 'aud2'
      const sg = pair ? pair[i] : segs(R, kind, S.dur, wins, kind !== 'cam' || S.id !== 'gym')
      return { ...spec, kind, segs: sg, ov: [], cd: 0, who: spec.who != null ? spec.who : (kind === 'fan' ? 0 : null) }
    })
    // まれ: 記者も寝ている（ある場面の途中で 6〜8 秒）
    if (run.flags.jSleepScene === idx) {
      const j = ws.find(w => w.kind === 'jour')
      if (j) { const s = rr(R, 4, S.dur - 10), e = s + rr(R, 6, 8); j.segs = cutIn(j.segs, s, e, 'zzz') }
    }
    // まれ: 助手が配信中に寝落ち
    if (run.flags.asstSleep && S.id === 'live') {
      const a = ws.find(w => w.kind === 'asst'); if (a) a.segs = cutIn(a.segs, 3, S.dur - 3, 'zzz')
    }
    // サイン会のファンは、見るたびに次の人に替わる
    if (S.id === 'sign') { let who = Math.floor(R() * 3); const f = ws.find(w => w.kind === 'fan'); for (const s of f.segs) { if (s.st === 'turn') who = (who + 1) % 3; s.who = who } }
    run.scene = { idx, id: S.id, dur: S.dur, wins, ws, t: 0 }
  }
  // [s,e] を st で上書きし、明けたら合図（1秒）から見る
  function cutIn(sg, s, e, st) {
    const out = []
    for (const g of sg) {
      if (g.e <= s || g.s >= e + 2.4) out.push(g)
      else { if (g.s < s) out.push({ ...g, e: s }); if (g.e > e + 2.4) out.push({ ...g, s: e + 2.4 }) }
    }
    out.push({ s, e, st }, { s: e, e: e + 1.0, st: 'turn' }, { s: e + 1.0, e: e + 2.4, st: 'look' })
    return out.sort((a, b) => a.s - b.s)
  }

  function wState(w, t) {
    for (let i = w.ov.length - 1; i >= 0; i--) { const o = w.ov[i]; if (t >= o.s && t < o.e) return o.st }
    for (const g of w.segs) if (t >= g.s && t < g.e) return g.st
    return 'away'
  }
  function wWho(w, t) { if (w.kind !== 'fan') return w.who; for (const g of w.segs) if (t >= g.s && t < g.e) return g.who; return 0 }

  function makeRun(seed, opt = {}) {
    const R = mulberry(seed >>> 0 || 1)
    const flags = {
      trend: R() < 0.15,                                  // 生放送で寝ると「究極の瞑想」でトレンド入り
      jSleepScene: R() < 0.25 ? [1, 2, 4][Math.floor(R() * 3)] : -1,   // 記者も寝ている
      asstSleep: R() < 0.2,                               // 深夜の配信で助手が寝落ち
    }
    const run = {
      seed, R, flags, tutorial: !!opt.tutorial,
      phase: 'card', cardT: 0, idx: 0, t: 0,
      D: P.D0, sleepSec: 0, deepSec: 0,
      g: { st: 'awake', depth: 0, left: 0 }, latch: false,
      spot: null, grace: 0,
      followers: P.FOLLOW0, exposures: 0, excuses: 0, forced: 0, snores: 0, buzzes: 0, drools: 0,
      trended: false, jSlept: false, asstSlept: false, peakD: P.D0,
      ev: [], log: [], over: false, reason: '',
    }
    genScene(run, 0)
    return run
  }
  const asleep = run => run.g.st === 'sleep' || run.g.st === 'waking' || run.g.st === 'forced'
  const emit = (run, type, o) => { const e = { type, t: run.t, scene: run.idx, ...(o || {}) }; run.ev.push(e); run.log.push(e) }

  function alertAll(run, kind) {   // いびき: 聞こえる人が振り向く / 腕時計: 全員がすぐ見る
    const sc = run.scene, t = sc.t
    sc.ws.forEach((w, i) => {
      const st = wState(w, t)
      if (kind === 'buzz') { w.ov.push({ s: t, e: t + 2.5, st: 'look' }); return }
      if (!KIND[w.kind].hear || st === 'look' || st === 'turn' || st === 'zzz') return
      w.ov.push({ s: t, e: t + 0.9, st: 'turn' }, { s: t + 0.9, e: t + 3.4, st: 'look' })
      emit(run, 'alert', { w: i })
    })
  }

  // inp: { hold: 押している, excuse: 言い訳ボタンを押した（その瞬間だけ true） }
  function step(run, dt, inp) {
    if (run.over) return
    run.t += dt
    if (run.phase === 'card') {
      run.cardT += dt
      if (!inp.hold) run.latch = false
      if (run.cardT >= P.CARD) { run.phase = 'play'; emit(run, 'scene', { id: run.scene.id }) }
      return
    }
    const sc = run.scene, g = run.g
    // ---- 見つかった瞬間（時間が止まる。言い訳できるのはこの間だけ）
    if (run.spot) {
      run.spot.left -= dt
      if (inp.excuse) return resolveSpot(run, true)
      if (run.spot.left <= 0) return resolveSpot(run, false)
      return
    }
    sc.t += dt
    const t = sc.t
    if (run.grace > 0) run.grace -= dt
    for (const w of sc.ws) { const st = wState(w, t); if (st === 'zzz') { if (w.kind === 'jour') run.jSlept = true; if (w.kind === 'asst') run.asstSlept = true } }

    // ---- 指と体
    if (!inp.hold) run.latch = false
    const want = inp.hold && !run.latch
    if (g.st === 'excuse' || g.st === 'startle') {
      g.left -= dt; if (g.left <= 0) { g.st = 'awake'; g.depth = 0 }
    } else if (g.st === 'forced') {
      g.depth += dt; g.left -= dt
      if (g.left <= 0) { g.st = 'waking'; g.left = P.WAKE_DEEP; run.latch = true }
    } else if (g.st === 'waking') {
      g.left -= dt; if (g.left <= 0) { g.st = 'awake'; g.depth = 0 }
    } else if (g.st === 'sleep') {
      if (!want) { g.st = 'waking'; g.left = g.depth >= P.DEEP ? P.WAKE_DEEP : P.WAKE_LIGHT; emit(run, 'wake', { deep: g.depth >= P.DEEP }) }
      else g.depth += dt
    } else if (g.st === 'awake') {
      if (run.D >= 100) { g.st = 'forced'; g.depth = P.DEEP; g.left = P.FORCED; run.forced++; emit(run, 'forced') }
      else if (want) { g.st = 'sleep'; g.depth = 0; emit(run, 'sleep') }
    }
    // ---- いびきと腕時計
    if (asleep(run) && g.st !== 'waking') {
      const d0 = g.depth - dt
      if (d0 < P.SNORE && g.depth >= P.SNORE) { run.snores++; emit(run, 'snore'); alertAll(run, 'snore') }
      if (d0 < P.WARN && g.depth >= P.WARN) emit(run, 'warn')
      if (d0 < P.BUZZ && g.depth >= P.BUZZ) { run.buzzes++; emit(run, 'buzz'); alertAll(run, 'buzz') }
      if (d0 < 2.6 && g.depth >= 2.6) run.drools++
    }
    // ---- 眠気
    if (asleep(run)) {
      const deep = g.depth >= P.DEEP
      run.D = Math.max(0, run.D - (deep ? P.REST_DEEP : P.REST_LIGHT) * dt)
      run.sleepSec += dt; if (deep) run.deepSec += dt
    } else if (g.st === 'awake') {
      run.D = Math.min(100, run.D + P.RISE * dt)
    }
    run.peakD = Math.max(run.peakD, run.D)
    // ---- 見られているか
    let looking = -1
    sc.ws.forEach((w, i) => { if (w.cd > 0) w.cd -= dt; if (looking < 0 && wState(w, t) === 'look' && w.cd <= 0) looking = i })
    if (g.st === 'awake' && looking >= 0) run.followers += P.GAIN * dt
    if (asleep(run) && looking >= 0 && run.grace <= 0) {
      run.spot = { w: looking, left: P.SPOT_WIN, kind: sc.ws[looking].kind, depth: g.depth, forced: g.st === 'forced' }
      emit(run, 'spot', { w: looking })
      return
    }
    // ---- 場面の終わり
    if (t >= sc.dur) {
      if (run.idx + 1 >= SCENES.length) return finish(run, 'day')
      run.idx++; genScene(run, run.idx); run.phase = 'card'; run.cardT = 0
      if (g.st === 'sleep' || g.st === 'waking') { g.st = 'awake'; g.depth = 0; run.latch = true }
      if (g.st === 'forced') { g.st = 'awake'; g.depth = 0; run.latch = true }
    }
  }

  function resolveSpot(run, excused) {
    const sp = run.spot, sc = run.scene, g = run.g, w = sc.ws[sp.w]
    run.spot = null
    run.latch = true
    w.cd = 0
    const t = sc.t
    let exposed = !excused
    if (excused) {
      run.excuses++
      const k = run.excuses
      if (k > P.EXCUSE_MAX) { exposed = true; emit(run, 'excuseFail', { k, w: sp.w }) }
      else { run.followers -= P.EXCUSE_K * k; g.st = 'excuse'; g.left = P.POSE; g.depth = 0; emit(run, 'excuse', { k, w: sp.w }) }
      // 言い訳を聞いた人は、しばらく疑ってこっちを見る
      w.ov.push({ s: t, e: t + 1.8, st: 'look' })
      run.grace = P.POSE
    }
    if (exposed) {
      g.st = 'startle'; g.left = P.POSE + 0.4; g.depth = 0
      w.ov.push({ s: t, e: t + 2.0, st: 'look' })
      run.grace = P.POSE + 0.4
      const onAir = sc.id === 'tv' && (w.kind === 'cam')
      if (onAir && run.flags.trend && !run.trended) {
        run.trended = true; run.followers += P.TREND; emit(run, 'trend', { w: sp.w })
      } else {
        run.exposures++; run.followers -= P.EXPOSE; emit(run, 'exposed', { w: sp.w, n: run.exposures, kind: w.kind })
        if (run.exposures >= P.OUT) { run.pendingOver = P.POSE + 0.4 }
      }
    }
    // びっくりして目が覚める。勝手に寝ていた時は眠気が大きく引く（寝落ちの連鎖で詰まないように）
    run.D = sp.forced ? Math.min(run.D, 58) : Math.max(0, run.D - 6)
    if (run.pendingOver) finish(run, 'scoop')
  }

  function finish(run, reason) {
    run.over = true; run.reason = reason; run.phase = 'done'
    run.result = result(run)
    emit(run, 'over', { reason })
  }

  // 判定。フォロワーが主。3回バレたら E（スクープ）
  function result(run) {
    const f = Math.round(run.followers * 10) / 10
    const sleepMin = Math.round(run.sleepSec * P.SLEEP_MIN)
    let rank
    if (run.reason === 'scoop') rank = 'E'
    else rank = f >= 102.5 ? 'S' : f >= 98 ? 'A' : f >= 90 ? 'B' : f >= 80 ? 'C' : 'D'
    // 称号
    let title
    if (run.reason === 'scoop') title = 'scoop'
    else if (run.trended) title = 'trend'
    else if (run.exposures === 0 && run.excuses === 0 && run.forced === 0) title = 'master'
    else if (run.excuses >= 4) title = 'excuse'
    else if (run.forced >= 2) title = 'dropper'
    else if (run.exposures === 0) title = 'suspect'
    else if (sleepMin < 240) title = 'zombie'
    else title = 'busted'
    return { followers: f, sleepMin, rank, title, exposures: run.exposures, excuses: run.excuses, forced: run.forced, snores: run.snores, buzzes: run.buzzes, jSlept: run.jSlept, asstSlept: run.asstSlept, trended: run.trended, reason: run.reason, sceneIdx: run.idx }
  }

  const Core = { P, SCENES, KIND, EXCUSES, makeRun, step, wState, wWho, asleep }
  if (typeof module !== 'undefined' && module.exports) module.exports = Core
  else root.SSCore = Core
})(typeof window !== 'undefined' ? window : globalThis)
