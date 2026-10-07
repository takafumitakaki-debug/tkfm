/* タイムライン UI：表示・選択・移動・トリム・並べ替え・シーク */
(() => {
  const VE = window.VE;
  const S = VE.state;
  const h = VE.h;
  const T = (VE.timeline = {});

  let scroll, inner, ruler, playhead, marker;
  const tracks = {};
  const px = (s) => s * S.zoom;
  const sec = (p) => p / S.zoom;
  const ZMIN = 5;
  const ZMAX = 400;

  T.init = (root) => {
    scroll = root.querySelector('.tl-scroll');
    inner = root.querySelector('.tl-inner');
    ruler = root.querySelector('.tl-ruler');
    playhead = root.querySelector('.tl-playhead');
    marker = root.querySelector('.tl-marker');
    root.querySelectorAll('.tl-track').forEach((el) => (tracks[el.dataset.track] = el));

    VE.bus.on('change', T.render);
    VE.bus.on('time', T.updatePlayhead);

    ruler.addEventListener('pointerdown', startScrub);
    playhead.addEventListener('pointerdown', startScrub);
    for (const [k, el] of Object.entries(tracks)) {
      el.addEventListener('pointerdown', (e) => {
        if (e.target !== el || e.button !== 0) return;
        VE.select(null);
        startScrub(e);
      });
      el.addEventListener('dragover', (e) => onDragOver(e, k));
      el.addEventListener('dragleave', () => (marker.style.display = 'none'));
      el.addEventListener('drop', (e) => onDrop(e, k));
    }
    scroll.addEventListener(
      'wheel',
      (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        T.zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX);
      },
      { passive: false },
    );
    new ResizeObserver(() => T.render()).observe(scroll);
    T.render();
  };

  const xToTime = (clientX) => Math.max(0, sec(clientX - inner.getBoundingClientRect().left));

  /* ---------- ズーム ---------- */
  T.setZoom = (z, anchorClientX) => {
    const rect = scroll.getBoundingClientRect();
    const ax = anchorClientX != null ? anchorClientX - rect.left : rect.width / 2;
    const tAt = sec(scroll.scrollLeft + ax);
    S.zoom = VE.clamp(z, ZMIN, ZMAX);
    T.render();
    scroll.scrollLeft = px(tAt) - ax;
    VE.bus.emit('zoom', S.zoom);
  };
  T.zoomAt = (factor, clientX) => T.setZoom(S.zoom * factor, clientX);
  T.fit = () => {
    const total = VE.totalDuration();
    T.setZoom(total > 0 ? (scroll.clientWidth - 40) / total : 50);
    scroll.scrollLeft = 0;
  };
  T.zoomToSlider = (z) => (Math.log(z / ZMIN) / Math.log(ZMAX / ZMIN)) * 100;
  T.sliderToZoom = (v) => ZMIN * Math.pow(ZMAX / ZMIN, v / 100);

  /* ---------- 描画 ---------- */
  T.render = () => {
    if (!scroll) return;
    const total = VE.totalDuration();
    const w = Math.max(scroll.clientWidth, px(total + 20));
    inner.style.width = w + 'px';
    renderRuler(w);
    for (const k of ['video', 'text', 'audio']) tracks[k].replaceChildren(...S[k].map((c) => clipEl(c, k)));
    T.updatePlayhead();
  };

  function renderRuler(w) {
    const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const step = steps.find((s) => px(s) >= 70) || 600;
    const frag = document.createDocumentFragment();
    const end = sec(w);
    for (let t = 0; t <= end; t += step) {
      const label = step < 1 ? VE.fmtTime(t) : VE.fmtTime(t, false);
      frag.append(h('div', { class: 'tick', style: { left: px(t) + 'px' } }, label));
    }
    ruler.replaceChildren(frag);
    ruler.style.backgroundSize = `${px(step) / 5}px 100%`;
  }

  function clipEl(c, k) {
    const m = c.mediaId ? VE.mediaById(c.mediaId) : null;
    const d = VE.dur(c);
    const cls = ['clip', `clip-${k}`];
    if (S.sel === c.id) cls.push('selected');
    if (m && !m.url) cls.push('missing');
    const el = h('div', {
      class: cls.join(' '),
      style: { left: px(c.start) + 'px', width: Math.max(4, px(d)) + 'px' },
      title: `${k === 'text' ? c.text : m ? m.name : ''}  (${VE.fmtTime(d)})`,
    });
    el.dataset.id = c.id;

    if (k === 'video') {
      if (m && m.thumb) el.style.backgroundImage = `url(${m.thumb})`;
      const badges = [];
      if (m && m.type === 'image') badges.push('静止画');
      if (c.speed !== 1) badges.push(`×${c.speed}`);
      if (c.volume === 0 && m && m.type === 'video') badges.push('ミュート');
      el.append(h('div', { class: 'clip-label' }, m ? m.name : '(不明)', badges.map((b) => h('span', { class: 'badge' }, b))));
    } else if (k === 'text') {
      el.append(h('div', { class: 'clip-label' }, 'T  ', c.text.replace(/\n/g, ' ')));
    } else {
      if (m && m.peaks) el.append(waveform(c, m, px(d)));
      el.append(h('div', { class: 'clip-label' }, '♪ ', m ? m.name : '(不明)'));
    }
    if (c.fadeIn > 0) el.append(h('div', { class: 'fade fade-in', style: { width: px(c.fadeIn) + 'px' } }));
    if (c.fadeOut > 0) el.append(h('div', { class: 'fade fade-out', style: { width: px(c.fadeOut) + 'px' } }));
    el.append(h('div', { class: 'handle h-l' }), h('div', { class: 'handle h-r' }));
    el.addEventListener('pointerdown', (e) => onClipDown(e, c, k));
    el.addEventListener('dblclick', () => VE.engine.seek(c.start));
    return el;
  }

  function waveform(c, m, width) {
    const cw = Math.max(1, Math.min(4000, Math.round(width)));
    const ch = 40;
    const cv = h('canvas', { class: 'wave', width: cw, height: ch });
    const g = cv.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.55)';
    const span = c.out - c.in;
    for (let x = 0; x < cw; x++) {
      const t0 = c.in + (x / cw) * span;
      const t1 = c.in + ((x + 1) / cw) * span;
      let v = 0;
      for (let i = Math.floor(t0 * m.pps); i <= Math.floor(t1 * m.pps); i++) v = Math.max(v, m.peaks[i] || 0);
      const hh = Math.max(1, v * ch * c.volume);
      g.fillRect(x, (ch - hh) / 2, 1, hh);
    }
    return cv;
  }

  T.updatePlayhead = () => {
    if (!playhead) return;
    const x = px(VE.engine.t);
    playhead.style.transform = `translateX(${x}px)`;
    if (VE.engine.playing) {
      const right = scroll.scrollLeft + scroll.clientWidth;
      if (x > right - 40 || x < scroll.scrollLeft) scroll.scrollLeft = x - 40;
    }
  };

  /* ---------- シーク ---------- */
  function startScrub(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    VE.engine.seek(xToTime(e.clientX));
    const move = (ev) => VE.engine.seek(xToTime(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /* ---------- スナップ ---------- */
  function snapPoints(exceptId) {
    const pts = [0, VE.engine.t];
    for (const k of ['video', 'text', 'audio'])
      for (const c of S[k]) if (c.id !== exceptId) pts.push(c.start, VE.end(c));
    return pts;
  }
  /** t に最も近いスナップ点との差（なければ null） */
  function snapDelta(t, pts) {
    if (!S.snap) return null;
    let best = null;
    let bd = sec(8);
    for (const p of pts) {
      const d = Math.abs(p - t);
      if (d < bd) {
        bd = d;
        best = p - t;
      }
    }
    return best;
  }
  const snapTo = (t, pts) => t + (snapDelta(t, pts) ?? 0);

  /* ---------- クリップ操作 ---------- */
  function onClipDown(e, c, k) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const mode = e.target.classList.contains('h-l') ? 'l' : e.target.classList.contains('h-r') ? 'r' : 'move';
    VE.select(c.id);

    const m = c.mediaId ? VE.mediaById(c.mediaId) : null;
    const isImage = m && m.type === 'image';
    const mediaDur = m ? m.duration : Infinity;
    const orig = { ...c, end: VE.end(c), dur: VE.dur(c) };
    const pts = snapPoints(c.id);
    const pre = VE.snapshot();
    const x0 = e.clientX;
    let moved = false;
    let liveEl = null;
    let insertIdx = -1;

    const move = (ev) => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true;
      const ds = sec(dx);

      if (k === 'video' && mode === 'move') {
        // 並べ替え：ゴーストを動かし挿入位置を表示
        liveEl ||= tracks.video.querySelector(`[data-id="${c.id}"]`);
        liveEl.classList.add('dragging');
        liveEl.style.transform = `translateX(${dx}px)`;
        const center = orig.start + ds + orig.dur / 2;
        const others = S.video.filter((x) => x !== c);
        let acc = 0;
        insertIdx = 0;
        for (const o of others) {
          if (acc + VE.dur(o) / 2 < center) insertIdx++;
          acc += VE.dur(o);
        }
        const at = insertIdx < others.length ? others[insertIdx].start : VE.end(others[others.length - 1] || { start: 0, kind: 'text', duration: 0 });
        showMarker('video', at);
        return;
      }

      if (k === 'video') {
        if (mode === 'l') {
          if (isImage) c.out = VE.clamp(orig.out - ds, 0.2, 3600);
          else c.in = VE.clamp(orig.in + ds * orig.speed, 0, orig.out - 0.1);
        } else {
          if (isImage) c.out = VE.clamp(orig.out + ds, 0.2, 3600);
          else c.out = VE.clamp(orig.out + ds * orig.speed, orig.in + 0.1, mediaDur);
        }
      } else if (mode === 'move') {
        let s = orig.start + ds;
        const a = snapDelta(s, pts);
        const b = snapDelta(s + orig.dur, pts);
        if (a != null && (b == null || Math.abs(a) <= Math.abs(b))) s += a;
        else if (b != null) s += b;
        c.start = Math.max(0, s);
      } else if (k === 'text') {
        if (mode === 'l') {
          const s = VE.clamp(snapTo(orig.start + ds, pts), 0, orig.end - 0.1);
          c.start = s;
          c.duration = orig.end - s;
        } else {
          c.duration = Math.max(0.1, snapTo(orig.end + ds, pts) - orig.start);
        }
      } else if (k === 'audio') {
        if (mode === 'l') {
          const s = VE.clamp(snapTo(orig.start + ds, pts), Math.max(0, orig.start - orig.in), orig.end - 0.1);
          c.in = orig.in + (s - orig.start);
          c.start = s;
        } else {
          const end = snapTo(orig.end + ds, pts);
          c.out = VE.clamp(orig.out + (end - orig.end), orig.in + 0.1, mediaDur);
        }
      }
      VE.changed();
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      marker.style.display = 'none';
      if (!moved) return;
      if (k === 'video' && mode === 'move') {
        const from = S.video.indexOf(c);
        S.video.splice(from, 1);
        S.video.splice(insertIdx, 0, c);
        if (from === insertIdx) return VE.changed();
      }
      VE.commit(pre);
      VE.changed();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function showMarker(track, t) {
    const tr = tracks[track];
    marker.style.display = 'block';
    marker.style.top = tr.offsetTop + 'px';
    marker.style.height = tr.offsetHeight + 'px';
    marker.style.transform = `translateX(${px(t)}px)`;
  }

  /* ---------- 素材ビンからのドロップ ---------- */
  const MEDIA_MIME = 'application/x-ve-media';
  function videoInsertIndex(t) {
    let i = 0;
    for (const c of S.video) if (c.start + VE.dur(c) / 2 < t) i++;
    return i;
  }
  function onDragOver(e, k) {
    const types = [...e.dataTransfer.types];
    if (!types.includes(MEDIA_MIME) && !types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    const t = xToTime(e.clientX);
    if (k === 'video') {
      const i = videoInsertIndex(t);
      showMarker('video', i < S.video.length ? S.video[i].start : S.video.length ? VE.end(S.video[S.video.length - 1]) : 0);
    } else showMarker(k, t);
  }
  async function onDrop(e, k) {
    e.preventDefault();
    e.stopPropagation();
    marker.style.display = 'none';
    const t = xToTime(e.clientX);
    let list;
    const id = e.dataTransfer.getData(MEDIA_MIME);
    if (id) list = [VE.mediaById(id)].filter(Boolean);
    else if (e.dataTransfer.files.length) list = await VE.importFiles([...e.dataTransfer.files]);
    else return;
    let idx = videoInsertIndex(t);
    let at = t;
    for (const m of list) {
      if (k === 'text') {
        VE.toast('テキストトラックには「テキスト追加」を使ってください');
        return;
      }
      if (k === 'video') {
        if (m.type === 'audio') {
          VE.ops.addAudio(m, at);
          at += m.duration;
        } else VE.ops.insertVideo(m, idx++);
      } else if (m.type === 'image') {
        VE.toast('静止画は映像トラックに配置してください');
      } else {
        VE.ops.addAudio(m, at);
        at += m.duration;
      }
    }
  }
  T.MEDIA_MIME = MEDIA_MIME;
})();
