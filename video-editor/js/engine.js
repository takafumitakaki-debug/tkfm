/* 再生・合成エンジン：タイムラインを canvas に描画し、音声を WebAudio でミックスする */
(() => {
  const VE = window.VE;
  const S = VE.state;

  const E = (VE.engine = {
    t: 0,
    playing: false,
    stalled: false,
    dirty: true,
    hideUI: false, // 書き出し・静止画では選択枠を描かない
    els: new Map(), // clipId -> HTMLMediaElement
    gains: new Map(), // HTMLMediaElement -> GainNode
    ac: null,
    master: null,
    monitor: null,
    dest: null,
    activeVideo: null,
    textBoxes: [],
    exporting: null,
    forceSync: false,
    last: 0,
  });

  E.init = (canvas) => {
    E.canvas = canvas;
    E.ctx = canvas.getContext('2d');
    E.resize();
    VE.bus.on('change', () => {
      E.resize();
      E.gc();
      E.t = Math.min(E.t, VE.totalDuration());
      E.dirty = true;
    });
    document.fonts && document.fonts.ready.then(() => (E.dirty = true));
    requestAnimationFrame(E.loop);
  };

  E.resize = () => {
    const { width, height } = S.settings;
    if (E.canvas.width !== width) E.canvas.width = width;
    if (E.canvas.height !== height) E.canvas.height = height;
  };

  /* ---------- 音声 ---------- */
  function connect(el) {
    if (!E.ac || E.gains.has(el)) return;
    try {
      const src = E.ac.createMediaElementSource(el);
      const g = E.ac.createGain();
      src.connect(g).connect(E.master);
      E.gains.set(el, g);
      el.volume = 1;
    } catch (e) {
      console.warn(e);
    }
  }
  E.ensureAudio = () => {
    if (!E.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      E.ac = new AC();
      E.master = E.ac.createGain();
      E.monitor = E.ac.createGain();
      E.dest = E.ac.createMediaStreamDestination();
      E.master.connect(E.monitor).connect(E.ac.destination);
      E.master.connect(E.dest);
      for (const el of E.els.values()) connect(el);
    }
    if (E.ac.state === 'suspended') E.ac.resume();
    return E.ac;
  };
  const setVol = (el, v) => {
    const g = E.gains.get(el);
    if (g) g.gain.value = v;
    else el.volume = VE.clamp(v, 0, 1);
  };

  /* ---------- メディア要素プール ---------- */
  E.getEl = (clip) => {
    const m = VE.mediaById(clip.mediaId);
    if (!m || !m.url) return null;
    let el = E.els.get(clip.id);
    if (el && el._url !== m.url) {
      el.src = m.url;
      el._url = m.url;
      el._target = null;
    }
    if (!el) {
      el = document.createElement(clip.kind === 'audio' ? 'audio' : 'video');
      el.preload = 'auto';
      el.playsInline = true;
      el.src = m.url;
      el._url = m.url;
      el.addEventListener('seeked', () => (E.dirty = true));
      el.addEventListener('loadeddata', () => (E.dirty = true));
      E.els.set(clip.id, el);
      connect(el);
    }
    return el;
  };

  /** 削除されたクリップの要素を解放 */
  E.gc = () => {
    for (const [id, el] of E.els) {
      if (VE.findClip(id)) continue;
      el.pause();
      el.removeAttribute('src');
      el.load();
      const g = E.gains.get(el);
      if (g) g.disconnect();
      E.gains.delete(el);
      E.els.delete(id);
    }
  };

  const seekEl = (el, t) => {
    el._target = t;
    el.currentTime = t;
  };
  function syncEl(el, srcT, playing, tolerance) {
    if (playing) {
      if (el.paused) {
        if (Math.abs(el.currentTime - srcT) > 0.05) seekEl(el, srcT);
        el.play().catch(() => {});
      } else if (Math.abs(el.currentTime - srcT) > tolerance) {
        seekEl(el, srcT);
      }
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - srcT) > 0.0005 && el._target !== srcT) seekEl(el, srcT);
    }
  }

  /* ---------- 再生制御 ---------- */
  E.play = () => {
    const total = VE.totalDuration();
    if (total <= 0) return;
    if (E.t >= total - 0.01) E.t = 0;
    E.ensureAudio();
    E.playing = true;
    E.forceSync = true;
    E.dirty = true;
    VE.bus.emit('playstate', true);
  };
  E.pause = () => {
    E.playing = false;
    for (const el of E.els.values()) if (!el.paused) el.pause();
    E.dirty = true;
    VE.bus.emit('playstate', false);
  };
  E.toggle = () => (E.playing ? E.pause() : E.play());
  E.seek = (t) => {
    E.t = VE.clamp(t, 0, VE.totalDuration());
    E.forceSync = true;
    E.dirty = true;
    VE.bus.emit('time', E.t);
  };
  E.step = (frames) => E.seek(Math.round((E.t + frames / S.settings.fps) * S.settings.fps) / S.settings.fps);

  E.loop = (now) => {
    requestAnimationFrame(E.loop);
    const dt = E.last ? Math.min(0.25, (now - E.last) / 1000) : 0;
    E.last = now;

    if (E.playing) {
      const c = E.activeVideo;
      const el = c && E.els.get(c.id);
      if (el && !el.paused && !el.seeking && el.readyState >= 3 && !E.stalled) {
        // 映像クリップ再生中は映像要素の時刻をマスタークロックにする（音ズレ防止）
        const d = c.start + (el.currentTime - c.in) / c.speed;
        if (Math.abs(d - E.t) < 0.5) E.t = Math.max(E.t, d);
        else E.t += dt;
      } else if (!E.stalled) {
        E.t += dt;
      }
      const total = VE.totalDuration();
      if (E.t >= total) {
        E.t = total;
        E.render(E.t, false);
        E.pause();
        if (E.exporting) E.exporting.finish();
      }
    }

    if (E.playing || E.dirty) {
      E.dirty = false;
      E.stalled = E.render(E.t, E.playing);
      VE.bus.emit('time', E.t);
    }

    if (E.exporting) {
      const rec = E.exporting.rec;
      if (E.stalled && rec.state === 'recording') rec.pause();
      else if (!E.stalled && rec.state === 'paused') rec.resume();
      E.exporting.progress(E.t / Math.max(0.001, VE.totalDuration()));
    }
  };

  /* ---------- 描画 ---------- */
  /** 時刻 t のフレームを描画。読み込み待ちで止まっているなら true を返す */
  E.render = (t, playing) => {
    const ctx = E.ctx;
    const W = E.canvas.width;
    const H = E.canvas.height;
    const active = new Set();
    const tolerance = E.forceSync ? 0.02 : 0.3;
    E.forceSync = false;
    let stalled = false;
    let keepPrev = false;
    let frame = null;

    const vc = VE.clipAt(S.video, t);
    E.activeVideo = vc;
    if (vc) {
      const m = VE.mediaById(vc.mediaId);
      const local = t - vc.start;
      const dur = VE.dur(vc);
      const alpha = VE.fade(local, dur, vc.fadeIn, vc.fadeOut);
      if (m && m.type === 'image' && m.img) {
        frame = { src: m.img, w: m.width, h: m.height, clip: vc, alpha, p: local / dur };
      } else if (m && m.url) {
        const el = E.getEl(vc);
        active.add(el);
        const srcT = Math.min(vc.in + local * vc.speed, vc.out - 0.001);
        if (el.playbackRate !== vc.speed) el.playbackRate = vc.speed;
        el.muted = vc.volume <= 0;
        setVol(el, vc.volume * alpha);
        syncEl(el, srcT, playing, tolerance);
        if (playing && (el.seeking || el.readyState < 3)) stalled = true;
        if (el.readyState >= 2) frame = { src: el, w: el.videoWidth, h: el.videoHeight, clip: vc, alpha, p: local / dur };
        else keepPrev = true;
      }

      // 次の映像クリップを先読み（つなぎ目の停止を減らす）
      if (playing && VE.end(vc) - t < 1.5) {
        const next = S.video[S.video.indexOf(vc) + 1];
        const nm = next && VE.mediaById(next.mediaId);
        if (nm && nm.type === 'video' && nm.url) {
          const nel = E.getEl(next);
          active.add(nel);
          if (!nel.paused) nel.pause();
          if (Math.abs(nel.currentTime - next.in) > 0.05 && nel._target !== next.in) seekEl(nel, next.in);
        }
      }
    }

    for (const ac of S.audio) {
      if (t < ac.start || t >= VE.end(ac)) continue;
      const el = E.getEl(ac);
      if (!el) continue;
      active.add(el);
      const local = t - ac.start;
      setVol(el, ac.volume * VE.fade(local, VE.dur(ac), ac.fadeIn, ac.fadeOut));
      syncEl(el, ac.in + local, playing, tolerance);
    }

    for (const el of E.els.values()) if (!active.has(el) && !el.paused) el.pause();

    if (keepPrev) return stalled;

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.fillStyle = S.settings.bg;
    ctx.fillRect(0, 0, W, H);
    if (frame && frame.w && frame.h) drawFrame(ctx, frame, W, H);
    ctx.restore();
    drawTexts(ctx, t, W, H);
    return stalled;
  };

  function drawFrame(ctx, f, W, H) {
    const c = f.clip;
    ctx.globalAlpha = f.alpha;
    const filters = [];
    if (c.brightness !== 100) filters.push(`brightness(${c.brightness}%)`);
    if (c.contrast !== 100) filters.push(`contrast(${c.contrast}%)`);
    if (c.saturate !== 100) filters.push(`saturate(${c.saturate}%)`);
    ctx.filter = filters.join(' ') || 'none';
    let dw;
    let dh;
    if (c.fit === 'stretch') {
      dw = W;
      dh = H;
    } else {
      const s = c.fit === 'cover' ? Math.max(W / f.w, H / f.h) : Math.min(W / f.w, H / f.h);
      dw = f.w * s;
      dh = f.h * s;
    }
    if (c.kenburns) {
      const k = 1 + 0.12 * VE.clamp(f.p, 0, 1);
      dw *= k;
      dh *= k;
    }
    ctx.drawImage(f.src, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }

  const fontPending = new Set();
  function ensureFont(font, text) {
    if (!document.fonts || document.fonts.check(font, text)) return;
    const key = font + text;
    if (fontPending.has(key)) return;
    fontPending.add(key);
    document.fonts.load(font, text).then(() => {
      E.dirty = true;
    });
  }

  function drawTexts(ctx, t, W, H) {
    E.textBoxes = [];
    for (const c of S.text) {
      if (t < c.start || t >= VE.end(c) || !c.text) continue;
      const local = t - c.start;
      let a = VE.fade(local, c.duration, c.fadeIn, c.fadeOut);
      const fs = (c.size / 100) * H;
      const font = `${c.bold ? 700 : 400} ${fs}px ${c.font}`;
      ensureFont(font, c.text);

      const p = VE.clamp(local / Math.max(0.01, Math.min(0.6, c.duration / 2)), 0, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      let dy = 0;
      let sc = 1;
      let shown = c.text;
      if (c.anim === 'slide') {
        dy = (1 - ease) * fs * 1.2;
        a *= ease;
      } else if (c.anim === 'zoom') {
        sc = 0.6 + 0.4 * ease;
        a *= ease;
      } else if (c.anim === 'type') {
        const chars = [...c.text];
        const n = Math.floor(chars.length * VE.clamp(local / Math.max(0.01, c.duration * 0.6), 0, 1));
        shown = chars.slice(0, n).join('');
      }

      ctx.save();
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = c.text.split('\n');
      const shownLines = shown.split('\n');
      const lh = fs * 1.3;
      const pad = fs * 0.35;
      const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
      const boxH = lines.length * lh + pad;
      const cx = c.x * W;
      const cy = c.y * H;

      ctx.globalAlpha = a;
      ctx.translate(cx, cy + dy);
      ctx.scale(sc, sc);
      if (c.bgOn) {
        ctx.fillStyle = VE.hexToRgba(c.bg, c.bgAlpha);
        ctx.beginPath();
        ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, fs * 0.2);
        ctx.fill();
      }
      ctx.lineJoin = 'round';
      shownLines.forEach((ln, i) => {
        const y = (i - (lines.length - 1) / 2) * lh;
        if (c.strokeWidth > 0) {
          ctx.lineWidth = (fs * c.strokeWidth) / 100 * 2;
          ctx.strokeStyle = c.stroke;
          ctx.strokeText(ln, 0, y);
        }
        ctx.fillStyle = c.color;
        ctx.fillText(ln, 0, y);
      });
      ctx.restore();

      const box = { id: c.id, x: cx - boxW / 2, y: cy - boxH / 2, w: boxW, h: boxH };
      E.textBoxes.push(box);
      if (!E.hideUI && S.sel === c.id) {
        ctx.save();
        ctx.strokeStyle = '#4da3ff';
        ctx.lineWidth = Math.max(2, H / 400);
        ctx.setLineDash([H / 90, H / 140]);
        ctx.strokeRect(box.x, box.y, box.w, box.h);
        ctx.restore();
      }
    }
  }

  /** 現在フレームを PNG で取得（選択枠なし） */
  E.snapshot = () =>
    new Promise((resolve) => {
      E.hideUI = true;
      E.render(E.t, false);
      E.canvas.toBlob((b) => {
        E.hideUI = false;
        E.dirty = true;
        resolve(b);
      }, 'image/png');
    });

  /** プレビュー上の座標にあるテキストクリップ id */
  E.hitText = (x, y) => {
    for (let i = E.textBoxes.length - 1; i >= 0; i--) {
      const b = E.textBoxes[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    }
    return null;
  };
})();
