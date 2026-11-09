/* TTE LiveBoard: a real-time classroom whiteboard for TTE Proper.
   One board per week. One writer (the facilitator) at a time; everyone else watches live.
   Uses Fabric.js (loaded only when a board is opened), Supabase Realtime and the tte_boards table. */
(function () {
  'use strict';
  var FAB = 'https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js';
  var PDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  var COLORS = ['#10163a', '#d92d20', '#e8890c', '#1a8f3c', '#1769e0', '#7c3aed', '#0b8f8f', '#8a93a8'];
  var FLUSH_MS = 350, HB_MS = 10000, SAVE_IDLE = 1500, SAVE_MAX = 6000, BEAT_MS = 15000;
  var LB = {}, S = null, loaders = {};

  var uid = function () { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  function need(src, test) {
    if (test && test()) return Promise.resolve();
    if (loaders[src]) return loaders[src];
    loaders[src] = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { delete loaders[src]; rej(new Error('Could not load ' + src.split('/').slice(-1)[0] + '. Check your internet connection.')); };
      document.head.appendChild(s);
    });
    return loaders[src];
  }
  var needFab = function () { return need(FAB, function () { return window.fabric; }); };

  var CSS = '\
html.lb-open,html.lb-open body{overflow:hidden}\
.lb{display:flex;flex-direction:column;background:var(--bg,#fff);color:var(--fg,#10163a)}\
.lb-full{position:fixed;inset:0;z-index:2000}\
.lb-inline{position:relative;width:100%;height:100%;border:1px solid var(--line,#dde3f3);border-radius:12px;overflow:hidden;min-height:0}\
.lb-inline .lb-xf,.lb-full .lb-xi{display:none}\
.lb-inline .lb-h{padding:.3rem .5rem;gap:.3rem}\
.lb-inline .lb-b{padding:.25rem .55rem;font-size:.78rem}\
.lb-inline .lb-body{flex-direction:column}\
.lb-inline .lb-tools{flex-direction:row;width:auto;border-right:0;border-bottom:1px solid var(--line,#dde3f3);overflow-x:auto;overflow-y:hidden;align-items:center;padding:.3rem .4rem}\
.lb-inline .lb-hr{width:1px;height:26px;margin:0 .2rem}\
.lb-inline .lb-sw{grid-template-columns:repeat(8,1fr)}\
.lb-inline .lb-tools>*{flex:0 0 auto}\
.lb-inline .lb-tools .lb-b{min-width:2rem;padding:.25rem}\
.lb *{box-sizing:border-box}\
.lb-h{display:flex;align-items:center;gap:.5rem;padding:.5rem .75rem;border-bottom:1px solid var(--line,#dde3f3);background:var(--card,#fff);flex-wrap:wrap}\
.lb-h>b{font-weight:800}.lb-sp{flex:1}\
.lb-b{font:inherit;font-size:.86rem;font-weight:700;display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .75rem;border-radius:10px;border:1.5px solid var(--line,#dde3f3);background:transparent;color:inherit;cursor:pointer;text-decoration:none;white-space:nowrap}\
.lb-b:hover{border-color:var(--sun,#f5a524)}.lb-b[disabled]{opacity:.4;cursor:default}.lb-b.pri{background:var(--sun,#f5a524);border-color:var(--sun,#f5a524);color:#10163a}\
.lb-st{font-size:.8rem;font-weight:700;padding:.2rem .65rem;border-radius:999px;border:1px solid var(--line,#dde3f3);white-space:nowrap}\
.lb-st.ok{color:#14803a;border-color:#14803a}.lb-st.warn{color:#b45309;border-color:#b45309}\
.lb-body{flex:1;display:flex;min-height:0}\
.lb-tools{display:flex;flex-direction:column;gap:.35rem;padding:.5rem;border-right:1px solid var(--line,#dde3f3);background:var(--card,#fff);overflow-y:auto;width:76px;align-items:center}\
.lb-tools .lb-b{padding:.4rem;min-width:2.5rem;justify-content:center;font-size:1.05rem}\
.lb-b.on{background:var(--sun,#f5a524);border-color:var(--sun,#f5a524);color:#10163a}\
.lb-sw{display:grid;grid-template-columns:repeat(2,1fr);gap:4px;margin:.2rem 0}\
.lb-sw button{width:24px;height:24px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}\
.lb-sw button.on{border-color:var(--fg,#10163a);box-shadow:0 0 0 2px var(--bg,#fff) inset}\
.lb-tools input[type=color]{width:34px;height:26px;border:0;padding:0;background:none;cursor:pointer}\
.lb-w{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:.7rem}\
.lb-w input{width:62px}\
.lb-hr{width:100%;height:1px;background:var(--line,#dde3f3);margin:.2rem 0}\
.lb-stage{flex:1;position:relative;background:#fff;touch-action:none;overflow:hidden;min-width:0}\
.lb-stage canvas{display:block}\
.lb-view{position:absolute;right:.7rem;bottom:.7rem;display:flex;gap:.3rem;align-items:center;background:var(--card,#fff);color:var(--fg,#10163a);border:1px solid var(--line,#dde3f3);border-radius:12px;padding:.25rem;box-shadow:0 4px 14px rgba(0,0,0,.15);z-index:3}\
.lb-view .lb-b{padding:.3rem .6rem}.lb-view span{font-size:.8rem;min-width:3rem;text-align:center;font-weight:700}\
.lb-bn{position:absolute;left:50%;top:.7rem;transform:translateX(-50%);max-width:92%;background:var(--card,#fff);color:var(--fg,#10163a);border:1.5px solid var(--sun,#f5a524);border-radius:12px;padding:.5rem .9rem;font-size:.9rem;z-index:3;box-shadow:0 4px 14px rgba(0,0,0,.18);display:none;text-align:center}\
.lb-bn.on{display:block}.lb-bn .lb-b{margin-left:.5rem;padding:.25rem .6rem}\
@media(max-width:760px){.lb-full .lb-body{flex-direction:column-reverse}.lb-full .lb-tools{flex-direction:row;width:auto;border-right:0;border-top:1px solid var(--line,#dde3f3);overflow-x:auto;overflow-y:hidden;align-items:center;padding:.4rem}.lb-full .lb-hr{width:1px;height:28px;margin:0 .2rem}.lb-full .lb-sw{grid-template-columns:repeat(8,1fr)}.lb-full .lb-tools>*{flex:0 0 auto}.lb-h{padding:.4rem .5rem}.lb-view{bottom:.5rem}}';

  function injectCss() {
    if (document.getElementById('lb-css')) return;
    var s = document.createElement('style'); s.id = 'lb-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  var TOOLS = [
    ['select', '↖', 'Select and move'], ['hand', '✋', 'Move around the board'], ['pen', '✎', 'Pen'], ['hl', '🖍', 'Highlighter'],
    ['eraser', '⌫', 'Eraser'], ['text', 'T', 'Text'], ['line', '╱', 'Line'], ['arrow', '→', 'Arrow'],
    ['rect', '▭', 'Rectangle'], ['ellipse', '◯', 'Circle / ellipse'], ['tri', '△', 'Triangle']];

  function template(o, writer) {
    var tools = '';
    if (writer) {
      tools = TOOLS.map(function (t) { return '<button class="lb-b" data-tool="' + t[0] + '" title="' + t[2] + '" aria-label="' + t[2] + '">' + t[1] + '</button>'; }).join('') +
        '<div class="lb-hr"></div><div class="lb-sw">' + COLORS.map(function (c) { return '<button data-color="' + c + '" style="background:' + c + '" aria-label="Colour ' + c + '"></button>'; }).join('') + '</div>' +
        '<input type="color" id="lb-cc" value="#10163a" title="Any colour" aria-label="Any colour">' +
        '<div class="lb-w"><span id="lb-wv">4</span><input type="range" id="lb-w" min="1" max="24" value="4" aria-label="Thickness"></div>' +
        '<div class="lb-hr"></div><button class="lb-b" id="lb-undo" title="Undo (Ctrl+Z)" aria-label="Undo">↶</button><button class="lb-b" id="lb-redo" title="Redo (Ctrl+Y)" aria-label="Redo">↷</button>' +
        '<button class="lb-b" id="lb-clear" title="Clear the whole board" aria-label="Clear board">🗑</button>';
    }
    return '<div class="lb-h"><button class="lb-b lb-xf" id="lb-back">← Back to class</button><b class="lb-xf">TTE LiveBoard · ' + esc(o.title || '') + '</b><span class="lb-st" id="lb-st">Loading…</span><span class="lb-sp"></span>' +
      (o.meetUrl ? '<a class="lb-b pri lb-xf" id="lb-meet" href="' + esc(o.meetUrl) + '" target="_blank" rel="noopener">Join Google Meet</a>' : '') +
      (writer ? '<button class="lb-b" id="lb-pen" title="Let another facilitator write">Put the pen down</button>' : '') +
      '<button class="lb-b" id="lb-pdf" title="Download as PDF">⬇ PDF</button><button class="lb-b lb-xf" id="lb-png" title="Download as image">⬇ Image</button>' +
      (writer && o.saveNotes ? '<button class="lb-b" id="lb-notes" title="Save this board as the class notes for students">💾 Class notes</button>' : '') +
      '<button class="lb-b lb-xf" id="lb-fs" title="Browser full screen">⛶</button>' +
      '<button class="lb-b lb-xi" id="lb-exp" title="Make the whiteboard fill the whole screen">⤢ Full screen</button><button class="lb-b lb-xi" id="lb-x" title="Close the whiteboard" aria-label="Close">✕</button></div>' +
      '<div class="lb-body">' + (writer ? '<div class="lb-tools" id="lb-tools">' + tools + '</div>' : '') +
      '<div class="lb-stage" id="lb-stage"><canvas id="lb-c"></canvas><div class="lb-bn" id="lb-bn"></div>' +
      '<div class="lb-view"><button class="lb-b" id="lb-zo" aria-label="Zoom out">−</button><span id="lb-zv">100%</span><button class="lb-b" id="lb-zi" aria-label="Zoom in">+</button><button class="lb-b" id="lb-fit" title="Fit everything on screen">Fit</button>' +
      (writer ? '' : '<button class="lb-b" id="lb-follow" title="Follow the facilitator\'s view">Following</button>') + '</div></div></div>';
  }

  var $ = function (id) { return S && S.root ? S.root.querySelector('#' + id) : null; };
  function banner(html, kind) { var b = $('lb-bn'); if (!b) return; S.bnKind = html ? (kind || '') : ''; if (!html) { b.className = 'lb-bn'; b.innerHTML = ''; return; } b.innerHTML = html; b.className = 'lb-bn on'; }
  function rpc(name, args) { return S.o.sb.rpc(name, args).then(function (r) { if (r.error) throw r.error; return r.data; }); }

  /* ------------------------------------------------------------------ open / close */
  LB.isOpen = function () { return !!S; };
  LB.week = function () { return S ? S.week : 0; };
  LB._state = function () { return S; };

  LB.open = function (o) {
    var p = S ? LB.close() : Promise.resolve();
    return p.then(function () { return start(o); });
  };

  function start(o) {
    injectCss();
    var inline = !!(o.slot && o.slot.isConnected !== false);
    var root = document.createElement('div'); root.id = 'lbroot'; root.className = 'lb ' + (inline ? 'lb-inline' : 'lb-full'); root.setAttribute('aria-label', 'TTE LiveBoard');
    root.innerHTML = template(o, !!o.isAdmin);
    if (inline) { o.slot.textContent = ''; o.slot.appendChild(root); } else { document.body.appendChild(root); document.documentElement.classList.add('lb-open'); }
    S = { o: o, root: root, inline: inline, expanded: !inline, slot: inline ? o.slot : null, level: o.level || 'proper', week: o.week, mode: 'view', rev: 0, sid: uid(), n: 0, sv: 0, br: 0,
      q: [], idx: new Map(), undo: [], redo: [], tool: 'pen', color: COLORS[0], width: 4, follow: true, loading: false, buf: [], temp: new Map(),
      chain: Promise.resolve(), chg: 0, dirty: false, lastMsg: 0, vsid: null, vlast: 0, need: null, needSid: null, snap: { sid: null, n: 0 }, timers: [], wtimers: [], closed: false, listeners: [] };
    bindChrome();
    var cur = S;
    return needFab().then(function () {
      if (S !== cur) return;
      makeCanvas();
      return (o.isAdmin ? rpc('tte_board_claim', { p_level: S.level, p_week: S.week, p_force: false }) : Promise.resolve(null));
    }).then(function (cl) {
      if (S !== cur) return;
      if (cl && cl.ok) { S.mode = 'write'; } else if (cl && !cl.ok) { S.holder = cl.holder; }
      return loadSnapshot(true);
    }).then(function () {
      if (S !== cur) return;
      applyMode(); connect(); setStatus();
      if (S.mode === 'view' && S.holder) banner('<b>' + esc(S.holder) + '</b> is writing on this board. <button class="lb-b" id="lb-take">Take the pen</button>', 'holder');
      var tk = $('lb-take'); if (tk) tk.onclick = function () { takePen(true); };
      if (S.mode === 'view' && !S.holder && !S.c.getObjects().length) banner('The facilitator has not written on this board yet. It will appear here live.', 'empty');
    }).catch(function (e) {
      if (S === cur) { setStatus(); banner('⚠️ ' + esc(e && e.message ? e.message : e) + (/tte_board|function|relation/i.test(String(e && e.message)) ? '<br><small>Has tte_liveboard.sql been run in Supabase?</small>' : '')); }
    });
  }

  LB.close = function () {
    var s = S; if (!s) return Promise.resolve();
    var done = Promise.resolve();
    if (s.mode === 'write') {
      done = drain(s).then(function () { return rpc('tte_board_release', { p_level: s.level, p_week: s.week }).catch(function () { }); });
    }
    return done.then(function () { teardown(s); });
  };

  function drain(s) {
    var tries = 0;
    var step = function () { if (S !== s || tries++ > 4 || (!s.dirty && !s.q.length && !s.saving)) return Promise.resolve(); return save(true).catch(function () { }).then(function () { return new Promise(function (r) { setTimeout(r, 60); }); }).then(step); };
    return step();
  }
  function teardown(s) {
    s.closed = true;
    s.timers.concat(s.wtimers).forEach(function (t) { clearTimeout(t); clearInterval(t); });
    if (s.ft) clearTimeout(s.ft); if (s.st) clearTimeout(s.st);
    s.listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
    try { if (s.ch) s.o.sb.removeChannel(s.ch); } catch (e) { }
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { }
    try { if (s.ro) s.ro.disconnect(); if (s.c) s.c.dispose(); } catch (e) { }
    if (s.root && s.root.parentNode) s.root.parentNode.removeChild(s.root);
    document.documentElement.classList.remove('lb-open');
    if (S === s) S = null;
    try { if (s.o.onClose) s.o.onClose(); } catch (e) { }
  }

  function on(el, ev, fn, opt) { el.addEventListener(ev, fn, opt); S.listeners.push([el, ev, fn, opt]); }

  function bindChrome() {
    $('lb-back').onclick = function () { if (S.inline) setExpanded(false); else LB.close(); };
    $('lb-x').onclick = function () { LB.close(); };
    $('lb-exp').onclick = function () { setExpanded(true); };
    var fs = $('lb-fs');
    fs.onclick = function () { try { if (document.fullscreenElement) document.exitFullscreen(); else S.root.requestFullscreen(); } catch (e) { } };
    if (!document.fullscreenEnabled) fs.style.display = 'none';
    on(window, 'resize', resize);
    $('lb-pdf').onclick = function () { exportNow('pdf'); };
    $('lb-png').onclick = function () { exportNow('png'); };
    var nb = $('lb-notes'); if (nb) nb.onclick = saveNotes;
    var pb = $('lb-pen'); if (pb) pb.onclick = function () { putDown(); };
    $('lb-zi').onclick = function () { zoomBy(1.25); };
    $('lb-zo').onclick = function () { zoomBy(0.8); };
    $('lb-fit').onclick = function () { userNav(); fitContent(); };
    var fl = $('lb-follow'); if (fl) fl.onclick = function () { S.follow = !S.follow; setFollowBtn(); if (S.follow && S.lastVp) applyVp(S.lastVp); };
    var join = $('lb-meet'); if (join && S.o.onMeet) join.addEventListener('click', function () { try { S.o.onMeet(); } catch (e) { } });
    on(window, 'beforeunload', function (e) { if (S && S.mode === 'write' && (S.dirty || S.q.length)) { try { save(); } catch (x) { } e.preventDefault(); e.returnValue = ''; } });
    on(document, 'visibilitychange', function () { if (document.hidden && S && S.mode === 'write' && S.dirty) save(); });
    on(window, 'online', function () { if (!S) return; if (S.mode === 'write') { S.chg++; dirty(); } else resync(); });
  }
  function resize() { if (!S || !S.c || !S.stage) return; var w = S.stage.clientWidth, h = S.stage.clientHeight; if (w > 50 && h > 50) { S.c.setDimensions({ width: w, height: h }); S.c.requestRenderAll(); } }
  function setExpanded(b) {
    if (!S || !S.inline) return; var r = S.root;
    if (b) { S.expanded = true; r.className = 'lb lb-full'; document.body.appendChild(r); document.documentElement.classList.add('lb-open'); }
    else {
      var sl = document.getElementById('lbslot') || S.slot;
      if (!sl || sl.isConnected === false) return;
      S.expanded = false; r.className = 'lb lb-inline'; document.documentElement.classList.remove('lb-open');
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { }
      sl.textContent = ''; sl.appendChild(r); S.slot = sl;
    }
    resize(); setTimeout(resize, 60);
  }
  /* the classroom page redraws itself now and then: put the board back into the new frame */
  LB.attach = function (slot) {
    if (!S || !S.inline || S.expanded || !slot) return;
    if (S.root.parentNode !== slot) { slot.textContent = ''; slot.appendChild(S.root); }
    S.slot = slot; resize();
  };
  LB.isExpanded = function () { return !!(S && S.expanded); };
  function setFollowBtn() { var f = $('lb-follow'); if (f) { f.textContent = S.follow ? 'Following' : 'Follow facilitator'; f.className = 'lb-b' + (S.follow ? ' on' : ''); } }

  /* ------------------------------------------------------------------ canvas */
  function makeCanvas() {
    var stage = $('lb-stage'), el = $('lb-c');
    var c = new fabric.Canvas(el, { selection: false, preserveObjectStacking: true, perPixelTargetFind: true, targetFindTolerance: 10, stopContextMenu: true, fireRightClick: false, enableRetinaScaling: true, width: Math.max(200, stage.clientWidth), height: Math.max(200, stage.clientHeight) });
    c.selectionKey = null;
    S.c = c; S.stage = stage;
    c.setViewportTransform([1, 0, 0, 1, 40, 40]);
    if (typeof ResizeObserver !== 'undefined') {
      S.ro = new ResizeObserver(function () { resize(); });
      S.ro.observe(stage);
    }
    c.on('mouse:down', onDown); c.on('mouse:move', onMove); c.on('mouse:up', onUp);
    c.on('path:created', onPath);
    c.on('object:moving', onXform); c.on('object:scaling', onXform); c.on('object:rotating', onXform);
    c.on('object:modified', onModified);
    on(stage, 'wheel', onWheel, { passive: false });
    on(stage, 'touchstart', gStart, { capture: true, passive: false });
    on(stage, 'touchmove', gMove, { capture: true, passive: false });
    on(stage, 'touchend', gEnd, { capture: true });
    on(stage, 'touchcancel', gEnd, { capture: true });
    on(document, 'keydown', onKey); on(document, 'keyup', onKeyUp);
  }

  function find(id) { var a = S.c.getObjects(); for (var i = a.length - 1; i >= 0; i--) if (a[i].id === id) return a[i]; return null; }
  function ser(o) { return o.toObject(['id']); }
  function flag(o) {
    var w = S.mode === 'write', sel = w && S.tool === 'select', er = w && S.tool === 'eraser';
    o.selectable = sel; o.evented = sel || er; o.hasControls = sel; o.hasBorders = sel;
    o.transparentCorners = false; o.cornerStyle = 'circle'; o.cornerColor = '#2f6df6'; o.borderColor = '#2f6df6'; o.cornerSize = 11; o.touchCornerSize = 24;
    if (o.type === 'i-text' && !o.__wired) {
      o.__wired = true;
      o.on('changed', function () { if (o.text && S && S.mode === 'write') qu({ t: 'u', o: ser(o) }); });
      o.on('editing:exited', function () {
        if (!S) return;
        if (!o.text || !o.text.trim()) { var b = o.__b; S.c.skipTargetFind = !(S.tool === 'select' || S.tool === 'eraser'); S.c.remove(o); qu({ t: 'd', id: o.id }); if (!o.__new && b) push({ k: 'del', os: [b] }); return; }
        if (o.__new) { o.__new = false; push({ k: 'add', o: ser(o) }); qu({ t: 'u', o: ser(o) }); }
        flag(o); S.c.skipTargetFind = !(S.tool === 'select' || S.tool === 'eraser'); S.c.requestRenderAll();
      });
    }
  }
  function applyFlags() { S.c.getObjects().forEach(flag); S.c.requestRenderAll(); }

  function enlivenAll(arr) {
    return new Promise(function (res) {
      if (!arr || !arr.length) return res([]);
      fabric.util.enlivenObjects(arr, function (objs) { res(objs || []); });
    });
  }

  /* ------------------------------------------------------------------ load / resync */
  function loadSnapshot(first) {
    S.loading = true;
    return S.o.sb.from('tte_boards').select('data,rev').eq('level', S.level).eq('week', S.week).maybeSingle().then(function (r) {
      if (r.error) throw r.error;
      var row = r.data, d = (row && row.data) || {};
      S.rev = row ? Number(row.rev) : 0;
      S.snap = { sid: d.sid || null, n: d.n || 0 };
      if (S.vsid === S.snap.sid) S.vlast = Math.max(S.vlast, S.snap.n);
      return enlivenAll(d.objects || []);
    }).then(function (objs) {
      if (!S) return;
      var c = S.c; c.discardActiveObject();
      c.remove.apply(c, c.getObjects().slice());
      S.temp.forEach(function (t) { t.obj = null; }); S.temp.clear();
      objs.forEach(function (o) { flag(o); c.add(o); });
      S.loading = false;
      var b = S.buf; S.buf = [];
      b.forEach(function (ops) { applyOpsNow(ops); });
      if (S.need != null && S.snap.sid === S.needSid && S.snap.n >= S.need) S.need = null;
      if (first) { if (S.mode === 'write' || !S.lastVp) fitContent(S.mode === 'write'); }
      c.requestRenderAll(); setStatus();
    }).catch(function (e) { if (S) S.loading = false; throw e; });
  }
  function resync() {
    if (!S || S.mode !== 'view') return;
    if (S.resyncing) { S.again2 = true; return; }
    S.resyncing = true;
    var cur = S;
    loadSnapshot(false).catch(function () { }).then(function () {
      if (S !== cur) return;
      S.resyncing = false; if (S.again2) { S.again2 = false; resync(); }
    });
  }

  /* ------------------------------------------------------------------ applying remote operations (viewers) */
  function onOps(b) {
    if (!S || S.mode !== 'view' || !b) return;
    S.lastMsg = Date.now(); S.by = b.by || S.by;
    if (S.vsid !== b.s) {
      S.vsid = b.s; S.vlast = (S.snap.sid === b.s) ? S.snap.n : 0;
      if (b.br != null && b.br > S.rev) { S.need = null; resync(); }
    }
    if (b.n > S.vlast + 1) { S.need = Math.max(S.need || 0, b.n - 1); S.needSid = b.s; }
    S.vlast = Math.max(S.vlast, b.n);
    if (S.need != null && S.needSid === b.s && b.sv >= S.need) { resync(); }
    if (b.vp) { S.lastVp = b.vp; if (S.follow) applyVp(b.vp); }
    if (b.ops && b.ops.length) {
      if (S.loading) S.buf.push(b.ops); else applyOpsNow(b.ops);
    }
    if (S.bnKind === 'empty') banner('');
    setStatus();
  }

  function applyOpsNow(ops) {
    var c = S.c;
    S.chain = S.chain.then(function () {
      var p = Promise.resolve();
      ops.forEach(function (op) {
        p = p.then(function () {
          if (!S) return;
          if (op.t === 'u') {
            return enlivenAll([op.o]).then(function (r) {
              if (!S || !r[0]) return; var ob = r[0], old = find(op.o.id), i = -1;
              dropTemp(op.o.id);
              if (old) { i = c.getObjects().indexOf(old); c.remove(old); }
              flag(ob); if (i >= 0) c.insertAt(ob, i); else c.add(ob);
            });
          } else if (op.t === 'd') {
            dropTemp(op.id); var o = find(op.id); if (o) c.remove(o);
          } else if (op.t === 'c') {
            c.remove.apply(c, c.getObjects().slice()); S.temp.clear();
          } else if (op.t === 'p') {
            liveStroke(op);
          }
        });
      });
      return p.then(function () { if (S) c.requestRenderAll(); });
    });
  }
  function dropTemp(id) { var t = S.temp.get(id); if (t) { if (t.obj) S.c.remove(t.obj); S.temp.delete(id); } }
  function liveStroke(op) {
    var t = S.temp.get(op.id);
    if (!t) { t = { pts: [], c: op.c, w: op.w, at: Date.now(), obj: null }; S.temp.set(op.id, t); }
    t.at = Date.now(); op.pts.forEach(function (p) { t.pts.push({ x: p[0], y: p[1] }); });
    if (t.obj) S.c.remove(t.obj);
    var pts = t.pts.length === 1 ? [t.pts[0], { x: t.pts[0].x + 0.1, y: t.pts[0].y }] : t.pts;
    t.obj = new fabric.Polyline(pts, { stroke: t.c, strokeWidth: t.w, fill: '', strokeLineCap: 'round', strokeLineJoin: 'round', selectable: false, evented: false, objectCaching: false });
    S.c.add(t.obj);
  }

  /* ------------------------------------------------------------------ sending (writer) */
  function qu(op) {
    if (!S || S.mode !== 'write') return;
    if (op.t === 'c') { S.q = [op]; S.idx.clear(); }
    else {
      var k = op.t === 'p' ? null : (op.o ? op.o.id : op.id);
      if (k && S.idx.has(k)) S.q[S.idx.get(k)] = op; else { if (k) S.idx.set(k, S.q.length); S.q.push(op); }
    }
    dirty(); schedFlush();
  }
  function schedFlush() { if (S && !S.ft && !S.closed) S.ft = setTimeout(function () { if (S) { S.ft = null; flush(); } }, FLUSH_MS); }
  function viewRect() { var t = S.c.viewportTransform, z = t[0]; return { x: Math.round(-t[4] / z), y: Math.round(-t[5] / z), w: Math.round(S.c.getWidth() / z), h: Math.round(S.c.getHeight() / z) }; }
  function flush() {
    if (!S || S.mode !== 'write') return;
    if (S.ft) { clearTimeout(S.ft); S.ft = null; }
    var ops = S.q; S.q = []; S.idx.clear();
    if (S.drawing && S.stroke) {
      var pts = (S.c.freeDrawingBrush && S.c.freeDrawingBrush._points) || [], nw = pts.slice(S.stroke.sent);
      if (nw.length) { S.stroke.sent = pts.length; ops.unshift({ t: 'p', id: S.stroke.id, c: S.stroke.c, w: S.stroke.w, pts: nw.map(function (p) { return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]; }) }); }
      schedFlush();
    }
    var vpS = JSON.stringify(viewRect());
    var vpChanged = vpS !== S.lastVpSent;
    if (!ops.length && !vpChanged) return;
    var groups = [], cur = [], size = 0;
    ops.forEach(function (op) { var l = JSON.stringify(op).length; if (size + l > 180000 && cur.length) { groups.push(cur); cur = []; size = 0; } cur.push(op); size += l; });
    if (cur.length || !groups.length) groups.push(cur);
    groups.forEach(function (g) {
      S.n++;
      var tooBig = g.length === 1 && JSON.stringify(g[0]).length > 220000;
      if (tooBig) { S.chg++; dirty(); return; }
      send('ops', { s: S.sid, n: S.n, sv: S.sv, br: S.br, by: S.o.name, vp: JSON.parse(vpS), ops: g });
    });
    S.lastVpSent = vpS;
  }
  function send(ev, payload) { if (!S || !S.ch) return; try { var p = S.ch.send({ type: 'broadcast', event: ev, payload: payload }); if (p && p.catch) p.catch(function () { }); } catch (e) { } }
  function heartbeat() { if (S && S.mode === 'write') send('hb', { s: S.sid, n: S.n, sv: S.sv, br: S.br, by: S.o.name, vp: viewRect() }); }

  /* ------------------------------------------------------------------ saving (writer) */
  function dirty() { if (!S || S.mode !== 'write') return; S.dirty = true; S.chg++; if (!S.dirtyAt) S.dirtyAt = Date.now(); schedSave(); setStatus(); }
  function schedSave() {
    if (S.st) clearTimeout(S.st);
    var wait = Math.max(200, Math.min(SAVE_IDLE, SAVE_MAX - (Date.now() - (S.dirtyAt || Date.now()))));
    S.st = setTimeout(function () { if (S) { S.st = null; save(); } }, wait);
  }
  function save(now) {
    if (!S || S.mode !== 'write') return Promise.resolve();
    if (S.saving) { S.again = true; return S.savingP || Promise.resolve(); }
    if (S.st) { clearTimeout(S.st); S.st = null; }
    flush();
    var cur = S, n = S.n, chg = S.chg;
    var data = { v: 1, sid: S.sid, n: n, objects: S.c.getObjects().map(ser) };
    S.saving = true; S.dirtyAt = 0; setStatus();
    S.savingP = rpc('tte_board_save', { p_level: S.level, p_week: S.week, p_data: data }).then(function (r) {
      if (S !== cur) return;
      S.saving = false; S.saveErr = null;
      if (r && r.ok) { S.rev = r.rev; S.sv = n; if (S.chg === chg && !S.q.length) S.dirty = false; else { S.dirty = true; schedSave(); } }
      else if (r && r.lost) { toViewer('Another facilitator has taken the pen.'); return; }
      if (S.again) { S.again = false; schedSave(); }
      setStatus();
    }).catch(function (e) {
      if (S !== cur) return;
      S.saving = false; S.saveErr = e; S.dirty = true; setStatus();
      if (/too large/i.test(String(e && e.message))) { banner('⚠️ ' + esc(e.message)); return; }
      S.st = setTimeout(function () { if (S) { S.st = null; save(); } }, 5000);
    });
    return S.savingP;
  }

  /* ------------------------------------------------------------------ writer / viewer switching */
  function applyMode() {
    var w = S.mode === 'write';
    if (w) { setTool(S.tool === 'hand' ? 'hand' : S.tool); setupToolbar(); } else { S.c.isDrawingMode = false; S.c.selection = false; S.c.skipTargetFind = true; S.c.defaultCursor = 'grab'; S.c.hoverCursor = 'grab'; S.c.discardActiveObject(); applyFlags(); }
    var tl = $('lb-tools'); if (tl) tl.style.display = w ? '' : 'none';
    var pb = $('lb-pen'); if (pb) pb.style.display = w ? '' : 'none';
    var nb = $('lb-notes'); if (nb) nb.style.display = w ? '' : 'none';
    setFollowBtn();
  }
  function setupToolbar() {
    var t = $('lb-tools'); if (!t || t.__wired) { updBtns(); return; } t.__wired = true;
    t.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tool) setTool(b.dataset.tool);
      else if (b.dataset.color) setColor(b.dataset.color);
      else if (b.id === 'lb-undo') doUndo(); else if (b.id === 'lb-redo') doRedo(); else if (b.id === 'lb-clear') clearAll();
    });
    $('lb-cc').oninput = function () { setColor(this.value); };
    $('lb-w').oninput = function () { S.width = +this.value; $('lb-wv').textContent = this.value; refreshBrush(); };
    updBtns();
  }
  function updBtns() {
    if (!S || !$('lb-tools')) return;
    S.root.querySelectorAll('[data-tool]').forEach(function (b) { b.className = 'lb-b' + (b.dataset.tool === S.tool ? ' on' : ''); });
    S.root.querySelectorAll('[data-color]').forEach(function (b) { b.className = b.dataset.color === S.color ? 'on' : ''; });
    var u = $('lb-undo'), r = $('lb-redo'); if (u) u.disabled = !S.undo.length; if (r) r.disabled = !S.redo.length;
  }
  function takePen(force) {
    rpc('tte_board_claim', { p_level: S.level, p_week: S.week, p_force: !!force }).then(function (cl) {
      if (!S) return;
      if (!cl.ok) { banner('<b>' + esc(cl.holder) + '</b> is writing on this board.'); return; }
      S.mode = 'write'; S.holder = null; S.sid = uid(); S.n = 0; S.sv = 0; S.undo = []; S.redo = []; S.need = null;
      return loadSnapshot(false).then(function () { S.br = S.rev; rebuildForWriter(); });
    }).catch(function (e) { banner('⚠️ ' + esc(e.message || e)); });
  }
  function rebuildForWriter() {
    // the toolbar only exists when the page was opened by an admin
    S.mode = 'write'; applyMode(); startWriterTimers(); banner(''); setStatus();
  }
  function startWriterTimers() {
    if (S.wt) return; S.wt = true;
    S.wtimers.push(setInterval(heartbeat, HB_MS));
    S.wtimers.push(setInterval(function () {
      if (!S || S.mode !== 'write') return;
      rpc('tte_board_claim', { p_level: S.level, p_week: S.week, p_force: false }).then(function (cl) { if (S && S.mode === 'write' && cl && !cl.ok) toViewer(cl.holder + ' has taken the pen.'); }).catch(function () { });
    }, BEAT_MS));
  }
  function toViewer(msg) {
    if (!S) return;
    S.mode = 'view'; S.q = []; S.idx.clear(); S.dirty = false; S.drawing = false; S.stroke = null; S.shape = null;
    if (S.ft) { clearTimeout(S.ft); S.ft = null; } if (S.st) { clearTimeout(S.st); S.st = null; }
    S.wtimers.forEach(function (t) { clearTimeout(t); clearInterval(t); }); S.wtimers = []; S.wt = false;
    applyMode(); resyncSoon(); banner(esc(msg) + (S.o.isAdmin ? ' <button class="lb-b" id="lb-take">Take the pen</button>' : ''), 'holder');
    var tk = $('lb-take'); if (tk) tk.onclick = function () { takePen(true); };
    setStatus(); startViewerTimers();
  }
  function resyncSoon() { setTimeout(function () { resync(); }, 400); }
  function putDown() {
    if (!S || S.mode !== 'write') return;
    var cur = S;
    save(true).catch(function () { }).then(function () { return rpc('tte_board_release', { p_level: cur.level, p_week: cur.week }); }).then(function () {
      if (S !== cur) return; toViewer('You put the pen down. ');
      var tk = $('lb-take'); if (tk) tk.textContent = 'Pick the pen up again';
    }).catch(function () { });
  }

  /* ------------------------------------------------------------------ realtime connection */
  function connect() {
    var sb = S.o.sb, cur = S;
    var name = 'tte-board:' + S.level + ':' + S.week;
    var pre = Promise.resolve(); try { if (sb.realtime && sb.realtime.setAuth) pre = Promise.resolve(sb.realtime.setAuth()); } catch (e) { }
    pre.catch(function () { }).then(function () {
      if (S !== cur) return;
      var ch = sb.channel(name, { config: { private: true, broadcast: { self: false, ack: false } } });
      ch.on('broadcast', { event: 'ops' }, function (m) { onOps(m.payload); });
      ch.on('broadcast', { event: 'hb' }, function (m) { onOps(m.payload); });
      ch.subscribe(function (st) {
        if (S !== cur) return;
        if (st === 'SUBSCRIBED') {
          S.live = true;
          if (S.everSub) { if (S.mode === 'view') resync(); else { S.chg++; dirty(); } }
          S.everSub = true;
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') { S.live = false; }
        setStatus();
      });
      S.ch = ch;
    });
    if (S.mode === 'write') { S.br = S.rev; startWriterTimers(); } else startViewerTimers();
    S.timers.push(setInterval(function () { if (S) { setStatus(); S.temp.forEach(function (t, id) { if (Date.now() - t.at > 15000) dropTemp(id); }); } }, 3000));
  }
  function startViewerTimers() {
    if (S.vt) return; S.vt = true;
    S.timers.push(setInterval(function () {
      if (!S || S.mode !== 'view' || S.resyncing) return;
      if (Date.now() - S.lastMsg < 25000) return;
      S.o.sb.from('tte_boards').select('rev').eq('level', S.level).eq('week', S.week).maybeSingle().then(function (r) {
        if (S && S.mode === 'view' && r.data && Number(r.data.rev) > S.rev) resync();
      }, function () { });
    }, 10000));
  }

  function setStatus() {
    var e = $('lb-st'); if (!e || !S) return; var t, cl = 'lb-st';
    if (S.mode === 'write') {
      if (S.saveErr) { t = 'Offline: will retry'; cl += ' warn'; }
      else if (S.saving || S.dirty || S.q.length) t = 'Saving…';
      else { t = 'Saved ✓'; cl += ' ok'; }
      if (S.ch && S.live === false && S.everSub) { t += ' · reconnecting'; }
    } else {
      var live = Date.now() - S.lastMsg < 25000;
      if (live) { t = '● Live' + (S.by ? ' · ' + S.by : ''); cl += ' ok'; }
      else if (S.live === false && S.everSub) { t = 'Reconnecting…'; cl += ' warn'; }
      else t = 'Viewing saved board';
    }
    e.textContent = t; e.className = cl;
    var z = $('lb-zv'); if (z && S.c) z.textContent = Math.round(S.c.viewportTransform[0] * 100) + '%';
  }

  /* ------------------------------------------------------------------ view: zoom, pan, follow, fit */
  function userNav() { if (S.mode === 'view' && S.follow && !S.applyingVp) { S.follow = false; setFollowBtn(); } }
  function afterView() { S.c.requestRenderAll(); setStatus(); if (S.mode === 'write') schedFlush(); }
  function zoomBy(f, cx, cy) {
    userNav(); var c = S.c, z = clamp(c.viewportTransform[0] * f, 0.1, 8);
    c.zoomToPoint(new fabric.Point(cx == null ? c.getWidth() / 2 : cx, cy == null ? c.getHeight() / 2 : cy), z); afterView();
  }
  function contentBox() {
    var os = S.c.getObjects(); if (!os.length) return null;
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    os.forEach(function (o) { var b = o.getBoundingRect(true, true); x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top); x1 = Math.max(x1, b.left + b.width); y1 = Math.max(y1, b.top + b.height); });
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }
  function fitContent(only100) {
    var b = contentBox(), c = S.c; if (!b) { c.setViewportTransform([1, 0, 0, 1, 40, 40]); afterView(); return; }
    var pad = 40, z = clamp(Math.min((c.getWidth() - pad * 2) / b.w, (c.getHeight() - pad * 2) / b.h), 0.1, only100 ? 1 : 3);
    c.setViewportTransform([z, 0, 0, z, (c.getWidth() - b.w * z) / 2 - b.x * z, (c.getHeight() - b.h * z) / 2 - b.y * z]); afterView();
  }
  function applyVp(vp) {
    var c = S.c, z = clamp(Math.min(c.getWidth() / vp.w, c.getHeight() / vp.h), 0.1, 8);
    S.applyingVp = true;
    c.setViewportTransform([z, 0, 0, z, c.getWidth() / 2 - (vp.x + vp.w / 2) * z, c.getHeight() / 2 - (vp.y + vp.h / 2) * z]);
    S.applyingVp = false; afterView();
  }
  function onWheel(e) {
    if (!S.expanded && !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    var r = S.stage.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    else { userNav(); S.c.relativePan(new fabric.Point(-e.deltaX, -e.deltaY)); afterView(); }
  }
  /* two-finger pinch and pan, for everyone (touch screens) */
  function dist(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
  function gStart(e) {
    if (e.touches.length < 2) return;
    e.stopPropagation(); e.preventDefault();
    if (S.gesture) return;
    abortStroke();
    var r = S.stage.getBoundingClientRect(), a = e.touches[0], b = e.touches[1];
    S.gesture = { d: dist(a, b) || 1, cx: (a.clientX + b.clientX) / 2 - r.left, cy: (a.clientY + b.clientY) / 2 - r.top, t: S.c.viewportTransform.slice() };
    userNav();
  }
  function gMove(e) {
    if (!S.gesture) return; e.stopPropagation(); e.preventDefault();
    if (e.touches.length < 2) return;
    var g = S.gesture, r = S.stage.getBoundingClientRect(), a = e.touches[0], b = e.touches[1];
    var cx = (a.clientX + b.clientX) / 2 - r.left, cy = (a.clientY + b.clientY) / 2 - r.top;
    var z = clamp(g.t[0] * dist(a, b) / g.d, 0.1, 8), wx = (g.cx - g.t[4]) / g.t[0], wy = (g.cy - g.t[5]) / g.t[0];
    S.c.setViewportTransform([z, 0, 0, z, cx - wx * z, cy - wy * z]); afterView();
  }
  function gEnd(e) { if (!S || !S.gesture) return; e.stopPropagation(); if (e.touches.length < 2) { S.gesture = null; S.gestureAt = Date.now(); } }
  function abortStroke() {
    var c = S.c;
    if (S.drawing || c._isCurrentlyDrawing) {
      c._isCurrentlyDrawing = false; if (c.freeDrawingBrush) c.freeDrawingBrush._points = []; try { c.clearContext(c.contextTop); } catch (e) { }
      if (S.stroke) qu({ t: 'd', id: S.stroke.id });
      S.drawing = false; S.stroke = null;
    }
    if (S.shape) { if (S.shape.obj) { c.remove(S.shape.obj); qu({ t: 'd', id: S.shape.id }); } S.shape = null; }
    S.erasing = false; S.pan = null; S.gestureAt = Date.now();
  }

  /* ------------------------------------------------------------------ tools */
  function rgba(hex, a) { var h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map(function (x) { return x + x; }).join(''); return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')'; }
  function refreshBrush() { var b = S.c.freeDrawingBrush; if (!b) return; b.color = S.tool === 'hl' ? rgba(S.color, 0.35) : S.color; b.width = S.tool === 'hl' ? S.width * 3 : S.width; b.strokeLineCap = S.tool === 'hl' ? 'butt' : 'round'; }
  function setColor(c) { S.color = c; var cc = $('lb-cc'); if (cc && /^#[0-9a-f]{6}$/i.test(c)) cc.value = c; refreshBrush(); updBtns(); var a = S.c.getActiveObject(); if (a && S.tool === 'select' && a.type !== 'i-text') { } }
  function setTool(t) {
    if (S.mode !== 'write') return;
    var c = S.c; S.tool = t; S.space = false;
    c.discardActiveObject();
    var draw = (t === 'pen' || t === 'hl');
    if (draw) { c.freeDrawingBrush = new fabric.PencilBrush(c); refreshBrush(); }
    c.isDrawingMode = draw; c.selection = false;
    c.skipTargetFind = !(t === 'select' || t === 'eraser');
    var cur = t === 'hand' ? 'grab' : t === 'select' ? 'default' : t === 'eraser' ? 'cell' : t === 'text' ? 'text' : 'crosshair';
    c.defaultCursor = cur; c.hoverCursor = t === 'select' ? 'move' : cur; c.freeDrawingCursor = 'crosshair';
    applyFlags(); updBtns();
  }
  function ptOf(e) { var t = e.e && (e.e.touches && e.e.touches[0] || e.e.changedTouches && e.e.changedTouches[0] || e.e); return { x: t ? t.clientX : 0, y: t ? t.clientY : 0 }; }
  function wp(e) { return e.absolutePointer || S.c.getPointer(e.e); }

  function onDown(e) {
    if (!S || S.gesture) return;
    var c = S.c, t = S.tool;
    if (S.mode !== 'write' || t === 'hand' || S.space || (e.e && e.e.button === 1)) { S.pan = ptOf(e); userNav(); return; }
    S.strokeAt = Date.now();
    if (t === 'pen' || t === 'hl') {
      S.drawing = true; S.stroke = { id: uid(), sent: 0, c: c.freeDrawingBrush.color, w: c.freeDrawingBrush.width }; schedFlush();
    } else if (t === 'eraser') { S.erasing = true; S.erased = []; eraseAt(e); }
    else if (t === 'text') { addText(wp(e)); }
    else if (t === 'select') {
      var tg = e.target; if (tg) tg.__b = ser(tg);
    } else { var p = wp(e); S.shape = { id: uid(), x0: p.x, y0: p.y, obj: null }; }
  }
  function onMove(e) {
    if (!S) return;
    if (S.pan) { var p = ptOf(e); S.c.relativePan(new fabric.Point(p.x - S.pan.x, p.y - S.pan.y)); S.pan = p; afterView(); return; }
    if (S.mode !== 'write' || S.gesture) return;
    if (S.erasing) { eraseAt(e); return; }
    if (S.shape) {
      var p2 = wp(e), s = S.shape, c = S.c;
      if (Math.hypot(p2.x - s.x0, p2.y - s.y0) < 2 && !s.obj) return;
      if (s.obj) c.remove(s.obj);
      var o = mk(S.tool, s.x0, s.y0, p2.x, p2.y, s.id); if (!o) return;
      s.obj = o; flag(o); c.add(o); qu({ t: 'u', o: ser(o) }); c.requestRenderAll();
    }
  }
  function onUp(e) {
    if (!S) return;
    if (S.pan) { S.pan = null; return; }
    if (S.mode !== 'write') return;
    if (S.erasing) { S.erasing = false; if (S.erased && S.erased.length) push({ k: 'del', os: S.erased }); S.erased = []; return; }
    if (S.shape) {
      var s = S.shape; S.shape = null;
      if (s.obj) {
        var b = s.obj.getBoundingRect(true, true);
        if (b.width < 4 && b.height < 4) { S.c.remove(s.obj); qu({ t: 'd', id: s.id }); }
        else { qu({ t: 'u', o: ser(s.obj) }); push({ k: 'add', o: ser(s.obj) }); }
      }
      return;
    }
    if (S.drawing) { S.drawing = false; }
  }
  function onPath(e) {
    if (!S || S.mode !== 'write') { if (S && e.path) S.c.remove(e.path); return; }
    var p = e.path;
    if (S.gestureAt && S.strokeAt && S.gestureAt >= S.strokeAt) { S.c.remove(p); if (S.stroke) qu({ t: 'd', id: S.stroke.id }); S.stroke = null; return; }
    p.id = (S.stroke && S.stroke.id) || uid(); S.stroke = null; S.drawing = false;
    flag(p); qu({ t: 'u', o: ser(p) }); push({ k: 'add', o: ser(p) });
  }
  function onXform(e) { if (S && S.mode === 'write' && e.target && e.target.id) qu({ t: 'u', o: ser(e.target) }); }
  function onModified(e) {
    if (!S || S.mode !== 'write') return;
    var t = e.target; if (!t || !t.id) return;
    var before = t.__b; t.__b = null; if (!before) return;
    var after = ser(t); qu({ t: 'u', o: after }); push({ k: 'mod', b: before, a: after });
  }
  function eraseAt(e) {
    var c = S.c, t = c.findTarget(e.e, false);
    if (t && t.id) { S.erased.push(ser(t)); c.remove(t); qu({ t: 'd', id: t.id }); c.requestRenderAll(); }
  }
  function arrowPath(x0, y0, x1, y1) {
    var a = Math.atan2(y1 - y0, x1 - x0), L = Math.max(14, S.width * 4.5), b = 0.5;
    var p1 = [x1 - L * Math.cos(a - b), y1 - L * Math.sin(a - b)], p2 = [x1 - L * Math.cos(a + b), y1 - L * Math.sin(a + b)];
    return 'M ' + x0 + ' ' + y0 + ' L ' + x1 + ' ' + y1 + ' M ' + p1[0] + ' ' + p1[1] + ' L ' + x1 + ' ' + y1 + ' L ' + p2[0] + ' ' + p2[1];
  }
  function mk(t, x0, y0, x1, y1, id) {
    var st = { stroke: S.color, strokeWidth: S.width, fill: '', strokeUniform: true, strokeLineCap: 'round', strokeLineJoin: 'round', id: id };
    var l = Math.min(x0, x1), tp = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    if (t === 'rect') return new fabric.Rect(Object.assign({ left: l, top: tp, width: w, height: h }, st));
    if (t === 'ellipse') return new fabric.Ellipse(Object.assign({ left: l, top: tp, rx: w / 2, ry: h / 2 }, st));
    if (t === 'tri') return new fabric.Triangle(Object.assign({ left: l, top: tp, width: w, height: h }, st));
    if (t === 'line') return new fabric.Line([x0, y0, x1, y1], st);
    if (t === 'arrow') return new fabric.Path(arrowPath(x0, y0, x1, y1), st);
    return null;
  }
  function addText(p) {
    var c = S.c, t = new fabric.IText('', { left: p.x, top: p.y, fontSize: 12 + S.width * 4, fill: S.color, fontFamily: 'Arial, Helvetica, sans-serif', id: uid() });
    t.__new = true; flag(t); t.selectable = true; t.evented = true;
    c.skipTargetFind = false; c.add(t); c.setActiveObject(t); t.enterEditing();
    if (t.hiddenTextarea) t.hiddenTextarea.focus();
  }

  /* ------------------------------------------------------------------ undo / redo / clear */
  function push(a) { S.undo.push(a); if (S.undo.length > 200) S.undo.shift(); S.redo = []; updBtns(); }
  function upsert(so) {
    return enlivenAll([so]).then(function (r) {
      var ob = r[0]; if (!ob) return; var old = find(so.id), i = -1;
      if (old) { i = S.c.getObjects().indexOf(old); S.c.remove(old); }
      flag(ob); if (i >= 0) S.c.insertAt(ob, i); else S.c.add(ob);
      qu({ t: 'u', o: ser(ob) });
    });
  }
  function removeId(id) { var o = find(id); S.c.discardActiveObject(); if (o) S.c.remove(o); qu({ t: 'd', id: id }); }
  function chainAll(arr) { return arr.reduce(function (p, o) { return p.then(function () { return upsert(o); }); }, Promise.resolve()); }
  function doUndo() {
    if (S.mode !== 'write' || S.busy) return; var a = S.undo.pop(); if (!a) return; S.busy = true;
    var p;
    if (a.k === 'add') { removeId(a.o.id); p = Promise.resolve(); }
    else if (a.k === 'del') p = chainAll(a.os);
    else if (a.k === 'mod') p = upsert(a.b);
    else if (a.k === 'clr') p = chainAll(a.os);
    p.then(function () { S.busy = false; S.redo.push(a); S.c.requestRenderAll(); updBtns(); });
  }
  function doRedo() {
    if (S.mode !== 'write' || S.busy) return; var a = S.redo.pop(); if (!a) return; S.busy = true;
    var p = Promise.resolve();
    if (a.k === 'add') p = upsert(a.o);
    else if (a.k === 'del') a.os.forEach(function (o) { removeId(o.id); });
    else if (a.k === 'mod') p = upsert(a.a);
    else if (a.k === 'clr') { wipe(); }
    p.then(function () { S.busy = false; S.undo.push(a); S.c.requestRenderAll(); updBtns(); });
  }
  function wipe() { var c = S.c; c.discardActiveObject(); c.remove.apply(c, c.getObjects().slice()); qu({ t: 'c' }); }
  function clearAll() {
    if (S.mode !== 'write') return;
    var os = S.c.getObjects().map(ser); if (!os.length) return;
    if (!window.confirm('Clear the whole board for Week ' + S.week + '?\n\nEveryone watching will see it disappear. You can press Undo straight afterwards.')) return;
    wipe(); push({ k: 'clr', os: os });
  }
  function onKey(e) {
    if (!S || S.mode !== 'write') return;
    var a = S.c.getActiveObject(); if (a && a.isEditing) return;
    var tag = (e.target && e.target.tagName) || ''; if (/INPUT|TEXTAREA|SELECT/.test(tag) && e.target.type !== 'range') return;
    if (e.target && e.target !== document.body && e.target.closest && !S.root.contains(e.target)) return;
    var k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); doRedo(); }
    else if ((k === 'delete' || k === 'backspace') && a) { e.preventDefault(); var b = ser(a); removeId(a.id); push({ k: 'del', os: [b] }); }
    else if (k === ' ' && !S.space) { e.preventDefault(); S.space = true; S.c.isDrawingMode = false; }
  }
  function onKeyUp(e) { if (S && e.key === ' ' && S.space) { S.space = false; if (S.tool === 'pen' || S.tool === 'hl') S.c.isDrawingMode = true; } }

  /* ------------------------------------------------------------------ export */
  function renderImage(objects, title) {
    return needFab().then(function () {
      var el = document.createElement('canvas'), sc = new fabric.StaticCanvas(el, { width: 100, height: 100, renderOnAddRemove: false });
      return new Promise(function (res) { sc.loadFromJSON({ objects: objects }, res); }).then(function () {
        var os = sc.getObjects(); if (!os.length) { sc.dispose(); return null; }
        var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        os.forEach(function (o) { var b = o.getBoundingRect(true, true); x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top); x1 = Math.max(x1, b.left + b.width); y1 = Math.max(y1, b.top + b.height); });
        var pad = 48, head = title ? 56 : 0, w = Math.ceil(x1 - x0 + pad * 2), h = Math.ceil(y1 - y0 + pad * 2 + head);
        var m = Math.max(0.5, Math.min(2, 7000 / Math.max(w, h)));
        sc.setDimensions({ width: w, height: h }); sc.setViewportTransform([1, 0, 0, 1, pad - x0, pad + head - y0]); sc.backgroundColor = '#ffffff';
        if (title) sc.add(new fabric.Text(title, { left: x0, top: y0 - head + 8, fontSize: 22, fill: '#10163a', fontFamily: 'Arial, Helvetica, sans-serif' }));
        sc.renderAll();
        var url = sc.toDataURL({ format: 'png', multiplier: m }); sc.dispose();
        return { url: url, w: w, h: h };
      });
    });
  }
  function toBlob(url) {
    var parts = url.split(','), mime = (parts[0].match(/:(.*?);/) || [0, 'image/png'])[1], bin = atob(parts[1]), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return Promise.resolve(new Blob([u8], { type: mime }));
  }
  function makePdf(img) {
    return need(PDF, function () { return window.jspdf; }).then(function () {
      var J = window.jspdf.jsPDF, pdf = new J({ orientation: img.w >= img.h ? 'l' : 'p', unit: 'px', format: [img.w, img.h], hotfixes: ['px_scaling'], compress: true });
      pdf.addImage(img.url, 'PNG', 0, 0, img.w, img.h); return pdf;
    });
  }
  function fileName(week, ext) { return 'TTE-Proper-Week-' + (week < 10 ? '0' : '') + week + '-LiveBoard.' + ext; }
  function saveAs(blob, name) {
    var a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 1500);
  }
  function exportObjects(objects, week, fmt) {
    return renderImage(objects, 'TTE Proper · Week ' + week).then(function (img) {
      if (!img) return { empty: true };
      if (fmt === 'png') return toBlob(img.url).then(function (b) { return { blob: b, name: fileName(week, 'png') }; });
      return makePdf(img).then(function (pdf) { return { blob: pdf.output('blob'), name: fileName(week, 'pdf') }; });
    });
  }
  function exportNow(fmt) {
    var b = $('lb-' + fmt); if (b) b.disabled = true;
    var objs = S.c.getObjects().filter(function (o) { return o.id; }).map(ser);
    exportObjects(objs, S.week, fmt).then(function (r) {
      if (b) b.disabled = false;
      if (r.empty) { banner('The board is empty, so there is nothing to download yet.'); return; }
      saveAs(r.blob, r.name);
    }).catch(function (e) { if (b) b.disabled = false; banner('⚠️ ' + esc(e.message || e)); });
  }
  function saveNotes() {
    var b = $('lb-notes'); if (b) b.disabled = true;
    var cur = S; flush();
    exportObjects(S.c.getObjects().filter(function (o) { return o.id; }).map(ser), S.week, 'pdf').then(function (r) {
      if (r.empty) { if (b) b.disabled = false; banner('The board is empty, so there is nothing to save yet.'); return; }
      return S.o.saveNotes(r.blob, r.name).then(function () { if (b) b.disabled = false; if (S === cur) banner('✅ Saved as class notes. Students will find the PDF under Documents for Week ' + S.week + '.'); });
    }).catch(function (e) { if (b) b.disabled = false; if (S) banner('⚠️ ' + esc(e.message || e)); });
  }

  /* Download a saved board without opening it (used on the week page) */
  LB.download = function (o, fmt) {
    return o.sb.from('tte_boards').select('data').eq('level', o.level || 'proper').eq('week', o.week).maybeSingle().then(function (r) {
      if (r.error) throw r.error;
      var objs = (r.data && r.data.data && r.data.data.objects) || [];
      return exportObjects(objs, o.week, fmt);
    }).then(function (r) { if (r.empty) return { empty: true }; saveAs(r.blob, r.name); return { ok: true }; });
  };
  LB._export = exportObjects;

  window.LiveBoard = LB;
})();
