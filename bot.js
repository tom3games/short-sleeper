// 遊び方ごとの bot。sim.mjs と verify.mjs（画面の通し）が使う。見えている物だけで決める（delay 秒前の画面）
// v2: reader = 人ごとの合図を覚えている / oneTiming = 誰でも「合図が見えたら離す」だけ・言い訳は場面を読まない
;(function (root) {
  const C = root.SSCore || (typeof require !== 'undefined' ? require('./core.js') : null)
  const P = C.P

  // 場面に合う言い訳の番号（6回目以降は影武者しか通らない）
  function bestChoice(run) {
    const o = run.spot.opts, sid = run.scene.id
    if (run.excuses + 1 > P.EXCUSE_MAX || run.kageUsed) { const k = o.indexOf('kage'); return k >= 0 ? k : null }
    const g = o.findIndex(id => C.fitOf(id, sid) === 'good')
    return g >= 0 ? g : 0
  }
  // 変装で見られても平気か（うとうとまで・記者に見破られていない）
  const covered = (run, w) => run.wear && !run.wear.slipped && run.wear.left > 0.75 && (w.kind !== 'jour' || run.sus < P.SUS_MAX - 0.6)

  const BOTS = {
    // 人ごとの合図の長さを覚えている。おじいちゃんの長い合図の間は寝続け、記者のそばでは浅く、子どもはそわそわで離す
    reader: (delay = 0.45) => (run) => {
      if (run.spot) return { hold: false, choice: P.SPOT_WIN - run.spot.left >= delay ? bestChoice(run) : null }
      if (run.phase !== 'play') return { hold: false }
      const sc = run.scene, tv = sc.t - delay, g = run.g
      if (tv < 0) return { hold: false }
      let danger = false, cap = P.SNORE - 0.35 - delay, anyNear = false
      const asl = g.st === 'sleep'
      for (const w of sc.ws) {
        const st = C.wState(w, tv), k = C.wKind(w, tv), K = C.KIND[k]
        // この人の合図が見えてから起きるまでに間に合わない深さには潜らない
        const lead = k === 'kid' ? 0.7 + K.turn : K.turn
        if (!C.calm(st) || st === 'still') { if (lead - delay < P.WAKE_DEEP + 0.12 && st !== 'zzz' && !(k === 'kid' && st === 'still')) cap = Math.min(cap, P.DEEP - 0.08) }
        if (st === 'look') { anyNear = true; if (covered(run, w)) cap = Math.min(cap, P.DEEP - 0.12); else danger = true }
        else if (st === 'turn') {
          anyNear = true
          const sg = C.wSeg(w, tv), TL = sg && sg.alert ? 0.9 : K.turn, rem = TL - (tv - sg.s) - delay
          const willDeep = g.depth + Math.max(0, rem) >= P.DEEP
          if (covered(run, w)) cap = Math.min(cap, P.DEEP - 0.12)
          else if (rem <= (willDeep ? P.WAKE_DEEP : P.WAKE_LIGHT) + 0.12) danger = true
        } else if (st === 'fidget') { anyNear = true; danger = true }
      }
      // 寝言が出たら賭ける（聞かれたら6割は「深い…」）。倒れそう・いびき寸前ならやめる
      if (run.mutter && !run.viral.length && asl && g.depth < P.SNORE - 0.1 && !(sc.stand && run.tilt > 0.6)) return { hold: true }
      if (sc.stand && run.tilt > 0.45) danger = true
      if (asl && g.depth >= cap) danger = true
      // 変装: 眠い時に、見られそうな場面で使う（記者に怪しまれ始めたら使わない）
      const item = !run.wear && run.items.length && run.D >= 62 && anyNear && run.susLv < 1
      if (danger) return { hold: false, item }
      if (!asl && run.D < 18) return { hold: false, item }   // 眠くないのに寝ない（浅く刻むため）
      return { hold: true, item }
    },
    // 誰でも同じ: 合図か見ているのが見えたら離す。子どものそわそわは気にしない。言い訳は一番左を選ぶ
    oneTiming: (delay = 0.45) => (run) => {
      if (run.spot) return { hold: false, choice: P.SPOT_WIN - run.spot.left >= delay ? 0 : null }
      if (run.phase !== 'play') return { hold: false }
      const sc = run.scene, tv = sc.t - delay, g = run.g
      if (tv < 0) return { hold: false }
      let danger = false, anyNear = false
      for (const w of sc.ws) {
        const st = C.wState(w, tv)
        if (st === 'turn' || st === 'look') { anyNear = true; if (!(st === 'look' && covered(run, w) && g.depth < P.DEEP - 0.12)) danger = true }
      }
      if (sc.stand && run.tilt > 0.45) danger = true
      if (g.st === 'sleep' && g.depth >= P.SNORE - 0.35 - delay) danger = true
      const item = !run.wear && run.items.length && run.D >= 62 && anyNear && run.susLv < 1
      return { hold: !danger, item }
    },
    // ずっと寝る（見つかったら左の言い訳）
    nap: () => (run) => ({ hold: run.phase === 'play' && !run.spot && run.g.st !== 'excuse' && run.g.st !== 'startle', choice: run.spot && run.spot.left < P.SPOT_WIN - 0.4 ? 0 : null }),
    // 絶対に寝ない（勝手に寝落ちした時だけ言い訳）
    never: () => (run) => ({ hold: false, choice: run.spot && run.spot.left < P.SPOT_WIN - 0.4 ? 0 : null }),
    // 何もしない
    idle: () => () => ({ hold: false }),
    // 適当: 適当に押したり離したり、言い訳は半分・選ぶのも適当
    random: () => {
      let next = 0, h = false, ex = null
      return (run, dt, R) => {
        if (run.spot) { if (ex == null) ex = R() < 0.5 ? Math.floor(R() * 3) : -1; return { hold: false, choice: ex >= 0 && run.spot.left < 1.2 ? ex : null } }
        ex = null
        next -= dt; if (next <= 0) { h = !h; next = 0.5 + R() * 2 }
        return { hold: h, item: R() < 0.01 }
      }
    },
  }
  BOTS.read = BOTS.reader   // 旧名
  const api = { BOTS, bestChoice }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.SSBot = api
})(typeof window !== 'undefined' ? window : globalThis)
