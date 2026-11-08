// 遊び方ごとの bot。sim.mjs と verify.mjs（画面の通し）が使う。見えている物だけで決める
;(function (root) {
  const C = root.SSCore || (typeof require !== 'undefined' ? require('./core.js') : null)
  // 反応の遅れ delay 秒ぶん前の画面を見て決める
  function seen(run, delay) {
    const sc = run.scene, t = sc.t - delay
    if (t < 0) return { danger: true }
    let danger = false
    for (const w of sc.ws) { const st = C.wState(w, t); if (st === 'turn' || st === 'look') danger = true }
    return { danger }
  }
  const BOTS = {
    // 読む: 全員がよそ見の間だけ寝る。合図（顔を上げる・ランプ点滅）が見えたら離す。いびきの前に一度起きる
    read: (delay = 0.45) => {
      let rel = 0
      return (run, dt) => {
        if (run.spot) return { hold: false, excuse: run.spot.left <= C.P.SPOT_WIN - delay }
        if (run.phase !== 'play') return { hold: false }
        const s = seen(run, delay)
        if (rel > 0) { rel -= dt; return { hold: false } }
        if (run.g.st === 'sleep' && run.g.depth >= C.P.SNORE - 0.35 - delay) { rel = 0.12; return { hold: false } }
        return { hold: !s.danger }
      }
    },
    // ずっと寝る（見つかったら言い訳）
    nap: () => (run) => ({ hold: run.phase === 'play' && !run.spot && run.g.st !== 'excuse' && run.g.st !== 'startle', excuse: !!run.spot && run.spot.left < C.P.SPOT_WIN - 0.4 }),
    // 絶対に寝ない（勝手に寝落ちした時だけ言い訳）
    never: () => (run) => ({ hold: false, excuse: !!run.spot && run.spot.left < C.P.SPOT_WIN - 0.4 }),
    // 何もしない
    idle: () => () => ({ hold: false, excuse: false }),
    // 適当: 適当に押したり離したり、言い訳は半分
    random: () => {
      let next = 0, h = false, ex = null
      return (run, dt, R) => {
        if (run.spot) { if (ex == null) ex = R() < 0.5; return { hold: false, excuse: ex && run.spot.left < 0.8 } }
        ex = null
        next -= dt; if (next <= 0) { h = !h; next = 0.5 + R() * 2 }
        return { hold: h }
      }
    },
  }
  const api = { BOTS, seen }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.SSBot = api
})(typeof window !== 'undefined' ? window : globalThis)
