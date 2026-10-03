/* Общие штуки для обеих страниц: появление при скролле, счётчики, диаграммы,
   обратный отсчёт и фейерверк. Без зависимостей. */
(function () {
  'use strict';

  // 5 октября 2026, 20:00 по Москве (UTC+3)
  var TARGET = Date.UTC(2026, 9, 5, 17, 0, 0);
  // Начало «пути» для прогресс-бара — 2 октября, 00:00 МСК
  var START = Date.UTC(2026, 9, 1, 21, 0, 0);
  var params = new URLSearchParams(location.search);
  // ?boom — посмотреть финал заранее
  var PREVIEW = params.has('boom');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function svg(tag, attrs, parent) {
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  function fmt(n) {
    return Math.round(n).toLocaleString('ru-RU');
  }

  /* ---------- Появление при скролле ---------- */
  function onVisible(el, cb, threshold) {
    if (!('IntersectionObserver' in window)) { cb(el); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { io.unobserve(e.target); cb(e.target); }
      });
    }, { threshold: threshold || 0.2 });
    io.observe(el);
  }

  function countUp(el) {
    var to = parseFloat(el.dataset.count);
    var suffix = el.dataset.suffix || '';
    if (reduce) { el.textContent = fmt(to) + suffix; return; }
    var dur = parseInt(el.dataset.dur || '1600', 10);
    var t0 = performance.now();
    (function tick(t) {
      var p = Math.min(1, (t - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt(to * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  function initReveal() {
    document.querySelectorAll('.reveal').forEach(function (el) {
      onVisible(el, function (t) { t.classList.add('in'); }, 0.15);
    });
    document.querySelectorAll('[data-count]').forEach(function (el) {
      el.textContent = '0' + (el.dataset.suffix || '');
      onVisible(el, countUp, 0.5);
    });
  }

  /* ---------- Кольцевая диаграмма ---------- */
  function donut(root, items, opts) {
    opts = opts || {};
    var size = 220, r = opts.r || 80, w = opts.w || 34;
    var C = 2 * Math.PI * r;
    var total = items.reduce(function (s, i) { return s + i.value; }, 0);
    var wrap = document.createElement('div');
    wrap.className = 'donut';
    var s = svg('svg', { viewBox: '0 0 ' + size + ' ' + size, role: 'img',
      'aria-label': opts.label || 'Диаграмма' });
    var g = svg('g', { transform: 'rotate(-90 110 110)' }, s);
    svg('circle', { cx: 110, cy: 110, r: r, fill: 'none', class: 'donut-track', 'stroke-width': w }, g);
    var acc = 0, segs = [];
    var gap = opts.gap == null ? 2 : opts.gap;
    items.forEach(function (it, i) {
      var len = (it.value / total) * C;
      var c = svg('circle', {
        cx: 110, cy: 110, r: r, fill: 'none', stroke: it.color, 'stroke-width': w,
        'stroke-dasharray': '0 ' + C, 'stroke-dashoffset': -acc, class: 'donut-seg'
      }, g);
      c.style.transitionDelay = (i * 120) + 'ms';
      segs.push({ el: c, len: Math.max(0, len - gap) });
      acc += len;
    });
    var center = document.createElement('div');
    center.className = 'donut-center';
    center.innerHTML = '<b>' + (opts.centerTop || '100%') + '</b><span>' + (opts.centerBottom || '') + '</span>';
    var chart = document.createElement('div');
    chart.className = 'donut-chart';
    chart.appendChild(s);
    chart.appendChild(center);
    wrap.appendChild(chart);

    var legend = document.createElement('ul');
    legend.className = 'legend';
    items.forEach(function (it, i) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = '<i style="background:' + it.color + '"></i><span class="lg-label">' + it.label +
        '</span><span class="lg-val">' + Math.round(it.value / total * 100) + '%</span>';
      btn.addEventListener('click', function () {
        var active = wrap.dataset.active === String(i);
        wrap.dataset.active = active ? '' : String(i);
        segs.forEach(function (sg, j) {
          sg.el.classList.toggle('dim', !active && j !== i);
        });
        legend.querySelectorAll('button').forEach(function (b, j) {
          b.classList.toggle('on', !active && j === i);
        });
        center.innerHTML = active
          ? '<b>' + (opts.centerTop || '100%') + '</b><span>' + (opts.centerBottom || '') + '</span>'
          : '<b>' + Math.round(it.value / total * 100) + '%</b><span>' + (it.note || it.label) + '</span>';
      });
      li.appendChild(btn);
      legend.appendChild(li);
    });
    wrap.appendChild(legend);
    root.appendChild(wrap);

    onVisible(wrap, function () {
      segs.forEach(function (sg) {
        sg.el.setAttribute('stroke-dasharray', sg.len + ' ' + C);
      });
    }, 0.35);
  }

  /* ---------- Радар характеристик ---------- */
  function radar(root, items, opts) {
    opts = opts || {};
    var n = items.length, cx = 160, cy = 150, R = 100;
    var s = svg('svg', { viewBox: '-20 0 360 300', class: 'radar', role: 'img',
      'aria-label': opts.label || 'Радар характеристик' });
    function pt(i, k) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / n;
      return [cx + Math.cos(a) * R * k, cy + Math.sin(a) * R * k];
    }
    for (var lv = 1; lv <= 4; lv++) {
      var pts = [];
      for (var i = 0; i < n; i++) pts.push(pt(i, lv / 4).join(','));
      svg('polygon', { points: pts.join(' '), class: 'radar-grid' }, s);
    }
    for (var j = 0; j < n; j++) {
      var p = pt(j, 1);
      svg('line', { x1: cx, y1: cy, x2: p[0], y2: p[1], class: 'radar-axis' }, s);
      var lp = pt(j, 1.2);
      var anchor = Math.abs(lp[0] - cx) < 8 ? 'middle' : (lp[0] > cx ? 'start' : 'end');
      var t = svg('text', { x: lp[0], y: lp[1] + 4, 'text-anchor': anchor, class: 'radar-label' }, s);
      t.textContent = items[j].label;
    }
    var dp = items.map(function (it, i) { return pt(i, it.value / 100).join(','); });
    var g = svg('g', { class: 'radar-data' }, s);
    g.style.transformOrigin = cx + 'px ' + cy + 'px';
    svg('polygon', { points: dp.join(' '), class: 'radar-shape' }, g);
    items.forEach(function (it, i) {
      var p = pt(i, it.value / 100);
      svg('circle', { cx: p[0], cy: p[1], r: 4.5, class: 'radar-dot' }, g);
    });
    root.appendChild(s);
    onVisible(s, function () { s.classList.add('in'); }, 0.4);
  }

  /* ---------- Обратный отсчёт ---------- */
  function countdown(root, opts) {
    var cells = {};
    ['d', 'h', 'm', 's'].forEach(function (k) {
      cells[k] = root.querySelector('[data-cd="' + k + '"]');
    });
    var progress = document.querySelector('[data-progress]');
    var fired = false;
    function pad(v) { return (v < 10 ? '0' : '') + v; }
    function tick() {
      var now = Date.now();
      var left = PREVIEW ? 0 : Math.max(0, TARGET - now);
      var sec = Math.floor(left / 1000);
      var vals = {
        d: Math.floor(sec / 86400),
        h: Math.floor(sec % 86400 / 3600),
        m: Math.floor(sec % 3600 / 60),
        s: sec % 60
      };
      for (var k in cells) {
        if (!cells[k]) continue;
        var txt = pad(vals[k]);
        if (cells[k].textContent !== txt) {
          cells[k].textContent = txt;
          cells[k].classList.remove('flip');
          void cells[k].offsetWidth;
          cells[k].classList.add('flip');
        }
      }
      if (progress) {
        var p = PREVIEW ? 1 : Math.min(1, Math.max(0, (now - START) / (TARGET - START)));
        progress.style.setProperty('--p', p.toFixed(4));
      }
      if (left <= 0 && !fired) {
        fired = true;
        clearInterval(timer);
        arrive(opts);
      }
    }
    var timer = setInterval(tick, 1000);
    tick();
  }

  function arrive(opts) {
    document.body.classList.add('gift-arrived');
    var modal = document.getElementById('gift');
    if (modal) {
      modal.hidden = false;
      requestAnimationFrame(function () { modal.classList.add('show'); });
      var close = modal.querySelector('[data-close]');
      if (close) {
        close.addEventListener('click', function () {
          modal.classList.remove('show');
          setTimeout(function () { modal.hidden = true; }, 300);
        });
        setTimeout(function () { close.focus(); }, 400);
      }
    }
    if (navigator.vibrate) navigator.vibrate([80, 60, 80, 60, 200]);
    fireworks(opts && opts.colors);
  }

  /* ---------- Фейерверк ---------- */
  function fireworks(colors) {
    colors = colors || ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#ffffff'];
    var c = document.createElement('canvas');
    c.className = 'fw-canvas';
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    var ctx = c.getContext('2d');
    var W, H, dpr = Math.min(window.devicePixelRatio || 1, 2);
    function size() {
      W = innerWidth; H = innerHeight;
      c.width = W * dpr; c.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    addEventListener('resize', size);
    var G = 0.11, rockets = [], parts = [];

    function pick() { return colors[Math.floor(Math.random() * colors.length)]; }
    function launch(x, ty) {
      x = x == null ? W * (0.12 + Math.random() * 0.76) : x;
      ty = ty == null ? H * (0.12 + Math.random() * 0.33) : ty;
      rockets.push({ x: x, y: H, vx: (Math.random() - 0.5) * 1.2, vy: -Math.sqrt(2 * G * (H - ty)), color: pick() });
    }
    function burst(x, y, color) {
      var n = reduce ? 30 : 70 + Math.floor(Math.random() * 40);
      var second = Math.random() < 0.4 ? pick() : color;
      var ring = Math.random() < 0.3;
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2;
        var sp = ring ? 4 : 1 + Math.random() * 4.5;
        parts.push({
          x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 1, decay: 0.008 + Math.random() * 0.012,
          color: i % 3 ? color : second, size: 1.4 + Math.random() * 1.6
        });
      }
    }
    function frame() {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = rockets.length - 1; i >= 0; i--) {
        var r = rockets[i];
        r.x += r.vx; r.y += r.vy; r.vy += G;
        ctx.fillStyle = r.color;
        ctx.beginPath(); ctx.arc(r.x, r.y, 2.2, 0, 7); ctx.fill();
        if (r.vy >= -0.5) { burst(r.x, r.y, r.color); rockets.splice(i, 1); }
      }
      for (var j = parts.length - 1; j >= 0; j--) {
        var p = parts[j];
        p.vx *= 0.975; p.vy = p.vy * 0.975 + 0.05;
        p.x += p.vx; p.y += p.vy; p.life -= p.decay;
        if (p.life <= 0) { parts.splice(j, 1); continue; }
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    }
    frame();
    // первый залп
    for (var k = 0; k < (reduce ? 2 : 5); k++) setTimeout(launch, k * 220);
    (function auto() {
      launch();
      setTimeout(auto, reduce ? 2200 : 450 + Math.random() * 700);
    })();
    // тап по экрану = свой залп
    addEventListener('pointerdown', function (e) {
      if (e.target.closest('a,button')) return;
      launch(e.clientX, e.clientY);
    });
    return { launch: launch };
  }

  /* ---------- Плавный уход со страницы ---------- */
  function initPageLinks() {
    document.querySelectorAll('a[data-go]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (reduce || e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        document.body.classList.add('leaving');
        setTimeout(function () { location.href = a.href; }, 380);
      });
    });
    // возврат по кнопке «назад» из bfcache
    addEventListener('pageshow', function () { document.body.classList.remove('leaving'); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initReveal();
    initPageLinks();
  });

  window.Gift = {
    donut: donut, radar: radar, countdown: countdown, fireworks: fireworks,
    onVisible: onVisible, reduce: reduce, svg: svg
  };
})();
