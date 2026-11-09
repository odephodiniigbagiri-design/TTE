/* TTE DocView: read uploaded class documents inside the site (next to the comments).
   PDF  -> pdf.js          Word (.docx) -> docx-preview     Excel/CSV -> SheetJS (plain tables)
   Text and images -> shown directly.
   PowerPoint and old Word files cannot be drawn in the browser, so they use Microsoft's free viewer. */
(function () {
  'use strict';
  var LIBS = {
    PDFJS: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
    PDFW: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
    JSZIP: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    DOCX: 'https://cdn.jsdelivr.net/npm/docx-preview@0.3.3/dist/docx-preview.min.js',
    XLSX: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
  };
  var DV = {}, S = null, loaders = {};
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  function need(src, test) {
    if (test && test()) return Promise.resolve();
    if (loaders[src]) return loaders[src];
    loaders[src] = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { delete loaders[src]; rej(new Error('Could not load the document reader. Check your internet connection.')); };
      document.head.appendChild(s);
    });
    return loaders[src];
  }

  var CSS = '\
html.dv-open,html.dv-open body{overflow:hidden}\
.dv{display:flex;flex-direction:column;background:var(--card,#fff);color:var(--fg,#10163a)}\
.dv *{box-sizing:border-box}\
.dv-inline{position:relative;width:100%;height:100%;border:1px solid var(--line,#dde3f3);border-radius:12px;overflow:hidden;min-height:0}\
.dv-full{position:fixed;inset:0;z-index:2000}\
.dv-h{display:flex;align-items:center;gap:.35rem;padding:.35rem .6rem;border-bottom:1px solid var(--line,#dde3f3);background:var(--card,#fff);flex-wrap:wrap}\
.dv-h .dv-t{flex:1;min-width:7rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:800;font-size:.9rem}\
.dv-pgn{font-size:.8rem;font-weight:700;opacity:.8;white-space:nowrap}\
.dv-b{font:inherit;font-size:.8rem;font-weight:700;display:inline-flex;align-items:center;padding:.28rem .6rem;border-radius:9px;border:1.5px solid var(--line,#dde3f3);background:transparent;color:inherit;cursor:pointer;white-space:nowrap}\
.dv-b:hover{border-color:var(--sun,#f5a524)}\
.dv-body{flex:1;overflow:auto;min-height:0;background:#d9deea;padding:.6rem;-webkit-overflow-scrolling:touch}\
.dv-body.dv-fr{padding:0;background:#fff;display:flex;flex-direction:column}\
.dv-pg{margin:0 auto .6rem;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.25)}.dv-pg canvas{display:block}\
.dv-docx{margin:0 auto;width:max-content;max-width:none}\
.dv-docx .docx-wrapper{background:transparent!important;padding:0!important}\
.dv-msg{padding:1.4rem;text-align:center;background:var(--card,#fff);color:var(--fg,#10163a);border-radius:10px;max-width:34rem;margin:1rem auto}\
.dv-msg .dv-b{margin:.3rem .15rem 0}\
.dv-txt{white-space:pre-wrap;word-break:break-word;text-align:left;background:#fff;color:#111;padding:1rem 1.2rem;border-radius:8px;font:15px/1.6 Georgia,serif;max-width:60rem;margin:0 auto}\
.dv-sheet{text-align:left}.dv-sheet .dv-tabs{display:flex;gap:.3rem;flex-wrap:wrap;margin-bottom:.5rem}\
.dv-sheet table{border-collapse:collapse;background:#fff;color:#111;font-size:.85rem}.dv-sheet td{border:1px solid #c5cbe0;padding:.2rem .55rem;white-space:nowrap}\
.dv-note{font-size:.78rem;padding:.35rem .7rem;background:var(--card,#fff);color:var(--fg,#10163a);border-bottom:1px solid var(--line,#dde3f3)}\
.dv-frame{flex:1;width:100%;border:0;background:#fff;min-height:0}\
.dv-img{max-width:100%;height:auto;background:#fff;display:block;margin:0 auto}';
  function injectCss() { if (document.getElementById('dv-css')) return; var s = document.createElement('style'); s.id = 'dv-css'; s.textContent = CSS; document.head.appendChild(s); }

  function kindOf(o) {
    var n = (o.name || '').toLowerCase(), m = (o.mime || '').toLowerCase(), e = (n.match(/\.([a-z0-9]+)$/) || [])[1] || '';
    if (m === 'application/pdf' || e === 'pdf') return 'pdf';
    if (e === 'docx') return 'docx';
    if (/^(xlsx|xls|csv)$/.test(e)) return 'sheet';
    if (e === 'txt' || m === 'text/plain') return 'txt';
    if (/^image\//.test(m) || /^(png|jpe?g|gif|webp)$/.test(e)) return 'img';
    if (/^(pptx|ppt|doc|docm|dotx|odt|odp|ods)$/.test(e)) return 'office';
    return 'other';
  }

  var $ = function (id) { return S && S.root ? S.root.querySelector('#' + id) : null; };
  function msg(html) { if (S) { S.body.className = 'dv-body'; S.body.innerHTML = '<div class="dv-msg">' + html + '</div>'; } }

  /* ---------------------------------------------------------------- open / close */
  DV.isOpen = function () { return !!S; };
  DV.key = function () { return S ? S.o.key : null; };
  DV.id = function () { return S ? S.o.id : null; };
  DV._state = function () { return S; };

  DV.open = function (slot, o) {
    if (S) teardown(S, true);
    injectCss();
    var root = document.createElement('div'); root.className = 'dv dv-inline'; root.setAttribute('aria-label', 'Document reader');
    root.innerHTML = '<div class="dv-h"><span class="dv-t" id="dv-t"></span><span class="dv-pgn" id="dv-pg"></span>' +
      '<button class="dv-b" id="dv-zo" aria-label="Zoom out" title="Zoom out">−</button><button class="dv-b" id="dv-zi" aria-label="Zoom in" title="Zoom in">+</button><button class="dv-b" id="dv-fit" title="Fit to width">Fit</button>' +
      '<button class="dv-b" id="dv-dl" title="Download this file">⬇ Download</button><button class="dv-b" id="dv-exp" title="Make the reader fill the screen">⤢ Expand</button></div><div class="dv-body" id="dv-body"></div>';
    slot.textContent = ''; slot.appendChild(root);
    S = { o: o, root: root, body: root.querySelector('#dv-body'), slot: slot, expanded: false, zoom: 1, gen: 0, layoutGen: 0, kind: kindOf(o), listeners: [], lastW: 0 };
    $('dv-t').textContent = o.name || 'Document';
    ['dv-zo', 'dv-zi', 'dv-fit'].forEach(function (id) { if (!/^(pdf|docx|img)$/.test(S.kind)) $(id).style.display = 'none'; });
    $('dv-zi').onclick = function () { setZoom(S.zoom * 1.25); };
    $('dv-zo').onclick = function () { setZoom(S.zoom * 0.8); };
    $('dv-fit').onclick = function () { setZoom(1); };
    $('dv-dl').onclick = download;
    $('dv-exp').onclick = function () { setExpanded(!S.expanded); };
    var cur = S;
    var onKey = function (e) { if (S === cur && S.expanded && e.key === 'Escape') setExpanded(false); };
    document.addEventListener('keydown', onKey); S.listeners.push([document, 'keydown', onKey]);
    var onRs = function () { relayout(); };
    window.addEventListener('resize', onRs); S.listeners.push([window, 'resize', onRs]);
    if (typeof ResizeObserver !== 'undefined') { S.ro = new ResizeObserver(function () { relayout(); }); S.ro.observe(S.body); }
    body_scroll();
    load();
  };

  DV.close = function () { if (S) teardown(S, false); };
  function teardown(s, silent) {
    s.gen++; s.layoutGen++;
    s.listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); });
    try { if (s.io) s.io.disconnect(); if (s.ro) s.ro.disconnect(); if (s.pdf && s.pdf.destroy) s.pdf.destroy(); } catch (e) { }
    if (s.root && s.root.parentNode) s.root.parentNode.removeChild(s.root);
    document.documentElement.classList.remove('dv-open');
    if (S === s) S = null;
    if (!silent) { try { if (s.o.onClose) s.o.onClose(); } catch (e) { } }
  }
  function setExpanded(b) {
    if (!S) return; var r = S.root;
    if (b) { S.expanded = true; r.className = 'dv dv-full'; document.body.appendChild(r); document.documentElement.classList.add('dv-open'); $('dv-exp').textContent = '⤡ Back'; }
    else {
      var sl = document.getElementById('docslot') || S.slot; if (!sl || sl.isConnected === false) return;
      S.expanded = false; r.className = 'dv dv-inline'; document.documentElement.classList.remove('dv-open');
      sl.textContent = ''; sl.appendChild(r); S.slot = sl; $('dv-exp').textContent = '⤢ Expand';
    }
    setTimeout(relayout, 30);
  }
  /* the classroom page redraws itself now and then: put the reader back into the new frame */
  DV.attach = function (slot) {
    if (!S || S.expanded || !slot) return;
    if (S.root.parentNode !== slot) { slot.textContent = ''; slot.appendChild(S.root); }
    S.slot = slot; relayout();
  };
  function download() {
    var s = S; if (!s) return;
    Promise.resolve(s.o.download ? s.o.download() : s.o.url).then(function (u) {
      var a = document.createElement('a'); a.href = u; a.download = s.o.name || 'document'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
    }).catch(function (e) { msg('⚠️ ' + esc(e.message || e)); });
  }

  /* ---------------------------------------------------------------- loading */
  function load() {
    var s = S, g = ++s.gen, url = s.o.url, k = s.kind;
    var live = function () { return S === s && s.gen === g; };
    msg('Loading the document…');
    if (k === 'office') { showOffice(); return; }
    if (k === 'other') { fail(new Error('This kind of file cannot be shown on the page.'), false); return; }
    if (k === 'img') { s.body.className = 'dv-body'; s.body.innerHTML = '<img class="dv-img" alt="">'; var im = s.body.firstChild; im.src = url; im.onerror = function () { fail(new Error('The image could not be loaded.'), false); }; setZoom(1); return; }
    fetch(url).then(function (r) { if (!r.ok) throw new Error('The file could not be loaded (' + r.status + ').'); return k === 'txt' ? r.text() : r.arrayBuffer(); }).then(function (data) {
      if (!live()) return;
      if (k === 'pdf') return showPdf(data, live);
      if (k === 'docx') return showDocx(data, live);
      if (k === 'sheet') return showSheet(data, live);
      if (k === 'txt') return showTxt(data);
    }).catch(function (e) { if (live()) fail(e, k === 'docx'); });
  }
  function fail(e, canOffice) {
    msg('⚠️ ' + esc(e && e.message ? e.message : e) + '<br><button class="dv-b" id="dv-f1">⬇ Download the file</button>' + (canOffice ? '<button class="dv-b" id="dv-f2">Try Microsoft’s viewer</button>' : '') + '<button class="dv-b" id="dv-f3">Open in a new tab</button>');
    var a = $('dv-f1'); if (a) a.onclick = download;
    var b = $('dv-f2'); if (b) b.onclick = showOffice;
    var c = $('dv-f3'); if (c) c.onclick = function () { window.open(S.o.url, '_blank', 'noopener'); };
  }
  function showOffice() {
    var s = S; if (!s) return;
    s.kind = 'office'; ['dv-zo', 'dv-zi', 'dv-fit'].forEach(function (id) { var e = $(id); if (e) e.style.display = 'none'; });
    s.body.className = 'dv-body dv-fr';
    s.body.innerHTML = '<div class="dv-note">PowerPoint and older Word files are shown with Microsoft’s free viewer. The file is sent to Microsoft only to be displayed, through a temporary link.</div><iframe class="dv-frame" title="Document" allowfullscreen></iframe>';
    s.body.querySelector('iframe').src = 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(s.o.url);
  }

  /* ---------------------------------------------------------------- text, sheets */
  function showTxt(t) {
    S.body.className = 'dv-body'; var p = document.createElement('div'); p.className = 'dv-txt';
    p.textContent = t.length > 400000 ? t.slice(0, 400000) + '\n\n… (the rest is in the download)' : t; S.body.innerHTML = ''; S.body.appendChild(p);
  }
  function showSheet(buf, live) {
    return need(LIBS.XLSX, function () { return window.XLSX; }).then(function () {
      if (!live()) return;
      var X = window.XLSX, wb = X.read(buf, { type: 'array' }), names = wb.SheetNames || [];
      if (!names.length) throw new Error('This spreadsheet has no sheets.');
      S.body.className = 'dv-body'; S.body.innerHTML = '<div class="dv-sheet"><div class="dv-tabs"></div><div class="dv-tbl"></div></div>';
      var tabs = S.body.querySelector('.dv-tabs'), tbl = S.body.querySelector('.dv-tbl');
      function show(n) {
        var rows = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', blankrows: false }), cut = rows.length > 2000;
        if (cut) rows = rows.slice(0, 2000);
        var t = document.createElement('table');
        rows.forEach(function (r) { var tr = document.createElement('tr'); r.slice(0, 60).forEach(function (v) { var td = document.createElement('td'); td.textContent = v == null ? '' : String(v); tr.appendChild(td); }); t.appendChild(tr); });
        tbl.innerHTML = ''; tbl.appendChild(t);
        if (cut) { var p = document.createElement('p'); p.textContent = 'Only the first 2,000 rows are shown here. Download the file to see everything.'; tbl.appendChild(p); }
        Array.prototype.forEach.call(tabs.children, function (b) { b.style.background = b.textContent === n ? 'var(--sun,#f5a524)' : ''; });
      }
      names.forEach(function (n) { var b = document.createElement('button'); b.className = 'dv-b'; b.textContent = n; b.onclick = function () { show(n); }; tabs.appendChild(b); });
      if (names.length < 2) tabs.style.display = 'none';
      show(names[0]);
    });
  }

  /* ---------------------------------------------------------------- Word */
  function showDocx(buf, live) {
    return Promise.all([need(LIBS.JSZIP, function () { return window.JSZip; })]).then(function () { return need(LIBS.DOCX, function () { return window.docx; }); }).then(function () {
      if (!live()) return;
      S.body.className = 'dv-body'; S.body.innerHTML = '<div class="dv-docx"></div>';
      var host = S.body.firstChild;
      var timeout = new Promise(function (_, rej) { setTimeout(function () { rej(new Error('This Word file is taking too long to open.')); }, 25000); });
      return Promise.race([window.docx.renderAsync(buf, host, null, { className: 'docx', inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true }), timeout]).then(function () { if (live()) fitDocx(); });
    });
  }
  function fitDocx() {
    var host = S.body.querySelector('.dv-docx'); if (!host) return;
    var sec = host.querySelector('section'), w = (sec && sec.offsetWidth) || 794, avail = Math.max(200, S.body.clientWidth - 24);
    host.style.zoom = String(clamp(Math.min(1, avail / w) * S.zoom, 0.3, 3));
  }

  /* ---------------------------------------------------------------- PDF */
  function pageW() { return Math.round(clamp((S.body.clientWidth || 600) - 20, 200, 1400) * S.zoom); }
  function showPdf(buf, live) {
    return need(LIBS.PDFJS, function () { return window.pdfjsLib; }).then(function () {
      var lib = window.pdfjsLib;
      if (!lib.GlobalWorkerOptions.workerSrc && !window.pdfjsWorker) {
        return fetch(LIBS.PDFW).then(function (r) { return r.text(); }).then(function (t) { lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([t], { type: 'text/javascript' })); }).catch(function () { lib.GlobalWorkerOptions.workerSrc = LIBS.PDFW; });
      }
    }).then(function () { return window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise; }).then(function (doc) {
      if (!live()) { doc.destroy(); return; }
      S.pdf = doc; S.n = doc.numPages;
      S.body.className = 'dv-body'; S.body.innerHTML = '';
      var wrap = document.createElement('div'); S.body.appendChild(wrap); S.wrap = wrap;
      for (var i = 1; i <= S.n; i++) { var d = document.createElement('div'); d.className = 'dv-pg'; d.dataset.i = i; d.appendChild(document.createElement('canvas')); wrap.appendChild(d); }
      return doc.getPage(1).then(function (p1) { var v = p1.getViewport({ scale: 1 }); S.ar = v.height / v.width; layoutPdf(); });
    });
  }
  function layoutPdf() {
    if (!S || !S.pdf || !S.wrap) return;
    S.layoutGen++; var W = pageW(), H = Math.round(W * S.ar);
    S.lastW = S.body.clientWidth;
    Array.prototype.forEach.call(S.wrap.children, function (d) { d.__r = false; d.style.width = W + 'px'; d.style.height = H + 'px'; var c = d.firstChild; c.width = c.height = 0; });
    if (S.io) S.io.disconnect();
    if (typeof IntersectionObserver !== 'undefined') {
      S.io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) drawPage(e.target); else release(e.target); }); }, { root: S.body, rootMargin: '1400px 0px' });
      Array.prototype.forEach.call(S.wrap.children, function (d) { S.io.observe(d); });
    } else {
      Array.prototype.slice.call(S.wrap.children, 0, 40).forEach(drawPage);
    }
    pageNo();
  }
  function drawPage(d) {
    var s = S; if (!s || !s.pdf || d.__r) return; d.__r = true;
    var g = s.layoutGen, i = +d.dataset.i;
    s.pdf.getPage(i).then(function (pg) {
      if (S !== s || g !== s.layoutGen) return;
      var W = pageW(), v0 = pg.getViewport({ scale: 1 }), dpr = Math.min(2, window.devicePixelRatio || 1), vp = pg.getViewport({ scale: W / v0.width * dpr }), c = d.firstChild;
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height); c.style.width = W + 'px'; c.style.height = (vp.height / dpr) + 'px'; d.style.height = (vp.height / dpr) + 'px';
      return pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }).catch(function () { d.__r = false; });
  }
  function release(d) { if (!d.__r) return; d.__r = false; var c = d.firstChild; c.width = c.height = 0; }
  function body_scroll() {
    var t = null; S.body.addEventListener('scroll', function () { if (t) return; t = setTimeout(function () { t = null; pageNo(); }, 120); });
  }
  function pageNo() {
    var e = $('dv-pg'); if (!e || !S || !S.wrap) { if (e) e.textContent = ''; return; }
    var mid = S.body.scrollTop + S.body.clientHeight / 3, cur = 1, ch = S.wrap.children;
    for (var i = 0; i < ch.length; i++) { if (ch[i].offsetTop - S.wrap.offsetTop <= mid) cur = i + 1; else break; }
    e.textContent = 'Page ' + cur + ' / ' + S.n;
  }

  /* ---------------------------------------------------------------- zoom and resizing */
  function setZoom(z) {
    if (!S) return; S.zoom = clamp(z, 0.5, 3);
    if (S.kind === 'pdf') layoutPdf();
    else if (S.kind === 'docx') fitDocx();
    else if (S.kind === 'img') { var im = S.body.querySelector('img'); if (im) im.style.width = (S.zoom * 100) + '%'; }
  }
  function relayout() {
    if (!S) return; var w = S.body.clientWidth; if (w < 60) return;
    if (Math.abs(w - S.lastW) < 8) return; S.lastW = w;
    if (S.kind === 'pdf') layoutPdf(); else if (S.kind === 'docx') fitDocx();
  }

  window.DocView = DV;
})();
