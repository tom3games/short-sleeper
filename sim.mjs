// 遊び方ごとの分布。node sim.mjs [回数]   ブラウザは開かない（core.js をそのまま回す）
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const C = require('./core.js')
const { BOTS } = require('./bot.js')
if (process.env.PP) Object.assign(C.P, JSON.parse(process.env.PP))
const N = Number(process.argv[2] || 12)
const DT = 1 / 60
function play(name, seed, arg) {
  const run = C.makeRun(seed), bot = BOTS[name](arg)
  let s = seed * 7 + 3; const R = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  for (let i = 0; i < 60 * 400 && !run.over; i++) C.step(run, DT, bot(run, DT, R) || {})
  run.result.peakD = run.peakD; return run.result
}
const med = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)] }
const rows = []
for (const [name, arg, label] of [['read', 0.45, 'read'], ['read', 0.8, 'readSlow'], ['nap'], ['never'], ['idle'], ['random']]) {
  const rs = []; for (let k = 1; k <= N; k++) rs.push(play(name, 1000 + k * 37, arg))
  const f = rs.map(r => r.followers), ranks = {}
  rs.forEach(r => ranks[r.rank] = (ranks[r.rank] || 0) + 1)
  rows.push({ bot: label || name, followers: `${med(f)} / ${Math.min(...f)} / ${Math.max(...f)}`, sleep: med(rs.map(r => r.sleepMin)), exposed: med(rs.map(r => r.exposures)), excuses: med(rs.map(r => r.excuses)), forced: med(rs.map(r => r.forced)), scoop: rs.filter(r => r.reason === 'scoop').length, ranks: Object.entries(ranks).sort().map(([k, v]) => k + v).join(' '), titles: [...new Set(rs.map(r => r.title))].join(','), peakD: med(rs.map(r => Math.round(r.peakD))) })
}
console.table(rows)
