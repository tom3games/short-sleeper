// 遊び方ごとの分布。node sim.mjs [回数]   ブラウザは開かない（core.js をそのまま回す）。NOTILT=1 で傾きなし
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const C = require('./core.js')
const { BOTS } = require('./bot.js')
if (process.env.PP) Object.assign(C.P, JSON.parse(process.env.PP))
const N = Number(process.argv[2] || 12)
const DT = 1 / 60
function play(name, seed, arg) {
  const run = C.makeRun(seed, { tilt: !process.env.NOTILT }), bot = BOTS[name](arg)
  let s = seed * 7 + 3; const R = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  for (let i = 0; i < 60 * 400 && !run.over; i++) C.step(run, DT, bot(run, DT, R) || {})
  run.result.peakD = run.peakD; run.result.spots = run.log.filter(e => e.type === 'spot' || e.type === 'fall').length; return run.result
}
const med = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)] }
const sum = a => a.reduce((x, y) => x + y, 0)
const rows = []
for (const [name, arg, label] of [['reader', 0.45, 'reader'], ['reader', 0.8, 'readerSlow'], ['oneTiming', 0.45, 'oneTiming'], ['nap', 0, 'always-sleep'], ['never', 0, 'never-sleep'], ['idle'], ['random']]) {
  const rs = []; for (let k = 1; k <= N; k++) rs.push(play(name, 1000 + k * 37, arg))
  const f = rs.map(r => r.followers), ranks = {}
  rs.forEach(r => ranks[r.rank] = (ranks[r.rank] || 0) + 1)
  rows.push({ bot: label || name, mean: +(sum(f) / N).toFixed(1), spots: +(sum(rs.map(r => r.spots)) / N).toFixed(2), followers: `${med(f)} / ${Math.min(...f)} / ${Math.max(...f)}`, sleep: med(rs.map(r => r.sleepMin)), exposed: med(rs.map(r => r.exposures)), excuses: med(rs.map(r => r.excuses)), forced: med(rs.map(r => r.forced)), falls: sum(rs.map(r => r.falls)), viral: sum(rs.map(r => r.viral)), items: med(rs.map(r => r.itemsUsed)), scoop: rs.filter(r => r.reason === 'scoop').length, ranks: Object.entries(ranks).sort().map(([k, v]) => k + v).join(' '), peakD: med(rs.map(r => Math.round(r.peakD))) })
}
console.table(rows)
