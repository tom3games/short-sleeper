// 1日3分のショートスリーパー の中身（画面に依存しない）。game.js と sim.mjs の両方が使う
// 同じ seed と同じ入力なら同じ結果になる（乱数は seed から作るものだけ）
// v2（2026-11-09）: 見る人ごとに合図と長さが違う・言い訳は3択・寝言・変装アイテム・立ったまま熟睡で傾く
;(function (root) {
  'use strict'
  // ---- 数字（ideas/short-sleeper.md と合わせる）
  const P = {
    D0: 40,            // 始まりの眠気
    RISE: 5.5,         // 起きている間に増える眠気 /秒（v1 は 4.2。人ごとの合図を読んで長く寝られる人が得をするように上げた）
    REST_LIGHT: 3.5,   // うとうと中に減る眠気 /秒
    REST_DEEP: 9,      // 熟睡中に減る眠気 /秒
    DEEP: 1.8,         // ここから熟睡（よく回復する。首がかくっと落ちる）
    SNORE: 3.2,        // ここからいびき（耳のいい人が振り向く）
    WARN: 3.6,         // 腕時計が光り始める
    BUZZ: 4.6,         // 腕時計が「睡眠を検知しました」と鳴る（全員がこっちを見る）
    WAKE_LIGHT: 0.15,  // 離してから目が開くまで（うとうと）
    WAKE_DEEP: 0.5,    // 離してから目が開くまで（熟睡。はっ）
    FORCED: 3.6,       // 眠気が満タンで勝手に寝てしまう長さ
    SPOT_WIN: 2.0,     // 見つかってから言い訳を選べる時間（その間、時間は止まる）
    POSE: 1.3,         // 言い訳・はっ のポーズの長さ
    FOLLOW0: 100,      // フォロワー（万）
    GAIN: 0.06,        // 見られている間に起きていると増える（万/秒）。よく寝ているほど冴えて増える
    EXPOSE: 12,        // バレたら減る（万）
    TREND: 18,         // 生放送で寝て「究極の瞑想」でトレンド入り（万）
    EXCUSE_K: 3,       // 言い訳で減る = これ × (1 + 0.5×(k-1)) × 場面との合い方（ずれた言い訳でもバレた時の9割まで）
    FIT: { good: 0.35, mid: 1, bad: 2 },   // 場面に合う言い訳は軽く、ずれた言い訳は重い
    REUSE: 0.6,        // 同じ言い訳を2回目に使うと +60%
    EXCUSE_MAX: 5,     // 6回目からは信じてもらえない（影武者だけは1回通る）
    KAGE: 2,           // 影武者で減る（万）
    OUT: 3,            // 3回バレたら週刊誌に載って終わり
    SLEEP_MIN: 10,     // 実睡眠: 遊びの1秒 = 10分
    CARD: 1.6,         // 場面の間の手帳の時間
    // 寝言: 熟睡がここを越えると時々しゃべる。聞こえた人が振り向き、半分は「深い…」で拍手（1日1回まで）
    MUTTER_D: 2.3, MUTTER_P: 0.12, MUTTER_WIN: 2.8, VIRAL_P: 0.5, VIRAL: 6, VIRAL_MAX: 1,
    // 変装: 使っている間はうとうと（熟睡の前）なら見られても平気。熟睡で首が落ちるとずれてバレる
    ITEM_DUR: { shades: 6, painted: 6, book: 5 },
    SUS_WARN: 2, SUS_MAX: 4.5,   // 室内で変装を記者に見られた秒数。4.5秒で記者には効かなくなる
    // 立ったまま熟睡すると体が傾く。1 で倒れる（バレる）
    TILT_RATE: 0.75, TILT_BACK: 0.9, TILT_LIGHT: 0.35,
  }
  // ---- 1日の予定。w = 見る人。win = 全員が見ていない時間（VTR・ワークなど）。stand = 立っている。item = 手に入る変装
  const SCENES = [
    { id: 'tv', clock: '7:00', dur: 20, stand: true, w: [{ t: 'cam', id: 'camA' }, { t: 'cam', id: 'camB' }], win: { n: 2, len: [4.5, 6.2] }, item: { t: 1.2, id: 'shades', from: 'stylist' } },
    { id: 'seminar', clock: '10:00', dur: 22, stand: true, w: [{ t: 'oba' }, { t: 'kid' }, { t: 'jii' }, { t: 'jour' }], win: { n: 1, len: [5, 6.5] } },
    { id: 'sign', clock: '12:30', dur: 20, w: [{ t: 'fan' }, { t: 'asst' }, { t: 'jour' }], win: { n: 1, len: [3.5, 5] }, item: { t: 4, id: 'shades', from: 'fan' } },
    { id: 'gym', clock: '15:00', dur: 18, stand: true, w: [{ t: 'cam', id: 'camG' }, { t: 'asst' }], win: { n: 1, len: [4, 5.5] }, item: { t: 1.5, id: 'painted', from: 'asst' } },
    { id: 'interview', clock: '17:00', dur: 20, w: [{ t: 'jour', near: true }, { t: 'asst' }], win: { n: 1, len: [5.5, 7] }, item: { t: 2, id: 'book', from: 'asst' } },
    { id: 'dinner', clock: '19:30', dur: 20, w: [{ t: 'shacho' }, { t: 'oba' }, { t: 'asst' }], win: { n: 1, len: [5, 6.5] } },
    { id: 'live', clock: '23:00', dur: 20, stand: true, w: [{ t: 'phone' }, { t: 'asst' }], win: { n: 2, len: [3.5, 5] } },
  ]
  // 見る人の癖。turn = 合図の長さ（人ごとに決まっている。覚えれば読める）
  //  記者: ペンが止まる から 手帳を閉じる から 顔を上げる（一番速い）
  //  おばちゃん: 飴の袋をガサガサ から 「あら？」
  //  おじいちゃん: 補聴器をいじる から ゆっくり振り向く（長い。耳が遠いのでいびきは聞こえない）
  //  子ども: ほぼ合図なし。ただし、そわそわしている間しかこっちを見ない
  //  助手: スマホの通知が光る から 顔を上げる
  //  カメラ: ランプ点滅 と カメラマンの指 3・2・1
  //  社長: グラスを置く から 見る（見る時間が長い）
  //  配信: コメントに「寝てない？」が流れ始める から 視聴者が見る
  const KIND = {
    jour: { away: [2.4, 5.6], turn: 0.75, look: [1.6, 3.4], hear: true },
    oba: { away: [2.4, 5.2], turn: 1.2, look: [1.8, 3.2], hear: true },
    jii: { away: [3.5, 6.5], turn: 2.0, look: [1.4, 2.4], hear: false },
    kid: { still: [2.2, 4.5], fidget: [2.6, 4.2], turn: 0.3, look: [1.0, 1.6], hear: true },
    asst: { away: [3, 6.5], turn: 1.0, look: [1.2, 2.4], hear: true },
    shacho: { away: [3, 6], turn: 1.0, look: [2.4, 4], hear: true },
    cam: { away: [2.5, 5], turn: 1.2, look: [3, 5.5], hear: false },
    phone: { away: [2.2, 4.2], turn: 1.4, look: [2, 3.4], hear: true },
  }
  const FAN = ['oba', 'jii', 'kid']   // サイン会の列に並ぶ人（見るたびに次の人に替わる）
  // 言い訳。fit = 合う場面。無いものはどこでも「普通」
  const EXC = {
    ma: ['seminar', 'tv'], vtr: ['tv'], nen: ['sign'], stretch: ['gym'], listen: ['interview'], pray: ['dinner'], micro: ['live'],
    meditate: null, rest: null, reboot: null, kage: null,
  }
  const EX_GOOD = Object.keys(EXC).filter(k => EXC[k])
  const EX_MID = ['meditate', 'rest', 'reboot']
  const MUTTERS = 6   // 寝言の数（data.js）
  const EXCUSES = Object.keys(EXC).length

  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
  const rr = (R, a, b) => a + (b - a) * R()
  const pick = (R, a) => a[Math.floor(R() * a.length)]
  const calm = st => st === 'away' || st === 'still' || st === 'zzz'

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
  // 1回ぶんの「よそ見から合図から見る」
  function cycle(R, k) {
    const K = KIND[k]
    if (k === 'kid') {
      const f = rr(R, K.fidget[0], K.fidget[1]), l = rr(R, K.look[0], K.look[1]), f1 = rr(R, 0.7, 1.4)
      return [{ d: rr(R, K.still[0], K.still[1]), st: 'still' }, { d: f1, st: 'fidget' }, { d: K.turn, st: 'turn' }, { d: l, st: 'look' }, { d: Math.max(0.5, f - f1), st: 'fidget' }]
    }
    return [{ d: rr(R, K.away[0], K.away[1]), st: 'away' }, { d: K.turn, st: 'turn' }, { d: rr(R, K.look[0], K.look[1]), st: 'look' }]
  }
  // 1人ぶんの予定。全員が見ていない時間には合図も見るも置かない
  function segs(R, kind, dur, wins, startLook, fan) {
    const out = []
    let t = 0, fi = fan ? Math.floor(R() * 3) : 0
    const kOf = () => fan ? FAN[fi % 3] : kind
    if (startLook && kOf() !== 'kid') { const l = rr(R, 1.2, 2.2); out.push({ s: 0, e: l, st: 'look', k: kOf() }); t = l }
    let guard = 0
    while (t < dur + 3 && guard++ < 200) {
      const k = kOf(), cy = cycle(R, k)
      const ds = t + cy[0].d, end = t + cy.reduce((a, c) => a + c.d, 0)
      const w = wins.find(w => ds < w.e && end > w.s - 0.3)
      if (w) { const e = Math.max(t + 0.2, w.e + rr(R, 0.2, 1.0)); out.push({ s: t, e, st: cy[0].st, k }); t = e; continue }
      for (const c of cy) { out.push({ s: t, e: t + c.d, st: c.st, k }); t += c.d }
      if (fan) fi++
    }
    return out
  }
  // カメラ2台（生放送）: どちらか一方が映っている。切り替えの前に次のカメラのランプが点滅する
  function camPair(R, dur, wins) {
    const a = [], b = [], TL = KIND.cam.turn
    let t = 0, on = R() < 0.5 ? 0 : 1
    const push = (arr, s, e, st) => { if (e > s) arr.push({ s, e, st, k: 'cam' }) }
    while (t < dur + 3) {
      let shot = rr(R, 2.4, 4.6)
      const w = wins.find(w => w.e > t && w.s < t + shot + TL)
      if (w) {
        const end = Math.max(t + 0.6, w.s)
        push(on ? b : a, t, end, 'look'); push(on ? a : b, t, end, 'away')
        const nx = R() < 0.5 ? 0 : 1
        push(a, end, w.e - (nx === 0 ? TL : 0), 'away'); push(b, end, w.e - (nx === 1 ? TL : 0), 'away')
        push(nx === 0 ? a : b, w.e - TL, w.e, 'turn')
        t = w.e; on = nx; continue
      }
      const cur = on ? b : a, nxt = on ? a : b
      push(cur, t, t + shot, 'look'); push(nxt, t, t + shot - TL, 'away'); push(nxt, t + shot - TL, t + shot, 'turn')
      t += shot; on = 1 - on
      if (R() < 0.3) { const g = rr(R, 1.5, 3); push(cur, t, t + g, 'away'); push(nxt, t, t + g - TL, 'away'); push(nxt, t + g - TL, t + g, 'turn'); t += g }
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
      const kind = spec.t
      const sg = pair ? pair[i] : kind === 'fan' ? segs(R, 'oba', S.dur, wins, true, true) : segs(R, kind, S.dur, wins, kind !== 'cam')
      return { ...spec, kind, segs: sg, ov: [], cd: 0 }
    })
    // まれ: 記者も寝ている（ある場面の途中で 6〜8 秒）
    if (run.flags.jSleepScene === idx) {
      const j = ws.find(w => w.kind === 'jour')
      if (j) { const s = rr(R, 4, S.dur - 10), e = s + rr(R, 6, 8); j.segs = cutIn(j.segs, s, e, 'zzz', 'jour') }
    }
    // まれ: 助手が配信中に寝落ち
    if (run.flags.asstSleep && S.id === 'live') {
      const a = ws.find(w => w.kind === 'asst'); if (a) a.segs = cutIn(a.segs, 3, S.dur - 3, 'zzz', 'asst')
    }
    run.scene = { idx, id: S.id, dur: S.dur, wins, ws, t: 0, stand: !!S.stand, item: S.item ? { ...S.item, got: false } : null }
    run.tilt = 0
  }
  // [s,e] を st で上書きし、明けたら合図から見る
  function cutIn(sg, s, e, st, k) {
    const out = [], TL = KIND[k].turn, e2 = e + TL + 1.4
    let tail = false   // 明けたあと、元の「合図・見る」の途中は よそ見 にして、次の よそ見 から元の予定に戻す
    for (const g of sg) {
      if (g.e <= s) { out.push(g); continue }
      if (g.s < s) out.push({ ...g, e: s })
      if (g.e <= e2) { if (g.e > s) tail = true; continue }
      if (g.s < e2 || tail) {
        if (calm(g.st)) { out.push({ ...g, s: Math.max(g.s, e2) }); tail = false }
        else { out.push({ s: Math.max(g.s, e2), e: g.e, st: 'away', k }); tail = true }
      } else out.push(g)
    }
    out.push({ s, e, st, k }, { s: e, e: e + TL, st: 'turn', k }, { s: e + TL, e: e2, st: 'look', k })
    return out.sort((a, b) => a.s - b.s)
  }

  function wSeg(w, t) {
    for (let i = w.ov.length - 1; i >= 0; i--) { const o = w.ov[i]; if (t >= o.s && t < o.e) return o }
    for (const g of w.segs) if (t >= g.s && t < g.e) return g
    return null
  }
  function wState(w, t) { const g = wSeg(w, t); return g ? g.st : (w.kind === 'kid' ? 'still' : 'away') }
  // その時の中の人（サイン会の列は入れ替わる）
  function wKind(w, t) {
    if (w.kind !== 'fan') return w.kind
    for (const g of w.segs) if (t >= g.s && t < g.e) return g.k
    return 'oba'
  }

  function makeRun(seed, opt = {}) {
    const R = mulberry(seed >>> 0 || 1)
    const flags = {
      trend: R() < 0.15,
      jSleepScene: R() < 0.25 ? [1, 2, 4][Math.floor(R() * 3)] : -1,
      asstSleep: R() < 0.2,
    }
    const run = {
      seed, R, flags, tutorial: !!opt.tutorial, tilton: opt.tilt !== false,
      phase: 'card', cardT: 0, idx: 0, t: 0,
      D: P.D0, sleepSec: 0, deepSec: 0,
      g: { st: 'awake', depth: 0, left: 0 }, latch: false,
      spot: null, grace: 0, tilt: 0,
      followers: P.FOLLOW0, exposures: 0, excuses: 0, forced: 0, snores: 0, buzzes: 0, drools: 0, falls: 0,
      items: [], wear: null, itemsUsed: 0, sus: 0, susLv: 0,
      exUsed: {}, exFit: { good: 0, mid: 0, bad: 0 }, kageUsed: false,
      mutter: null, quotes: [], viral: [],
      trended: false, jSlept: false, asstSlept: false, peakD: P.D0,
      ev: [], log: [], over: false, reason: '',
    }
    genScene(run, 0)
    return run
  }
  const asleep = run => run.g.st === 'sleep' || run.g.st === 'waking' || run.g.st === 'forced'
  const emit = (run, type, o) => { const e = { type, t: run.t, scene: run.idx, ...(o || {}) }; run.ev.push(e); run.log.push(e) }

  function alertAll(run, kind) {   // いびき・寝言: 聞こえる人が振り向く / 腕時計・転倒: 全員がすぐ見る
    const sc = run.scene, t = sc.t
    sc.ws.forEach((w, i) => {
      const st = wState(w, t)
      if (kind === 'buzz') { w.ov.push({ s: t, e: t + 2.5, st: 'look', k: wKind(w, t) }); return }
      if (!KIND[wKind(w, t)].hear || st === 'look' || st === 'turn' || st === 'zzz') return
      w.ov.push({ s: t, e: t + 0.9, st: 'turn', k: wKind(w, t), alert: true }, { s: t + 0.9, e: t + 3.4, st: 'look', k: wKind(w, t) })
      emit(run, 'alert', { w: i })
    })
  }
  // 言い訳の3択（場面に合う・普通・ずれている を1つずつ。5回目からは普通の代わりに「影武者です」）
  function excuseOpts(run) {
    const R = run.R, id = run.scene.id
    const good = EX_GOOD.filter(k => EXC[k].includes(id)), bad = EX_GOOD.filter(k => !EXC[k].includes(id))
    const o = [pick(R, good), (run.excuses + 1 >= P.EXCUSE_MAX && !run.kageUsed) ? 'kage' : pick(R, EX_MID), pick(R, bad)]
    for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [o[i], o[j]] = [o[j], o[i]] }
    return o
  }
  function fitOf(id, sceneId) { if (!EXC[id]) return 'mid'; return EXC[id].includes(sceneId) ? 'good' : 'bad' }

  // 変装がばれていないか（記者は長く見ると見破る）
  function hiddenFrom(run, w) {
    if (!run.wear || run.wear.slipped || run.g.depth >= P.DEEP) return false
    if (w.kind === 'jour' && run.sus >= P.SUS_MAX) return false
    return true
  }

  // inp: { hold: 押している, choice: 言い訳の番号（0〜2。押した瞬間だけ）, item: 変装ボタン（押した瞬間だけ） }
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
    // ---- 見つかった瞬間（時間が止まる。言い訳を選べるのはこの間だけ）
    if (run.spot) {
      run.spot.left -= dt
      if (inp.choice != null && inp.choice >= 0 && inp.choice < 3) return resolveSpot(run, inp.choice)
      if (inp.excuse) return resolveSpot(run, 0)   // 旧: 言い訳ボタン（キー操作用）
      if (run.spot.left <= 0) return resolveSpot(run, null)
      return
    }
    sc.t += dt
    const t = sc.t
    if (run.grace > 0) run.grace -= dt
    for (const w of sc.ws) { const st = wState(w, t); if (st === 'zzz') { if (w.kind === 'jour') run.jSlept = true; if (w.kind === 'asst') run.asstSlept = true } }

    // ---- 変装アイテム（拾う・使う）
    if (sc.item && !sc.item.got && t >= sc.item.t) { sc.item.got = true; run.items.push(sc.item.id); emit(run, 'pickup', { id: sc.item.id, from: sc.item.from }) }
    if (inp.item && run.items.length && !run.wear && g.st !== 'excuse' && g.st !== 'startle') {
      const id = run.items.shift(); run.wear = { id, left: P.ITEM_DUR[id], slipped: false }; run.itemsUsed++; emit(run, 'wear', { id })
    }
    if (run.wear) {
      run.wear.left -= dt
      if (run.wear.left <= 0) { emit(run, 'unwear', { id: run.wear.id }); run.wear = null }
    }

    // ---- 指と体
    if (!inp.hold) run.latch = false
    const want = inp.hold && !run.latch
    if (g.st === 'excuse' || g.st === 'startle' || g.st === 'praised') {
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
    // ---- いびき・腕時計・寝言
    if (asleep(run) && g.st !== 'waking') {
      const d0 = g.depth - dt
      if (d0 < P.DEEP && g.depth >= P.DEEP && run.wear && !run.wear.slipped) { run.wear.slipped = true; emit(run, 'slip', { id: run.wear.id }) }
      if (d0 < P.MUTTER_D && g.depth >= P.MUTTER_D && run.R() < P.MUTTER_P) {
        const line = Math.floor(run.R() * MUTTERS); run.mutter = { left: P.MUTTER_WIN, line, heard: false }; run.quotes.push(line); emit(run, 'mutter', { line }); alertAll(run, 'mutter')
      }
      if (d0 < P.SNORE && g.depth >= P.SNORE) { run.snores++; emit(run, 'snore'); alertAll(run, 'snore') }
      if (d0 < P.WARN && g.depth >= P.WARN) emit(run, 'warn')
      if (d0 < P.BUZZ && g.depth >= P.BUZZ) { run.buzzes++; emit(run, 'buzz'); alertAll(run, 'buzz') }
      if (d0 < 2.6 && g.depth >= 2.6) run.drools++
    }
    if (run.mutter) { run.mutter.left -= dt; if (run.mutter.left <= 0) run.mutter = null }
    // ---- 眠気
    if (asleep(run)) {
      const deep = g.depth >= P.DEEP
      run.D = Math.max(0, run.D - (deep ? P.REST_DEEP : P.REST_LIGHT) * dt)
      run.sleepSec += dt; if (deep) run.deepSec += dt
    } else if (g.st === 'awake') {
      run.D = Math.min(100, run.D + P.RISE * dt)
    }
    run.peakD = Math.max(run.peakD, run.D)
    // ---- 立ったまま熟睡すると傾く。倒れたらバレる
    if (sc.stand && run.tilton) {
      const deepNow = asleep(run) && g.st !== 'waking' && g.depth >= P.DEEP
      if (deepNow) run.tilt += P.TILT_RATE * dt
      else run.tilt = Math.max(0, run.tilt - (asleep(run) ? P.TILT_LIGHT : P.TILT_BACK) * dt)
      if (run.tilt >= 1) {
        run.tilt = 0; run.falls++; emit(run, 'fall')
        alertAll(run, 'buzz')
        const wi = Math.max(0, sc.ws.findIndex(w => wState(w, t) !== 'zzz'))
        return expose(run, wi, false, 'fall')
      }
    }
    // ---- 見られているか
    let looking = -1, seenBy = -1
    sc.ws.forEach((w, i) => {
      if (w.cd > 0) w.cd -= dt
      if (wState(w, t) !== 'look' || w.cd > 0) return
      if (looking < 0) looking = i
      if (seenBy < 0 && !hiddenFrom(run, w)) seenBy = i
      // 室内で変装を記者に見られると、だんだん怪しまれる
      if (w.kind === 'jour' && run.wear && sc.id !== 'tv') {
        run.sus += dt
        if (run.susLv < 1 && run.sus >= P.SUS_WARN) { run.susLv = 1; emit(run, 'sus', { w: i, lv: 1, id: run.wear.id }) }
        if (run.susLv < 2 && run.sus >= P.SUS_MAX) { run.susLv = 2; emit(run, 'sus', { w: i, lv: 2, id: run.wear.id }) }
      }
    })
    if (g.st === 'awake' && looking >= 0) run.followers += P.GAIN * (1.3 - run.D / 100) * dt
    if (asleep(run) && seenBy >= 0 && run.grace <= 0) {
      const w = sc.ws[seenBy]
      // 寝言を聞いて振り向いた人は、半分以上「深い…」と感心する
      if (run.mutter && !run.mutter.heard && run.viral.length < P.VIRAL_MAX && run.R() < P.VIRAL_P) {
        run.mutter.heard = true; run.viral.push(run.mutter.line); run.followers += P.VIRAL
        g.st = 'praised'; g.left = P.POSE + 0.3; g.depth = 0; run.latch = true; run.grace = P.POSE + 0.3
        w.ov.push({ s: t, e: t + 1.6, st: 'look', k: wKind(w, t) }); w.cd = 0
        run.D = Math.max(0, run.D - 6); run.mutter = null
        emit(run, 'viral', { w: seenBy, line: run.viral[run.viral.length - 1] })
        return
      }
      if (run.mutter) run.mutter.heard = true
      run.spot = { w: seenBy, left: P.SPOT_WIN, kind: wKind(w, t), depth: g.depth, forced: g.st === 'forced', opts: excuseOpts(run) }
      emit(run, 'spot', { w: seenBy })
      return
    }
    // ---- 場面の終わり
    if (t >= sc.dur) {
      if (run.idx + 1 >= SCENES.length) return finish(run, 'day')
      run.idx++; genScene(run, run.idx); run.phase = 'card'; run.cardT = 0
      if (run.wear) { emit(run, 'unwear', { id: run.wear.id }); run.wear = null }
      if (g.st === 'sleep' || g.st === 'waking' || g.st === 'forced') { g.st = 'awake'; g.depth = 0; run.latch = true }
    }
  }

  function expose(run, wi, forced, why) {
    const sc = run.scene, g = run.g, w = sc.ws[wi], t = sc.t
    g.st = 'startle'; g.left = P.POSE + 0.4; g.depth = 0; run.latch = true
    w.ov.push({ s: t, e: t + 2.0, st: 'look', k: wKind(w, t) }); w.cd = 0
    run.grace = P.POSE + 0.4
    if (run.wear) { emit(run, 'unwear', { id: run.wear.id }); run.wear = null }
    const onAir = sc.id === 'tv' && w.kind === 'cam'
    if (onAir && run.flags.trend && !run.trended) {
      run.trended = true; run.followers += P.TREND; emit(run, 'trend', { w: wi })
    } else {
      run.exposures++; run.followers -= P.EXPOSE; emit(run, 'exposed', { w: wi, n: run.exposures, kind: wKind(w, t), why: why || '' })
      if (run.exposures >= P.OUT) run.pendingOver = true
    }
    run.D = forced ? Math.min(run.D, 58) : Math.max(0, run.D - 6)
    if (run.pendingOver) finish(run, 'scoop')
  }

  function resolveSpot(run, choice) {
    const sp = run.spot, sc = run.scene, g = run.g, w = sc.ws[sp.w]
    run.spot = null
    run.latch = true
    w.cd = 0
    const t = sc.t
    if (choice == null) return expose(run, sp.w, sp.forced)
    const id = sp.opts[choice]
    run.excuses++
    const k = run.excuses
    if (id !== 'kage' && (k > P.EXCUSE_MAX || run.kageUsed)) { emit(run, 'excuseFail', { k, w: sp.w, id }); run.exUsed[id] = (run.exUsed[id] || 0) + 1; return expose(run, sp.w, sp.forced, 'fail') }
    const fit = id === 'kage' ? 'mid' : fitOf(id, sc.id), used = run.exUsed[id] || 0
    const loss = id === 'kage' ? P.KAGE : Math.min(P.EXPOSE * 0.9, P.EXCUSE_K * (1 + 0.5 * (k - 1)) * P.FIT[fit] * (1 + P.REUSE * used))
    run.followers -= loss; run.exUsed[id] = used + 1; run.exFit[fit]++
    if (id === 'kage') run.kageUsed = true
    g.st = 'excuse'; g.left = P.POSE; g.depth = 0
    emit(run, 'excuse', { k, w: sp.w, id, fit, loss: Math.round(loss * 10) / 10, reuse: used })
    // 言い訳を聞いた人は、しばらく疑ってこっちを見る（ずれた言い訳ほど長く）
    w.ov.push({ s: t, e: t + (fit === 'bad' ? 3.0 : 1.8), st: 'look', k: wKind(w, t) })
    run.grace = P.POSE
    if (run.wear) { emit(run, 'unwear', { id: run.wear.id }); run.wear = null }
    run.D = sp.forced ? Math.min(run.D, 58) : Math.max(0, run.D - 6)
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
    else rank = f >= 103 ? 'S' : f >= 99 ? 'A' : f >= 92 ? 'B' : f >= 82 ? 'C' : 'D'
    let title
    if (run.reason === 'scoop') title = 'scoop'
    else if (run.trended) title = 'trend'
    else if (run.viral.length) title = 'sage'
    else if (run.exposures === 0 && run.excuses === 0 && run.forced === 0) title = 'master'
    else if (run.excuses >= 4) title = 'excuse'
    else if (run.forced >= 2) title = 'dropper'
    else if (run.exposures === 0) title = 'suspect'
    else if (sleepMin < 240) title = 'zombie'
    else title = 'busted'
    // 一番使った言い訳・一番の寝言
    let topEx = null, topN = 0
    for (const [k, n] of Object.entries(run.exUsed)) if (n > topN) { topN = n; topEx = k }
    const quote = run.viral.length ? run.viral[0] : run.quotes.length ? run.quotes[run.quotes.length - 1] : null
    return { followers: f, sleepMin, rank, title, exposures: run.exposures, excuses: run.excuses, forced: run.forced, snores: run.snores, buzzes: run.buzzes, falls: run.falls, jSlept: run.jSlept, asstSlept: run.asstSlept, trended: run.trended, reason: run.reason, sceneIdx: run.idx, topEx, topN, quote, viral: run.viral.length, quoteViral: run.viral.length > 0, itemsUsed: run.itemsUsed, exFit: { ...run.exFit } }
  }

  const Core = { P, SCENES, KIND, FAN, EXC, EXCUSES, MUTTERS, makeRun, genScene, step, wState, wSeg, wKind, asleep, calm, fitOf, hiddenFrom }
  if (typeof module !== 'undefined' && module.exports) module.exports = Core
  else root.SSCore = Core
})(typeof window !== 'undefined' ? window : globalThis)
