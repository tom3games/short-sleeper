// 1日3分のショートスリーパー: 画面・音・入力。中身は core.js
// v2: 見る人ごとの合図（絵・印・名札・初回の付箋）・言い訳3択・寝言・変装・傾き
;(function () {
  'use strict'
  const C = window.SSCore, P = C.P, TX = window.SS_TXT, LAY = window.SS_LAYOUT, ART = window.SS_ART
  const $ = s => document.querySelector(s)
  const qs = new URLSearchParams(location.search)
  let lang = (() => { try { const l = localStorage.getItem('ss_lang'); if (l) return l } catch (e) {} return /^ja/i.test(navigator.language || 'ja') ? 'ja' : 'en' })()
  if (qs.get('lang')) lang = qs.get('lang') === 'en' ? 'en' : 'ja'
  const T = () => TX[lang]
  const store = { get(k) { try { return localStorage.getItem(k) } catch (e) { return null } }, set(k, v) { try { localStorage.setItem(k, v) } catch (e) {} } }

  // ---------- 文言
  function applyLang() {
    document.documentElement.lang = lang
    document.querySelectorAll('[data-t]').forEach(el => { const v = T()[el.dataset.t]; if (v != null) el.textContent = v })
    document.querySelectorAll('[data-h]').forEach(el => { el.innerHTML = T()[el.dataset.h] })
    $('#langTxt').textContent = lang === 'ja' ? 'EN' : '日本語'
    $('#tTitle').innerHTML = lang === 'ja' ? '1日<em>3分</em>の<br>ショート<br>スリーパー' : 'The <em>3-Minute</em><br>Sleeper'
    $('#eyeLab').textContent = T().eye
    if (run) { updateTop(true); buildPlanner() }
    updateItem(true)
  }

  // ---------- 読み込み（本物の件数でまぶたが開く。遅くても12秒で閉じる）
  const IMGS = Object.keys(ART).map(k => 'img/' + k + '.webp')
  const SND = { sn: ['snd/sn1.mp3', 'snd/sn2.mp3', 'snd/sn3.mp3'], burst: 'snd/burst.mp3', shutter: 'snd/shutter.mp3', gong: 'snd/gong.mp3', applause: 'snd/applause.mp3', laugh: 'snd/laugh.mp3', watch: 'snd/watch.mp3', vib: 'snd/vib.mp3', yawn: 'snd/yawn.mp3', boing: 'snd/boing.mp3', flip: ['snd/flip1.mp3', 'snd/flip2.mp3'], roll: 'snd/roll.mp3', win: 'snd/win.mp3', lose: 'snd/lose.mp3', click: 'snd/click.mp3', rustle: 'snd/rustle.mp3', ping: 'snd/ping.mp3', clink: 'snd/clink.mp3', crash: 'snd/crash.mp3' }
  Snd.def(SND)
  let loaded = 0
  const boot = $('#boot')
  function bootDone() { if (boot.classList.contains('out')) return; boot.classList.add('out'); setTimeout(() => boot.hidden = true, 380); window.__ssReady = true }
  // 準備完了はタイトルに要る絵だけ。残りは裏で読む（遊ぶ画面に要るのは数秒あと）
  const FIRST = ['img/guru_talk.webp', 'img/aud2_away.webp', 'img/guru_doze.webp', 'img/guru_deep.webp']
  const pre = u => new Promise(ok => { const i = new Image(); i.onload = i.onerror = () => { loaded++; boot.style.setProperty('--p', Math.min(1, loaded / FIRST.length)); ok() }; i.src = u })
  Promise.all(FIRST.map(pre)).then(() => { bootDone(); IMGS.filter(u => !FIRST.includes(u)).forEach(u => { const i = new Image(); i.src = u }) })
  setTimeout(bootDone, 12000)
  window.__jsUp = true

  // ---------- 画面の切り替え
  const views = ['#vTitle', '#vHow', '#vPlay', '#vResult']
  function show(v) { views.forEach(x => $(x).hidden = x !== v); document.body.classList.toggle('playing', v === '#vPlay') }
  let muted = store.get('ss_mute') === '1'
  function setMute(m) { muted = m; Snd.setMute(m); store.set('ss_mute', m ? '1' : '0'); document.querySelectorAll('.icOn').forEach(e => e.hidden = m); document.querySelectorAll('.icOff').forEach(e => e.hidden = !m) }
  setMute(muted)
  function snd() { Snd.init() }
  $('#bMute').onclick = () => { snd(); setMute(!muted) }
  $('#bMuteP').onclick = () => { snd(); setMute(!muted) }
  $('#bLang').onclick = () => { lang = lang === 'ja' ? 'en' : 'ja'; store.set('ss_lang', lang); applyLang() }
  $('#bHow').onclick = () => { snd(); Snd.play('click'); show('#vHow') }
  $('#bHowBack').onclick = () => show('#vTitle')
  $('#bStart').onclick = () => { snd(); Snd.play('click'); start() }
  $('#bAgain').onclick = () => { snd(); start() }
  $('#bTitle').onclick = () => { stopLoops(); show('#vTitle') }

  // ---------- 遊び
  let run = null, hold = false, chPress = null, itPress = false, paused = false, resultAt = 0, built = -1, lastPhase = ''
  const fx = { bub: [], caught: {}, snoring: false, buzzT: 0, lineT: 3, hints: {}, hint: null, tips: {}, tipQ: [], tipT: 0, chat: [], chatT: 0, phase: {}, swayT: 0, fallT: 0, slipT: 0 }
  const stage = $('#stage'), actors = $('#actors'), guru = $('#guru'), gImg = $('#guruImg')

  function start(seed, opt = {}) {
    const s = seed != null ? seed : (qs.get('seed') ? Number(qs.get('seed')) : (Math.random() * 1e9) | 0)
    const tut = opt.tutorial != null ? opt.tutorial : store.get('ss_tut') !== '1'
    run = C.makeRun(s, { tutorial: tut, tilt: opt.tilt })
    built = -1; resultAt = 0; hold = false; chPress = null; itPress = false; lastPhase = ''; lastTop = ''; lastItem = ''
    fx.caught = {}; fx.snoring = false; fx.buzzT = 0; fx.lineT = 3; fx.hints = {}; fx.tips = {}; fx.tipQ = []; fx.tipT = 0; fx.chat = []; fx.chatT = 0; fx.phase = {}; fx.swayT = 0; fx.fallT = 0; fx.slipT = 0; clearFx(); hideHint(); hideChoices()
    // 見る人の付箋（合図の覚え方）は最初の3回だけ
    const nr = Number(store.get('ss_runs') || 0); fx.tipOn = nr < 3; store.set('ss_runs', String(nr + 1))
    show('#vPlay'); buildPlanner(); updateTop(true); updateItem(true)
    Snd.loop('bgm', 'snd/bgm.mp3', 0.16); Snd.loop('snore', null)
    if (window.TM) TM.start()
    acc = 0; lastT = performance.now()
  }
  function stopLoops() { Snd.loop('bgm', null); Snd.loop('amb', null); Snd.loop('snore', null) }

  // 目を押している間は寝る
  const eye = $('#eye')
  eye.addEventListener('pointerdown', e => { e.preventDefault(); snd(); hold = true; try { eye.setPointerCapture(e.pointerId) } catch (er) {} })
  const up = () => { hold = false }
  eye.addEventListener('pointerup', up); eye.addEventListener('pointercancel', up); eye.addEventListener('lostpointercapture', up)
  // 変装ボタン
  const itB = $('#item')
  itB.addEventListener('pointerdown', e => { e.preventDefault(); snd(); if (run && run.items.length && !run.wear) itPress = true })
  // 言い訳の3択（吹き出し）
  const choices = $('#choices')
  choices.addEventListener('pointerdown', e => { const b = e.target.closest('.chc'); if (!b) return; e.preventDefault(); if (run && run.spot) chPress = Number(b.dataset.i) })
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && !e.repeat && run && !$('#vPlay').hidden) { hold = true; e.preventDefault() }
    if (run && run.spot && ['1', '2', '3'].includes(e.key)) chPress = Number(e.key) - 1
    if (run && !run.spot && (e.key === 'i' || e.key === 'Enter') && run.items.length && !run.wear) itPress = true
  })
  window.addEventListener('keyup', e => { if (e.code === 'Space') hold = false })
  window.addEventListener('blur', () => { hold = false })

  // ---------- 1コマ
  let acc = 0, lastT = performance.now()
  const DT = 1 / 60
  function frame(now) {
    const d = Math.min(0.1, (now - lastT) / 1000); lastT = now
    if (run && !$('#vPlay').hidden) {
      if (!paused) { acc += d; while (acc >= DT) { acc -= DT; tick() } }
      render(now / 1000)
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  function tick() {
    if (run.over) { if (resultAt && performance.now() >= resultAt) { resultAt = 0; showResult() } return }
    const inp = { hold, choice: chPress, item: itPress }; chPress = null; itPress = false
    if (window.__ssBot) Object.assign(inp, window.__ssBot(run, DT, Math.random) || {})
    C.step(run, DT, inp)
    for (const e of run.ev.splice(0)) onEvent(e)
    fxTick(DT)
  }

  // ---------- 出来事 から 音と演出
  function onEvent(e) {
    const t = T(), sc = run.scene
    const wk = i => { const w = sc.ws[i]; return w ? C.wKind(w, sc.t) : 'jour' }
    switch (e.type) {
      case 'scene': clearFx(); Snd.play('flip', { vol: 0.7 }); Snd.loop('amb', ['tv', 'gym', 'live'].includes(sc.id) ? null : 'snd/murmur.mp3', sc.id === 'interview' ? 0.12 : 0.2); fx.lineT = 2.5; fx.chat = []; break
      case 'sleep': break
      case 'wake': if (e.deep) { Snd.play('boing', { vol: 0.5 }); ono(lang === 'ja' ? 'はっ' : 'Huh!', 'guru', 0.9) } break
      case 'snore': Snd.play('sn', { vol: 0.9 }); break
      case 'warn': Snd.play('vib', { vol: 0.45 }); break
      case 'buzz': Snd.play('watch', { vol: 1 }); Snd.play('vib', { vol: 0.8 }); fx.buzzT = 1.6; break
      case 'forced': Snd.play('yawn', { vol: 0.8 }); break
      case 'alert': break
      case 'pickup': {
        Snd.play('click', { vol: 0.6 })
        const from = e.from === 'asst' ? t.itemFrom.asst[e.id] : t.itemFrom[e.from]
        const who = e.from === 'fan' ? 'w0' : e.from === 'asst' ? 'w' + sc.ws.findIndex(w => w.kind === 'asst') : 'guru'
        bubble(who, from, 2.2, e.from === 'stylist' ? 'g' : '')
        itB.animate([{ transform: 'scale(1.35) rotate(-8deg)' }, { transform: 'none' }], { duration: 500, easing: 'ease-out' })
        if (!store.get('ss_item')) { store.set('ss_item', '1'); showHint(t.tutItem, '#item', 2.8) }
        break
      }
      case 'wear': Snd.play('click', { vol: 0.7 }); fx.slipT = 0; break
      case 'slip': Snd.play('boing', { vol: 0.5, rate: 1.3 }); ono(t.slip, 'guru', 1); fx.slipT = 0.9; break
      case 'unwear': break
      case 'sus': {
        bubble('w' + e.w, e.lv === 1 ? t.sus1[e.id] : t.sus2, 1.8)
        Snd.play('shutter', { vol: 0.35 })
        break
      }
      case 'mutter': {
        bubble('guru', t.mutters[e.line], 2.6, 'mut')
        break
      }
      case 'viral': {
        fx.caught[e.w] = 0
        Snd.duck(0.3, 1.6); Snd.play('applause', { vol: 0.8 }); Snd.play('shutter', { vol: 0.5, delay: 0.3 })
        bubble('w' + e.w, t.viral, 1.8, 'shout')
        trendTag(t.viralTag)
        break
      }
      case 'fall': {
        Snd.play('crash', { vol: 0.9 }); Snd.play('boing', { vol: 0.6, rate: 0.7 })
        ono(t.fallOno, 'guru', 1.2); fx.fallT = 1.6
        stage.animate([{ transform: 'translate(0,6px)' }, { transform: 'translate(0,-3px)' }, { transform: 'none' }], { duration: 300 })
        break
      }
      case 'spot': {
        Snd.duck(0.25, 2.2); Snd.play('boing', { vol: 0.7, rate: 0.8 })
        fx.caught[e.w] = 99
        showChoices()
        bubble('guru', t.exThink, 2.2, 'g')
        if (fx.hints.excuse !== 1 && (run.tutorial || !store.get('ss_choose'))) { fx.hints.excuse = 1; store.set('ss_choose', '1'); showHint(t.tutChoose, null, 2.2) }
        break
      }
      case 'excuse': {
        fx.caught[e.w] = 0; hideChoices()
        const k = wk(e.w)
        Snd.play('gong', { vol: 0.9 })
        if (e.id === 'kage') Snd.play('laugh', { vol: 0.75, delay: 0.3 })
        else if (e.fit === 'good') Snd.play('applause', { vol: 0.5, delay: 0.5 })
        else if (e.fit === 'bad') Snd.play('laugh', { vol: 0.65, delay: 0.4 })
        bubble('guru', t.ex[e.id], 1.6, 'shout')
        const r = e.id === 'kage' ? t.reactKage : e.reuse ? t.reactReuse : e.fit === 'good' ? t.reactGood[sc.id] : e.fit === 'bad' ? t.reactBad[sc.id] : t.reactMid[e.k % t.reactMid.length]
        bubble('w' + e.w, r, 1.6); void k
        hideHint()
        break
      }
      case 'excuseFail': {
        hideChoices()
        Snd.play('gong', { vol: 0.9 }); Snd.play('laugh', { vol: 0.7, delay: 0.3 })
        bubble('guru', t.ex[e.id], 1.5, 'shout'); bubble('w' + e.w, t.reactFail, 1.5)
        break
      }
      case 'exposed': {
        hideChoices()
        const w = sc.ws[e.w]; fx.caught[e.w] = 1.8
        Snd.loop('snore', null); Snd.play('burst', { vol: 0.9 }); Snd.play('boing', { vol: 0.6 }); Snd.duck(0.3, 2)
        flash()
        if (!fx.bub.some(b => b.who === 'w' + e.w)) bubble('w' + e.w, t.caught[e.why === 'fall' ? 'fall' : e.kind] || '!!', 1.6, 'shout')
        $('#phone').classList.remove('down'); void $('#phone').offsetWidth; $('#phone').classList.add('down')
        hideHint(); void w
        break
      }
      case 'trend': {
        hideChoices()
        fx.caught[e.w] = 1.8; Snd.play('applause', { vol: 0.8 }); Snd.play('shutter', { vol: 0.6 }); flash()
        trendTag(t.trend)
        break
      }
      case 'over': {
        stopLoops(); Snd.duck(0.2, 1); hideChoices()
        resultAt = performance.now() + (e.reason === 'scoop' ? 1900 : 900)
        break
      }
    }
  }

  function fxTick(dt) {
    fx.bub = fx.bub.filter(b => { b.left -= dt; if (b.left <= 0) { b.el.remove(); return false } return true })
    for (const k in fx.caught) if (fx.caught[k] < 50) fx.caught[k] -= dt
    if (fx.buzzT > 0) fx.buzzT -= dt
    // 起きている時のひとこと（4〜6秒ごと。文字は同時に2つまで）
    if (run.phase === 'play' && run.g.st === 'awake' && !run.spot) {
      fx.lineT -= dt
      if (fx.lineT <= 0 && !fx.bub.some(b => b.who === 'guru')) {
        const L = T().lines[run.scene.id]; const sc = run.scene
        if (sc.id === 'sign' && Math.floor(sc.t) % 2) bubble('w0', T().fanAsk[Math.floor(sc.t / 3) % 3], 1.8)
        else bubble('guru', L[Math.floor(sc.t * 7) % L.length], 1.8, 'g')
        fx.lineT = 4 + (sc.t * 13 % 2)
      }
    }
    // いびき
    const snoring = C.asleep(run) && run.g.depth >= P.SNORE && run.g.st !== 'waking'
    if (snoring !== fx.snoring) { fx.snoring = snoring; Snd.loop('snore', snoring ? 'snd/snoreloop.mp3' : null, 0.55, 0.15) }
    if (run.phase === 'play') tells(dt)
    // 傾き: ゆら… と出す
    if (fx.swayT > 0) fx.swayT -= dt
    if (fx.fallT > 0) fx.fallT -= dt
    if (fx.slipT > 0) fx.slipT -= dt
    if (run.tilt > 0.3 && fx.swayT <= 0 && C.asleep(run)) { fx.swayT = 1.3; ono(T().swayOno, 'guru', 1.1) }
    if (run.tilt > 0.4 && !store.get('ss_tilt')) { store.set('ss_tilt', '1'); showHint(T().tutTilt, '#eye', 2.4) }
    tutorial()
  }
  // ---------- 見る人の合図: 段が変わった瞬間に音を鳴らし、初めての人には付箋で覚え方を出す
  const SPLIT = { jour: 0.45, oba: 0.55, jii: 0.6, asst: 0.6, shacho: 1, cam: 1, phone: 1, kid: 1 }
  function tellPhase(w, t) {
    const st = C.wState(w, t), k = C.wKind(w, t), sg = C.wSeg(w, t)
    const p = st === 'turn' && sg ? Math.min(1, (t - sg.s) / Math.max(0.01, sg.e - sg.s)) : 0
    return { st, k, p, ph: st === 'turn' ? (p < SPLIT[k] ? 0 : 1) : -1, alert: !!(sg && sg.alert) }
  }
  function tells(dt) {
    const sc = run.scene, t = sc.t
    sc.ws.forEach((w, i) => {
      const s = tellPhase(w, t), key = s.st + s.ph + s.k
      if (fx.phase[i] === key) return
      fx.phase[i] = key
      if (s.k === 'phone' && s.st === 'turn') fx.chatT = 0
      if (s.st === 'turn' && s.ph === 0 && !s.alert) {
        const sn = { jour: 'click', oba: 'rustle', asst: 'ping', shacho: 'clink' }[s.k]
        if (sn) Snd.play(sn, { vol: s.k === 'jour' ? 0.45 : 0.6 })
      }
      if ((s.st === 'turn' || s.st === 'fidget') && fx.tipOn && !fx.tips[s.k]) { fx.tips[s.k] = 1; fx.tipQ.push({ k: s.k, i }) }
    })
    // 付箋は1枚ずつ
    if (fx.tipT > 0) { fx.tipT -= dt; if (fx.tipT <= 0) { const el = $('#tip'); if (el) el.remove() } }
    if (fx.tipT <= 0 && fx.tipQ.length) {
      const q = fx.tipQ.shift(), el = document.createElement('div'); el.id = 'tip'; el.className = 'tip'; el.dataset.w = 'w' + q.i
      el.innerHTML = `<b>${T().names[q.k]}</b>${T().tips[q.k]}`; fxl.appendChild(el); fx.tipT = 2.8
    }
    // 配信のコメント（ふだんはゆっくり、合図で「寝てない？」が流れ始める）
    const ph = sc.ws.find(w => w.kind === 'phone')
    if (ph) {
      const st = C.wState(ph, t), win = sc.wins.some(w => t >= w.s && t < w.e)
      fx.chatT -= dt
      if (!win && fx.chatT <= 0) {
        const L = T().chat[st === 'turn' ? 'turn' : st === 'look' || st === 'caught' ? 'look' : 'away']
        fx.chat.push({ t: L[Math.floor(Math.random() * L.length)], c: st === 'turn' ? 'h' : '' }); if (fx.chat.length > 4) fx.chat.shift()
        fx.chatT = st === 'turn' ? 0.26 : st === 'look' ? 0.8 : 1.0
      }
    }
  }

  // ---------- チュートリアル（最初の1回）
  function tutorial() {
    if (!run.tutorial) { if (run.D > 88 && !fx.hints.limit && run.phase === 'play' && store.get('ss_lim') !== '1') { fx.hints.limit = 1; store.set('ss_lim', '1'); showHint(T().tutLimit, '#eye', 2.6) } return }
    const sc = run.scene, t = sc.t, t_ = T()
    if (run.phase !== 'play' || run.spot) return
    const win = sc.wins.find(w => t >= w.s && t < w.e)
    const turning = sc.ws.some(w => C.wState(w, t) === 'turn')
    if (run.idx === 0 && win && !hold && !fx.hints.sleep && C.wState(sc.ws[0], t) === 'away' && C.wState(sc.ws[1], t) === 'away') { fx.hints.sleep = 1; showHint(t_.tutSleep, '#eye') }
    if (fx.hint === t_.tutSleep && hold) hideHint()
    if (hold && turning && !fx.hints.let) { fx.hints.let = 1; showHint(sc.id === 'tv' ? t_.tutLet : t_.tutTurn, null, 2.4) }
    void win
    if (run.g.depth >= P.WARN && C.asleep(run) && !fx.hints.watch) { fx.hints.watch = 1; showHint(t_.tutWatch, '#watch', 2.4) }
    if (run.D > 88 && !fx.hints.limit) { fx.hints.limit = 1; showHint(t_.tutLimit, '#eye', 2.6) }
    if (run.idx >= 2) { run.tutorial = false; store.set('ss_tut', '1') }
  }
  let hintTimer = 0
  function showHint(text, target, sec) {
    const h = $('#hint'); h.textContent = text; h.hidden = false; fx.hint = text
    const f = $('#finger')
    if (target) {
      const r = $(target).getBoundingClientRect(), c = $('#ctrl').getBoundingClientRect()
      f.hidden = false; f.style.left = (r.left - c.left + r.width / 2 - 10) + 'px'; f.style.top = (r.top - c.top + r.height / 2 - 6) + 'px'
    } else f.hidden = true
    clearTimeout(hintTimer); if (sec) hintTimer = setTimeout(hideHint, sec * 1000)
  }
  function hideHint() { $('#hint').hidden = true; $('#finger').hidden = true; fx.hint = null }
  // 言い訳の3択（吹き出しのボタン）
  function showChoices() {
    const o = run.spot.opts, tx = T()
    choices.innerHTML = o.map((id, i) => `<button type="button" class="chc${id === 'kage' ? ' kage' : ''}" data-i="${i}" data-id="${id}">${tx.ex[id]}</button>`).join('')
    choices.hidden = false
  }
  function hideChoices() { choices.hidden = true; choices.innerHTML = '' }

  // ---------- 吹き出し・擬音
  const fxl = $('#fxl')
  function clearFx() { fxl.innerHTML = ''; fx.bub = [] }
  function bubble(who, text, sec, cls) {
    fx.bub = fx.bub.filter(b => { if (b.who === who) { b.el.remove(); return false } return true })
    while (fx.bub.length >= 2) fx.bub.shift().el.remove()
    const el = document.createElement('div'); el.className = 'bub ' + (cls || ''); el.textContent = text; fxl.appendChild(el)
    fx.bub.push({ who, el, left: Math.max(sec, 0.9 + text.length * 0.09) })
  }
  function ono(text, who, sec) {
    const el = document.createElement('div'); el.className = 'ono'; el.textContent = text; fxl.appendChild(el)
    const a = anchor(who); el.style.left = (a.x + 30) + 'px'; el.style.top = (a.y - 10) + 'px'
    el.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: .3 }, { transform: 'translate(-50%,-80%) scale(1)', opacity: 0 }], { duration: sec * 1000, easing: 'ease-out' }).onfinish = () => el.remove()
  }
  function flash() { $('#flash').animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' }); stage.animate([{ transform: 'translate(4px,-3px)' }, { transform: 'translate(-4px,3px)' }, { transform: 'none' }], { duration: 260 }) }
  function trendTag(text) {
    const el = document.createElement('div'); el.id = 'trendTag'; el.textContent = text; fxl.appendChild(el)
    el.animate([{ transform: 'translateX(-50%) rotate(-3deg) scale(1.6)', opacity: 0 }, { transform: 'translateX(-50%) rotate(-3deg) scale(1)', opacity: 1, offset: .15 }, { opacity: 1, offset: .85 }, { opacity: 0 }], { duration: 2600 }).onfinish = () => el.remove()
  }

  // ---------- 場面の絵
  const CAM_SVG = '<svg viewBox="0 0 120 150"><g stroke="#111" stroke-width="3" stroke-linejoin="round"><path d="M60 92 L30 148 M60 92 L90 148 M60 92 L60 148" fill="none"/><rect x="18" y="34" width="78" height="52" rx="6" fill="#3d4352"/><rect x="96" y="44" width="20" height="32" rx="3" fill="#2a2f3a"/><circle cx="106" cy="60" r="11" fill="#111"/><circle cx="106" cy="60" r="6" fill="#3b5d9a"/><rect x="26" y="20" width="44" height="16" rx="3" fill="#2a2f3a"/><rect x="2" y="44" width="16" height="22" rx="3" fill="#2a2f3a"/></g><circle class="tglow" cx="40" cy="14" r="16" fill="#ff3a2a" opacity="0" style="filter:blur(4px)"/><circle class="tally" cx="40" cy="14" r="8" stroke="#111" stroke-width="3"/><text x="58" y="70" font-size="14" font-weight="800" fill="#cfd5e4" text-anchor="middle">{L}</text></svg>'
  const PHONE_SVG = '<svg viewBox="0 0 110 170"><g stroke="#111" stroke-width="3" stroke-linejoin="round"><path d="M55 112 L28 168 M55 112 L82 168 M55 112 L55 168" fill="none"/><circle cx="55" cy="56" r="52" fill="#fff6d8" opacity=".9"/><circle cx="55" cy="56" r="40" fill="#1f2a44"/><rect x="30" y="14" width="50" height="94" rx="9" fill="#111"/><rect x="35" y="22" width="40" height="78" rx="4" fill="#2d3550"/></g><g class="rec"><circle cx="43" cy="32" r="4" fill="#ff2a1a"/><text x="50" y="36" font-size="11" font-weight="800" fill="#fff">REC</text></g><g class="freeze"><circle cx="55" cy="64" r="11" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="40 30"><animateTransform attributeName="transform" type="rotate" from="0 55 64" to="360 55 64" dur="1s" repeatCount="indefinite"/></circle></g></svg>'
  const BG = {
    tv: `<svg viewBox="0 0 100 160" preserveAspectRatio="xMidYMax slice" width="100%" height="100%"><rect width="100" height="160" fill="#7cc6ef"/><circle cx="74" cy="52" r="30" fill="#ffd23a"/><g stroke="#ffd23a" stroke-width="5">${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<line x1="74" y1="52" x2="${74 + 48 * Math.cos(i * .785)}" y2="${52 + 48 * Math.sin(i * .785)}"/>`).join('')}</g><circle cx="74" cy="52" r="24" fill="#ffb21a" stroke="#fff" stroke-width="3"/><rect y="112" width="100" height="48" fill="#3a6fb7"/><rect y="110" width="100" height="5" fill="#fff"/><rect x="58" y="118" width="46" height="42" fill="#fff" stroke="#1d1a17" stroke-width="1.5"/><rect x="58" y="118" width="46" height="8" fill="#f07a1a"/></svg>`,
    seminar: `<svg viewBox="0 0 100 160" preserveAspectRatio="xMidYMax slice" width="100%" height="100%"><rect width="100" height="160" fill="#2a1b2e"/><path d="M0 0 h18 q-4 60 2 160 h-20z" fill="#a3202a"/><path d="M100 0 h-14 q5 60 -2 160 h16z" fill="#a3202a"/><path d="M0 0 h100 v10 q-50 8 -100 0z" fill="#c22c33"/><rect y="118" width="100" height="42" fill="#6b3d22"/><rect y="116" width="100" height="4" fill="#e9c27a"/><rect x="62" y="104" width="22" height="30" fill="#5a3216" stroke="#1d1a17" stroke-width="1.2"/><rect x="60" y="102" width="26" height="5" fill="#e9c27a" stroke="#1d1a17" stroke-width="1"/></svg>`,
    sign: `<svg viewBox="0 0 100 160" preserveAspectRatio="xMidYMax slice" width="100%" height="100%"><rect width="100" height="160" fill="#efe1c4"/>${[0, 1, 2, 3].map(r => `<rect x="0" y="${14 + r * 24}" width="100" height="3" fill="#8a5a33"/>` + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => `<rect x="${i * 8.4 + (r % 2) * 3}" y="${2 + r * 24}" width="${4 + (i * 7 + r) % 4}" height="12" fill="${['#c94a3a', '#3f6fb0', '#e3b33a', '#5a8a4a', '#7a4a8a'][(i + r * 2) % 5]}"/>`).join('')).join('')}<rect x="60" y="20" width="34" height="46" fill="#fff" stroke="#1d1a17" stroke-width="1.5"/><rect x="60" y="20" width="34" height="12" fill="#d8261c"/><text x="77" y="29.5" font-size="8" font-weight="800" fill="#fff" text-anchor="middle">寝るな。</text><rect y="122" width="100" height="38" fill="#7a4a2a"/><rect x="0" y="118" width="100" height="6" fill="#a8703f"/></svg>`,
    gym: `<svg viewBox="0 0 100 160" preserveAspectRatio="xMidYMax slice" width="100%" height="100%"><rect width="100" height="160" fill="#d9dde3"/><rect x="4" y="10" width="92" height="70" fill="#b7c7d6" stroke="#8b9aa8" stroke-width="2"/><path d="M10 74 L40 16 M30 76 L58 22" stroke="#e8f0f7" stroke-width="4" opacity=".7"/><rect y="118" width="100" height="42" fill="#2e3138"/>${[0, 1, 2, 3, 4].map(i => `<rect x="${8 + i * 9}" y="96" width="7" height="22" rx="2" fill="#1d1a17"/><rect x="${6 + i * 9}" y="${100 + (i % 2) * 6}" width="11" height="6" rx="1" fill="#e04a2a"/>`).join('')}<rect x="4" y="94" width="50" height="3" fill="#5c5f66"/></svg>`,
    interview: `<svg viewBox="0 0 100 160" preserveAspectRatio="xMidYMax slice" width="100%" height="100%"><rect width="100" height="160" fill="#e9d8bd"/><rect x="8" y="14" width="56" height="62" fill="#9ccbe8" stroke="#5b3a22" stroke-width="3"/><rect x="34" y="14" width="3" height="62" fill="#5b3a22"/><rect x="8" y="44" width="56" height="3" fill="#5b3a22"/><rect x="12" y="52" width="10" height="24" fill="#8fb0c6"/><rect x="24" y="44" width="8" height="32" fill="#7f9db3"/><rect x="40" y="56" width="12" height="20" fill="#8fb0c6"/><circle cx="82" cy="34" r="10" fill="#4f8a4a"/><rect x="80" y="40" width="4" height="40" fill="#6b4a2a"/><rect y="118" width="100" height="42" fill="#7a5233"/><rect x="0" y="122" width="100" height="10" fill="#f6efe3" stroke="#1d1a17" stroke-width="1"/></svg>`,
    dinner: `<svg viewBox="0 0 100 160" preserveAspectRatio="xMidYMax slice" width="100%" height="100%"><rect width="100" height="160" fill="#5a2a22"/><rect y="0" width="100" height="70" fill="#7a3a2c"/>${[0, 1, 2, 3, 4, 5, 6].map(i => `<rect x="${i * 15}" y="0" width="2" height="70" fill="#8e4a3a"/>`).join('')}<g fill="#ffd27a"><circle cx="50" cy="16" r="3"/><circle cx="40" cy="20" r="2.4"/><circle cx="60" cy="20" r="2.4"/><circle cx="32" cy="24" r="2"/><circle cx="68" cy="24" r="2"/></g><path d="M30 12 Q50 34 70 12" stroke="#e0b25a" stroke-width="1.5" fill="none"/><rect y="118" width="100" height="42" fill="#3a1a14"/><rect x="0" y="116" width="100" height="16" fill="#fbf4e6" stroke="#1d1a17" stroke-width="1"/>${[14, 30, 46].map(x => `<path d="M${x} 102 l-3 -10 h8 l-3 10 v12 h-2z" fill="#f3e1e6" stroke="#1d1a17" stroke-width=".8"/><path d="M${x - 2.6} 96 h6.2 l-1 -4 h-4.2z" fill="#9a1a2a"/>`).join('')}</svg>`,
    live: `<svg viewBox="0 0 100 160" preserveAspectRatio="xMidYMax slice" width="100%" height="100%"><rect width="100" height="160" fill="#1b1f3a"/><rect x="58" y="12" width="36" height="24" fill="#2b3264" stroke="#4b56a0" stroke-width="1.5"/><text x="76" y="27" font-size="7" font-weight="800" fill="#ff7ac0" text-anchor="middle">NO SLEEP</text><circle cx="18" cy="22" r="6" fill="#f6e7a8"/><circle cx="20" cy="20" r="6" fill="#1b1f3a"/><rect y="118" width="100" height="42" fill="#2a2440"/><rect x="66" y="100" width="34" height="20" fill="#3a3358" stroke="#111" stroke-width="1"/><rect x="70" y="92" width="10" height="8" fill="#ffd23a"/></svg>`,
  }
  const SIGN_POS = { sign: 'left:4%;top:4%;width:52%', tv: 'left:46%;top:5%;width:30%', seminar: 'left:6%;top:6%;width:56%', gym: 'left:6%;top:4%;width:44%', interview: 'left:6%;top:2%;width:52%', dinner: 'left:6%;top:4%;width:56%', live: 'left:4%;top:3%;width:52%' }
  function buildScene() {
    const sc = run.scene, L = LAY[sc.id]
    $('#bg').innerHTML = BG[sc.id]
    actors.innerHTML = ''
    stage.dataset.scene = sc.id
    // 掲示（VTR・スライドなど）
    const sg = document.createElement('div'); sg.className = 'sign'; sg.id = 'sign'; sg.style.cssText = SIGN_POS[sc.id] || 'display:none'
    actors.appendChild(sg)
    sc.ws.forEach((w, i) => {
      const p = L.w[i], el = document.createElement('div')
      el.id = 'w' + i; el.dataset.i = i
      if (w.kind === 'cam') { el.className = 'cam'; el.innerHTML = CAM_SVG.replace('{L}', w.id === 'camB' ? 'B' : w.id === 'camA' ? 'A' : '') + '<div class="hand"></div>' }
      else if (w.kind === 'phone') { el.className = 'phonecam'; el.innerHTML = PHONE_SVG }
      else { el.className = 'spr w'; el.innerHTML = '<img alt="">' }
      // 名札（誰か一目で分かるように）
      const nm = document.createElement('span'); nm.className = 'nm'; el.appendChild(nm)
      el.style.left = p.x + '%'; el.style.bottom = p.y + '%'; el.style.height = p.h + '%'
      el.style.zIndex = p.y < 20 ? 3 : 2
      actors.appendChild(el)
    })
    // 机（サイン会・取材・会食は先生の足元を隠す）
    if (['sign', 'interview', 'dinner'].includes(sc.id)) {
      const d = document.createElement('div'); d.style.cssText = 'position:absolute;right:-2%;bottom:0;width:62%;height:17%;z-index:6;background:' + (sc.id === 'dinner' ? '#fbf4e6' : sc.id === 'sign' ? '#a8703f' : '#7a5233') + ';border-top:3px solid #1d1a17;box-shadow:0 -3px 0 rgba(255,255,255,.4) inset'
      if (sc.id === 'sign') d.innerHTML = '<div style="position:absolute;left:12%;top:-60%;width:22%;height:62%;background:#fff;border:2px solid #1d1a17;box-shadow:4px 4px 0 #d8261c,8px 8px 0 #fff,8px 8px 0 1px #1d1a17"></div>'
      if (sc.id === 'interview') d.innerHTML = '<div style="position:absolute;left:6%;top:-22%;width:12%;height:28%;background:#222;border-radius:3px;border:2px solid #111"><i style="position:absolute;right:3px;top:3px;width:5px;height:5px;border-radius:50%;background:#ff2a1a"></i></div>'
      actors.appendChild(d)
    }
    // 配信のコメント欄
    if (sc.id === 'live') { const ch = document.createElement('div'); ch.className = 'chat'; ch.id = 'chat'; actors.appendChild(ch) }
    guru.style.height = (sc.id === 'live' ? 74 : 80) + '%'
    built = run.idx
  }
  // 見る人の絵。合図は前半と後半で絵が変わる（記者: 書く手が止まる から 顔を上げる など）
  function sprite(k, st, caught, ph, alert, i) {
    const a = (n) => 'img/' + n + '.webp'
    if (k === 'jour') return a('jour_' + (caught ? 'gotcha' : st === 'look' ? 'stare' : st === 'turn' ? (ph === 0 ? 'write' : 'lift') : st === 'zzz' ? 'zzz' : 'write'))
    if (k === 'oba') return a('oba_' + (caught ? 'shock' : st === 'look' ? 'look' : st === 'turn' && ph === 1 ? 'turn' : 'away'))
    if (k === 'jii') return a('aud2_' + (caught ? 'shock' : st === 'look' ? 'look' : st === 'turn' ? (alert ? 'cup' : ph === 0 ? 'hear' : 'turn') : 'away'))
    if (k === 'kid') return a('kid_' + (caught ? 'shock' : st === 'look' || st === 'turn' ? 'look' : st === 'fidget' ? 'fidget' : 'still'))
    if (k === 'shacho') return a('shacho_' + (caught ? 'shock' : st === 'look' ? 'look' : st === 'turn' ? 'turn' : 'away'))
    if (k === 'asst') return a('asst_' + (caught ? 'shock' : st === 'look' ? 'look' : st === 'turn' ? (ph === 0 ? 'phone' : 'turn') : st === 'zzz' ? 'zzz' : (run.scene.id === 'live' || i % 2 ? 'phone' : 'busy')))
    return ''
  }
  // カメラマンの指（3・2・1）
  function handSvg(n) {
    let f = ''
    for (let j = 0; j < n; j++) f += `<rect x="${14 + j * 11}" y="4" width="9" height="26" rx="4.5" fill="#fff" stroke="#111" stroke-width="2.5"/>`
    return `<svg viewBox="0 0 60 70"><rect x="10" y="26" width="40" height="30" rx="10" fill="#fff" stroke="#111" stroke-width="2.5"/>${f}<rect x="16" y="54" width="28" height="14" fill="#2a2f3a" stroke="#111" stroke-width="2.5"/></svg>`
  }
  function setSrc(img, src) { if (img.getAttribute('src') !== src) img.setAttribute('src', src) }

  // ---------- 描く
  const beams = $('#beams')
  function anchor(who) {
    const s = stage.getBoundingClientRect()
    if (who === 'guru') { const r = gImg.getBoundingClientRect(); return { x: r.left - s.left + r.width * 0.42, y: r.top - s.top + r.height * 0.14, top: r.top - s.top } }
    const el = $('#' + who); if (!el) return { x: 0, y: 0, top: 0 }
    const r = el.getBoundingClientRect()
    if (el.classList.contains('cam')) return { x: r.left - s.left + r.width * 0.86, y: r.top - s.top + r.height * 0.4, top: r.top - s.top }
    if (el.classList.contains('phonecam')) return { x: r.left - s.left + r.width * 0.5, y: r.top - s.top + r.height * 0.3, top: r.top - s.top }
    return { x: r.left - s.left + r.width * 0.62, y: r.top - s.top + r.height * 0.32, top: r.top - s.top }
  }
  function render(now) {
    if (!run) return
    if (built !== run.idx) buildScene()
    const sc = run.scene, t = sc.t, g = run.g, tx = T()
    // 手帳
    const card = $('#card')
    if (run.phase === 'card' && !run.over) { if (card.hidden) { card.hidden = false; buildPlanner() } } else card.hidden = true
    // 見る人
    const sw = stage.getBoundingClientRect()
    let beamHtml = ''
    const ga = anchor('guru')
    const win = sc.wins.find(w => t >= w.s && t < w.e)
    sc.ws.forEach((w, i) => {
      const el = $('#w' + i); if (!el) return
      const tp = tellPhase(w, t), st = tp.st, k = tp.k
      const caught = (fx.caught[i] || 0) > 0 || (run.spot && run.spot.w === i)
      let extra = ''
      if (!caught && st === 'turn' && tp.ph === 0) extra = k === 'asst' ? ' glow' : k === 'oba' ? ' rustle' : k === 'jii' ? ' fiddle' : ''
      if (!caught && st === 'fidget') extra = ' fidget'
      el.className = (w.kind === 'cam' ? 'cam ' : w.kind === 'phone' ? 'phonecam ' : 'spr w ') + (caught ? 'caught' : st) + extra
      if (w.kind !== 'cam' && w.kind !== 'phone') setSrc(el.querySelector('img'), sprite(k, st, caught, tp.ph, tp.alert, i))
      const nm = el.querySelector('.nm'), nmT = tx.names[k] + (w.id === 'camA' ? ' A' : w.id === 'camB' ? ' B' : '')
      if (nm && nm.textContent !== nmT) nm.textContent = nmT
      // カメラマンの指: 合図の間 3・2・1
      if (w.kind === 'cam') { const h = el.querySelector('.hand'), n = st === 'turn' && !caught ? Math.max(1, 3 - Math.floor(tp.p * 3)) : 0; if (h.dataset.n !== String(n)) { h.dataset.n = n; h.innerHTML = n ? handSvg(n) : '' } }
      if (run.phase !== 'play') return
      const a = anchor('w' + i)
      if (caught) beamHtml += `<line x1="${a.x}" y1="${a.y}" x2="${ga.x}" y2="${ga.y}" stroke="#d8261c" stroke-width="5" stroke-linecap="round" opacity=".85"/>`
      else if (st === 'look') beamHtml += `<polygon points="${a.x},${a.y - 3} ${a.x},${a.y + 3} ${ga.x},${ga.y + 16} ${ga.x},${ga.y - 16}" fill="${run.wear && C.hiddenFrom(run, w) ? '#9fd0ff' : '#ffd23a'}" opacity=".32"/><line x1="${a.x}" y1="${a.y}" x2="${ga.x}" y2="${ga.y}" stroke="#ffd23a" stroke-width="2" opacity=".8"/>`
      else if (st === 'turn') beamHtml += `<line x1="${a.x}" y1="${a.y}" x2="${ga.x}" y2="${ga.y}" stroke="#fff" stroke-width="2.5" stroke-dasharray="3 9" stroke-linecap="round" opacity="${0.5 + 0.4 * Math.sin(now * 18)}"/>`
      // 合図の印（人ごとの擬音）。見つかった時は「!?」
      let m = el.querySelector('.mark')
      const mk = !caught && st === 'turn' ? (tx.marks[k] || ['', ''])[tp.alert ? 1 : tp.ph] || (w.kind === 'cam' || w.kind === 'phone' || k === 'asst' || k === 'shacho' || k === 'kid' ? '' : '?') : !caught && st === 'fidget' ? tx.marks.kid[0] : ''
      const wantX = caught && !fx.bub.some(b => b.who === 'w' + i)
      el.style.zIndex = mk || caught ? 5 : (LAY[sc.id].w[i].y < 20 ? 3 : 2)
      if (mk || wantX) { if (!m) { m = document.createElement('div'); m.className = 'mark'; el.appendChild(m) } m.className = 'mark' + (mk ? ' q' : ''); const tt = mk || '!?'; if (m.textContent !== tt) m.textContent = tt; m.style.left = '58%'; m.style.top = '0' } else if (m) m.remove()
    })
    // 配信のコメント欄
    const ch = $('#chat')
    if (ch) { const html = fx.chat.map(c => `<p class="${c.c}">${c.t}</p>`).join(''); if (ch.dataset.h !== html) { ch.innerHTML = html; ch.dataset.h = html } }
    // 付箋は見る人の上
    const tip = $('#tip')
    if (tip) { const a = anchor(tip.dataset.w), tw = tip.offsetWidth; tip.style.left = Math.max(tw / 2 + 4, Math.min(sw.width - tw / 2 - 4, a.x)) + 'px'; tip.style.top = Math.max(tip.offsetHeight + 4, a.top - 28) + 'px' }
    beams.setAttribute('viewBox', `0 0 ${sw.width} ${sw.height}`); beams.innerHTML = beamHtml
    // 掲示
    const sg = $('#sign')
    if (sg) {
      const id = sc.id
      let html = '', show = false
      if (id === 'tv') { show = true; html = `<div style="background:#111;border:3px solid #333;border-radius:4px;padding:6px 4px;text-align:center;color:${win ? '#ffd23a' : '#ff4a3a'};font-size:clamp(12px,3.6cqw,16px)">${win ? tx.wins.tv : 'ON AIR'}</div>` }
      else if (id === 'seminar') { show = true; html = `<div style="background:#f8f6f0;border:3px solid #1d1a17;padding:6px 8px;color:#1d1a17;font-size:clamp(12px,3.6cqw,16px);line-height:1.3;min-height:3.2em">${win ? tx.wins.seminar : (lang === 'ja' ? '睡眠は1日3分で足りる' : 'You only need 3 minutes')}</div>` }
      else if (win) { show = true; html = `<div style="display:inline-block;background:${id === 'live' ? '#111' : '#fff'};color:${id === 'live' ? '#fff' : '#1d1a17'};border:2.5px solid #1d1a17;border-radius:6px;padding:4px 8px;font-size:clamp(12px,3.6cqw,16px)">${tx.wins[id]}</div>` }
      sg.style.display = show ? '' : 'none'; if (sg.dataset.h !== html) { sg.innerHTML = html; sg.dataset.h = html }
    }
    // 先生
    let gsrc = 'guru_talk', gcls = 'awake', glass = ''
    const wear = run.wear && !run.wear.slipped ? run.wear.id : ''
    if (g.st === 'excuse') { gsrc = 'guru_excuse'; gcls = '' }
    else if (g.st === 'startle') { gsrc = fx.fallT > 0 ? 'guru_collapse' : 'guru_startle'; gcls = fx.fallT > 0 ? 'fallen' : '' }
    else if (g.st === 'praised') { gsrc = 'guru_think'; gcls = '' }
    else if (C.asleep(run)) {
      const deep = g.depth >= P.DEEP
      gsrc = deep ? (run.tilt > 0.55 ? 'guru_tilt' : run.mutter ? 'guru_mutter' : 'guru_deep') : wear === 'shades' ? 'guru_shades' : wear === 'painted' ? 'guru_painted' : wear === 'book' ? 'guru_book' : run.mutter ? 'guru_mutter' : 'guru_doze'
      gcls = g.depth >= P.SNORE && g.st !== 'waking' ? 'deep' : ''
    } else if (wear === 'book') gsrc = 'guru_book'
    else if (wear) glass = wear
    if (run.over && run.reason === 'scoop') { gsrc = 'guru_startle'; glass = '' }
    setSrc(gImg, 'img/' + gsrc + '.webp'); guru.className = 'spr ' + gcls
    // 起きている時に掛けている変装（サングラス・目のメガネ）を顔に重ねる
    const gl = $('#gGlass'); if (gl.dataset.k !== glass) { gl.dataset.k = glass; gl.innerHTML = glass ? GLASS[glass] : ''; if (glass) gl.animate([{ transform: 'translateY(-160%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'ease-out' }) }
    // 熟睡でずれ落ちるサングラス
    const sl = $('#gSlip'); const slip = fx.slipT > 0 && run.wear ? run.wear.id : ''
    if (sl.dataset.k !== slip) { sl.dataset.k = slip; sl.innerHTML = slip && slip !== 'book' ? GLASS[slip] : ''; if (slip && slip !== 'book') sl.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(-30%,420%) rotate(-50deg)', opacity: 0 }], { duration: 850, easing: 'ease-in', fill: 'forwards' }) }
    // 眠いほど頭が傾く。立ったまま熟睡すると体ごと傾く（ネクタイが揺れるように左右にも揺れる）
    gImg.style.transform = g.st === 'awake' ? `rotate(${-run.D / 100 * 5}deg)` : ''
    const tl = run.tilt || 0
    guru.style.transform = tl > 0.02 && gsrc !== 'guru_tilt' ? `rotate(${-tl * 14 + Math.sin(now * 5) * tl * 3}deg)` : tl > 0.02 ? `rotate(${-(tl - 0.55) * 10 + Math.sin(now * 5) * tl * 2}deg)` : ''
    // 吹き出しの位置
    for (const b of fx.bub) {
      const a = anchor(b.who), bw = b.el.offsetWidth
      let x = b.who === 'guru' ? ga.x - 20 : a.x, y = (b.who === 'guru' ? ga.top + 4 : a.top) - 4
      x = Math.max(bw / 2 + 4, Math.min(sw.width - bw / 2 - 4, x)); y = Math.max(b.el.offsetHeight + 4, y)
      b.el.style.left = x + 'px'; b.el.style.top = y + 'px'
      const tail = (b.who === 'guru' ? ga.x - 20 : a.x) - (x - bw / 2); b.el.style.setProperty('--tx', Math.max(12, Math.min(bw - 12, tail)) + 'px')
    }
    if (fx.snoring && Math.floor(now * 1.6) !== render.lastZ) { render.lastZ = Math.floor(now * 1.6); ono(lang === 'ja' ? 'ぐおー' : 'ZZZ', 'guru', 1.1) }
    // 見つかった瞬間
    $('#slow').classList.toggle('on', !!run.spot)
    // 目のボタン
    const lid = -92 * (1 - Math.min(1, run.D / 100) * 0.85)
    const shut = C.asleep(run) || (hold && !run.latch && run.phase === 'play')
    $('#lidU').style.transform = `translateY(${shut ? 0 : lid}px)`
    eye.classList.toggle('hold', shut)
    $('#veins').style.opacity = run.D > 70 ? Math.min(1, (run.D - 70) / 25) : 0
    eye.style.transform = run.D > 90 && g.st === 'awake' ? `translateX(${Math.sin(now * 40) * 1.5}px)` : ''
    // 腕時計
    const wt = $('#watch'), dep = C.asleep(run) ? g.depth : 0
    const clk = sceneClock()
    const buzz = fx.buzzT > 0, warn = !buzz && C.asleep(run) && g.depth >= P.WARN
    wt.className = 'watch' + (buzz ? ' buzz' : warn ? ' warn' : '')
    $('#wRing').setAttribute('stroke-dasharray', `${Math.min(1, dep / P.BUZZ) * 170} 200`)
    $('#wRing').setAttribute('stroke', dep >= P.WARN ? '#ffd23a' : dep >= P.DEEP ? '#7fa8ff' : '#3a6fd8')
    $('#wTime').textContent = C.asleep(run) ? 'Zz' : clk
    $('#wMsg').textContent = buzz ? tx.watchBuzz : warn ? tx.watchWarn : ''
    updateTop(false); updateItem(false)
  }
  function sceneClock() {
    const sc = run.scene, base = C.SCENES[run.idx].clock.split(':').map(Number)
    const mins = base[0] * 60 + base[1] + Math.floor(sc.t / sc.dur * 110)
    return Math.floor(mins / 60) % 24 + ':' + String(mins % 60).padStart(2, '0')
  }
  let lastTop = ''
  function fmtF(f) { return lang === 'ja' ? f.toFixed(1) + '万' : (f / 100).toFixed(2) + 'M' }
  function updateTop(force) {
    if (!run) return
    const key = [run.idx, run.exposures, run.excuses, Math.round(run.followers * 10), lang].join('|')
    if (!force && key === lastTop) return
    const prev = lastTop.split('|'); lastTop = key
    $('#sClock').textContent = T().scenes[run.scene.id]
    $('#sName').textContent = (run.idx + 1) + ' / ' + C.SCENES.length
    $('#dayline').innerHTML = C.SCENES.map((s, i) => `<i class="${i < run.idx ? 'd' : i === run.idx ? 'n' : ''}"></i>`).join('')
    let mk = ''
    for (let i = 0; i < P.OUT; i++) mk += i < run.exposures ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="#d8261c" stroke-width="2.4"/><text x="12" y="17" font-size="13" font-weight="800" fill="#d8261c" text-anchor="middle">寝</text></svg>' : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="#b8ad98" stroke-width="1.6" stroke-dasharray="3 3"/></svg>'
    if (run.excuses) mk += `<span class="q">${'?'.repeat(Math.min(run.excuses, 5))}</span>`
    $('#marks').innerHTML = mk
    $('#fol').textContent = fmtF(run.followers)
    const pf = Number(prev[3]) / 10, df = run.followers - pf
    if (prev.length > 3 && Math.abs(df) >= 1) { const d = $('#fdl'); d.textContent = (df > 0 ? '+' : '') + (lang === 'ja' ? df.toFixed(1) : (df / 100).toFixed(2)); d.className = 'dlt ' + (df > 0 ? 'p' : 'm'); clearTimeout(updateTop.tm); updateTop.tm = setTimeout(() => d.textContent = '', 1500) }
  }
  // 変装ボタン: いまの道具の絵と残りの数
  const ITEM_ICON = {
    shades: '<svg viewBox="0 0 64 40"><path d="M4 10 H60" stroke="#111" stroke-width="4"/><rect x="5" y="10" width="23" height="18" rx="8" fill="#111"/><rect x="36" y="10" width="23" height="18" rx="8" fill="#111"/><path d="M28 15 q4 -4 8 0" stroke="#111" stroke-width="4" fill="none"/><path d="M10 15 l6 0" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M41 15 l6 0" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>',
    painted: '<svg viewBox="0 0 64 40"><circle cx="17" cy="20" r="12" fill="#fff" stroke="#111" stroke-width="3.5"/><circle cx="47" cy="20" r="12" fill="#fff" stroke="#111" stroke-width="3.5"/><path d="M29 18 q3 -3 6 0" stroke="#111" stroke-width="3.5" fill="none"/><circle cx="18" cy="21" r="5" fill="#111"/><circle cx="48" cy="21" r="5" fill="#111"/><path d="M8 9 l3 4 M17 6 v5 M26 9 l-3 4 M38 9 l3 4 M47 6 v5 M56 9 l-3 4" stroke="#111" stroke-width="2.5" stroke-linecap="round"/></svg>',
    book: '<svg viewBox="0 0 64 40"><path d="M6 6 h24 q2 0 2 3 v28 q-2 -3 -6 -3 h-20z" fill="#d8261c" stroke="#111" stroke-width="3" stroke-linejoin="round"/><path d="M58 6 h-24 q-2 0 -2 3 v28 q2 -3 6 -3 h20z" fill="#d8261c" stroke="#111" stroke-width="3" stroke-linejoin="round"/></svg>',
  }
  // 顔に重ねる変装（guru_talk の目の位置に合わせた）
  const GLASS = {
    shades: '<svg viewBox="0 0 100 30" preserveAspectRatio="none"><path d="M2 7 H98" stroke="#111" stroke-width="4"/><path d="M6 6 h36 q2 0 2 3 q-1 14 -16 15 q-14 0 -21 -15 q0 -3 -1 -3z" fill="#141414" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/><path d="M94 6 h-36 q-2 0 -2 3 q1 14 16 15 q14 0 21 -15 q0 -3 1 -3z" fill="#141414" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/><path d="M13 11 l9 0" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"/><path d="M63 11 l9 0" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"/></svg>',
    painted: '<svg viewBox="0 0 100 30" preserveAspectRatio="none"><path d="M2 12 H98" stroke="#111" stroke-width="3"/><ellipse cx="25" cy="15" rx="18" ry="13" fill="#fff" stroke="#111" stroke-width="3.5"/><ellipse cx="75" cy="15" rx="18" ry="13" fill="#fff" stroke="#111" stroke-width="3.5"/><circle cx="27" cy="16" r="7" fill="#111"/><circle cx="77" cy="16" r="7" fill="#111"/><circle cx="29" cy="13" r="2.4" fill="#fff"/><circle cx="79" cy="13" r="2.4" fill="#fff"/></svg>',
  }
  let lastItem = ''
  function updateItem(force) {
    const n = run ? run.items.length : 0, cur = run && run.items[0], on = !!(run && run.wear)
    const key = n + '|' + cur + '|' + on + '|' + lang
    if (!force && key === lastItem) return
    lastItem = key
    itB.disabled = !n || on
    itB.classList.toggle('on', on); itB.classList.toggle('has', !!n && !on)
    const ic = on ? ITEM_ICON[run.wear.id] : cur ? ITEM_ICON[cur] : ITEM_ICON.shades
    $('#itIcon').innerHTML = ic
    $('#itTxt').textContent = on ? T().items[run.wear.id] : cur ? T().items[cur] : T().itemBtn
    $('#itN').textContent = '×' + n
  }
  function buildPlanner() {
    if (!run) return
    $('#plist').innerHTML = C.SCENES.map((s, i) => `<li class="${i < run.idx ? 'd' : i === run.idx ? 'n' : ''}"><b>${s.clock}</b>${T().scenes[s.id]}</li>`).join('')
  }

  // ---------- 結果: 週刊誌
  function showResult() {
    const r = run.result, tx = T()
    show('#vResult')
    const h = Math.floor(r.sleepMin / 60), m = r.sleepMin % 60
    const photo = { master: 'guru_talk', suspect: r.itemsUsed ? 'guru_shades' : 'guru_talk', excuse: 'guru_excuse', dropper: 'guru_deep', zombie: 'guru_doze', busted: r.falls ? 'guru_tilt' : 'guru_deep', scoop: 'guru_collapse', trend: 'guru_deep', sage: 'guru_mutter' }[r.title]
    const ar = ART[photo]
    const col = photo === 'guru_collapse'
    $('#rPhoto').innerHTML = (r.jSlept ? `<img src="img/jour_zzz.webp" alt="" style="height:24%;left:-3%;bottom:34%">` : r.exposures ? `<img src="img/jour_gotcha.webp" alt="" style="height:24%;left:-3%;bottom:34%">` : '') + `<img src="img/${photo}.webp" alt="" style="height:${col ? 34 : 70}%;right:${col ? 3 : 6}%;bottom:${col ? 30 : 4}%">`
    void ar
    $('#rHead').innerHTML = headText(r).replace(/「(.+?)」/, '「<em>$1</em>」')
    // 今週の寝言・一番使った言い訳
    const q = coverLines(r)
    $('#rQuote').hidden = !q.length; $('#rQuote').innerHTML = q.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')
    const side = r.jSlept ? tx.side.jour : r.asstSlept ? tx.side.asst : (r.exposures === 0 ? tx.side.none : '')
    $('#rSide').hidden = !side; $('#rSide').textContent = side
    $('#rFacts').innerHTML = `<div><span>${tx.claim}</span><s>${tx.claimV}</s></div><div class="big"><span>${tx.real}</span><span>${tx.hm.replace('{h}', h).replace('{m}', m)}</span></div><div><span>${tx.bust}</span><span>${r.exposures}${tx.times}</span></div><div><span>${tx.exc}</span><span>${r.excuses}${tx.times}</span></div><div><span>${tx.fol}</span><span>${fmtF(r.followers)}</span></div>`
    $('#rRank').textContent = r.rank; $('#rTitle').textContent = tx.titles[r.title]
    const st = $('#rStamp'); st.style.setProperty('--o', 0)
    Snd.play('roll', { vol: 0.7 })
    setTimeout(() => { st.animate([{ transform: 'rotate(-12deg) scale(2.2)', opacity: 0 }, { transform: 'rotate(-12deg) scale(.92)', opacity: 1, offset: .7 }, { transform: 'rotate(-12deg) scale(1)', opacity: 1 }], { duration: 380, easing: 'ease-out', fill: 'forwards' }); Snd.play(['S', 'A', 'B'].includes(r.rank) ? 'win' : 'lose', { vol: 0.8 }); Snd.play('shutter', { vol: 0.5 }) }, 1300)
    if (window.TM) TM.end(Math.round(r.followers * 10), r.reason !== 'scoop')
    store.set('ss_tut', '1')
  }
  function headText(r) {
    const tx = T(), q = r.quote != null ? tx.mutters[r.quote].replace(/…/g, '').slice(0, 12) : ''
    return tx.heads[r.title].replace('{n}', r.excuses).replace('{q}', q).replace('{e}', r.topEx ? tx.ex[r.topEx] : tx.ex.meditate)
  }
  function coverLines(r) {
    const tx = T(), out = []
    if (r.quote != null) out.push([tx.quoteL + (r.quoteViral ? ' ' + tx.viralTag : ''), '「' + tx.mutters[r.quote] + '」'])
    if (r.topEx) out.push([tx.topExL + (r.topN > 1 ? ` ×${r.topN}` : ''), '「' + tx.ex[r.topEx] + '」'])
    return out
  }
  $('#bX').onclick = () => {
    const r = run.result, tx = T(), h = Math.floor(r.sleepMin / 60), m = r.sleepMin % 60
    const text = tx.xText.replace('{h}', h).replace('{m}', m).replace('{t}', tx.titles[r.title])
    if (window.TM) TM.share('x')
    window.open('https://x.com/intent/post?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent('https://tom3games.github.io/short-sleeper/'), '_blank', 'noopener')
  }
  $('#bSave').onclick = async () => {
    if (window.TM) TM.share('save')
    const cv = await drawMag(); const a = document.createElement('a'); a.download = 'short-sleeper.png'; a.href = cv.toDataURL('image/png'); a.click()
  }
  // 結果の画像（週刊誌の表紙を描き直す）
  function loadImg(src) { return new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src }) }
  async function drawMag() {
    const r = run.result, tx = T(), W = 900, H = 1200, cv = document.createElement('canvas'); cv.width = W; cv.height = H
    const c = cv.getContext('2d')
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#d9d2c3'); g.addColorStop(1, '#a89f8c'); c.fillStyle = g; c.fillRect(0, 0, W, H)
    const photo = $('#rPhoto img'); const im = photo && await loadImg(photo.getAttribute('src'))
    if (im) { const hh = H * (photo.src.includes('collapse') ? 0.42 : 0.8), ww = hh * im.width / im.height; c.drawImage(im, W - ww - 20, H - hh, ww, hh) }
    c.fillStyle = '#d8261c'; c.fillRect(0, 0, W, 150); c.fillStyle = '#fff'; c.font = '86px "RocknRoll One", sans-serif'; c.textBaseline = 'middle'; c.fillText(tx.paper, 24, 78)
    c.font = '800 26px "M PLUS 1p", sans-serif'; c.textAlign = 'right'; c.fillText(tx.paperNo, W - 24, 78); c.textAlign = 'left'
    const head = headText(r)
    c.font = '58px "RocknRoll One", sans-serif'; c.lineJoin = 'round'
    const lines = []; let cur = ''
    for (const ch of head) { if (c.measureText(cur + ch).width > W * 0.58) { lines.push(cur); cur = ch } else cur += ch }
    lines.push(cur)
    lines.forEach((l, i) => { const y = 220 + i * 72; c.lineWidth = 12; c.strokeStyle = '#000'; c.strokeText(l, 26, y); c.fillStyle = '#fff'; c.fillText(l, 26, y) })
    const h = Math.floor(r.sleepMin / 60), m = r.sleepMin % 60
    const rows = [[tx.claim, tx.claimV], [tx.real, tx.hm.replace('{h}', h).replace('{m}', m)], [tx.bust, r.exposures + tx.times], [tx.exc, r.excuses + tx.times], [tx.fol, fmtF(r.followers)]]
    c.fillStyle = '#fff'; c.fillRect(24, H - 330, 420, 300); c.lineWidth = 4; c.strokeStyle = '#000'; c.strokeRect(24, H - 330, 420, 300)
    rows.forEach(([k, v], i) => { c.font = '800 30px "M PLUS 1p", sans-serif'; c.fillStyle = i === 1 ? '#d8261c' : '#1d1a17'; c.fillText(k, 44, H - 300 + i * 56); c.textAlign = 'right'; c.fillText(v, 424, H - 300 + i * 56); c.textAlign = 'left' })
    c.save(); c.translate(W - 170, H - 170); c.rotate(-0.2); c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(0, 0, 130, 0, 7); c.fill(); c.lineWidth = 10; c.strokeStyle = '#d8261c'; c.stroke()
    c.fillStyle = '#d8261c'; c.textAlign = 'center'; c.font = '120px "RocknRoll One", sans-serif'; c.fillText(r.rank, 0, -16); c.font = '800 24px "M PLUS 1p", sans-serif'; c.fillText(tx.titles[r.title], 0, 72); c.restore()
    // 今週の寝言・一番使った言い訳（白い札）
    const ql = coverLines(r)
    ql.forEach(([k, v], i) => {
      const y = H - 330 - 20 - (ql.length - i) * 96
      c.save(); c.translate(24, y); c.rotate(-0.02)
      c.font = '800 34px "M PLUS 1p", sans-serif'; const vw = Math.min(W * 0.62, c.measureText(v).width + 28)
      c.fillStyle = '#111'; c.fillRect(0, 0, vw, 84); c.fillStyle = '#ffd23a'; c.font = '800 22px "M PLUS 1p", sans-serif'; c.fillText(k, 14, 22)
      c.fillStyle = '#fff'; c.font = '800 34px "M PLUS 1p", sans-serif'; let vv = v; while (c.measureText(vv).width > vw - 28 && vv.length > 4) vv = vv.slice(0, -2) + '」'; c.fillText(vv, 14, 60); c.restore()
    })
    c.fillStyle = '#1d1a17'; c.font = '800 22px "M PLUS 1p", sans-serif'; c.textAlign = 'right'; c.fillText('tom3games.github.io/short-sleeper', W - 20, H - 14)
    return cv
  }

  // ---------- 検証用の窓口
  window.SS = {
    get run() { return run },
    start, show,
    dbg: { pause(b) { paused = b !== false }, step(n = 1) { for (let i = 0; i < n; i++) tick(); render(performance.now() / 1000) }, hold(b) { hold = !!b }, choose(i) { chPress = i }, item() { itPress = true } },
    itemXY(name) {
      const sel = { eye: '#eye', item: '#item', start: '#bStart', again: '#bAgain', how: '#bHow', lang: '#bLang', save: '#bSave', x: '#bX', c0: '.chc[data-i="0"]', c1: '.chc[data-i="1"]', c2: '.chc[data-i="2"]' }[name]
      const el = sel && $(sel); if (!el || !el.getClientRects().length) return null
      const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }
    },
    drawMag, lang: () => lang,
  }
  applyLang()
  window.__ssReadyJs = true
})()
