/* プロジェクト状態・履歴・編集操作 */
(() => {
  const VE = window.VE;

  const S = (VE.state = {
    settings: { width: 1920, height: 1080, fps: 30, bg: '#000000' },
    media: [], // 読み込んだ素材（履歴の対象外）
    video: [], // 映像トラック：前詰めで連続再生
    text: [], // テキストトラック：自由配置
    audio: [], // 音声トラック：自由配置
    sel: null, // 選択中クリップ id
    zoom: 50, // px / 秒
    snap: true,
  });

  VE.FONTS = [
    ['"Noto Sans JP", sans-serif', 'ゴシック (Noto Sans JP)'],
    ['"Noto Serif JP", serif', '明朝 (Noto Serif JP)'],
    ['"M PLUS Rounded 1c", sans-serif', '丸ゴシック (M PLUS Rounded)'],
    ['"Zen Maru Gothic", sans-serif', 'やさしい丸 (Zen Maru Gothic)'],
    ['"Dela Gothic One", sans-serif', '極太 (Dela Gothic One)'],
  ];

  VE.mediaById = (id) => S.media.find((m) => m.id === id);
  VE.dur = (c) => (c.kind === 'text' ? c.duration : (c.out - c.in) / (c.speed || 1));
  VE.end = (c) => c.start + VE.dur(c);
  VE.layout = () => {
    let t = 0;
    for (const c of S.video) {
      c.start = t;
      t += VE.dur(c);
    }
  };
  VE.totalDuration = () =>
    Math.max(0, ...S.video.map(VE.end), ...S.text.map(VE.end), ...S.audio.map(VE.end));
  VE.findClip = (id) => {
    for (const k of ['video', 'text', 'audio']) {
      const c = S[k].find((x) => x.id === id);
      if (c) return c;
    }
    return null;
  };
  VE.selected = () => (S.sel ? VE.findClip(S.sel) : null);
  VE.clipAt = (list, t) => list.find((c) => t >= c.start && t < VE.end(c)) || null;

  /* ---------- 履歴 ---------- */
  const H = { undo: [], redo: [], max: 200 };
  VE.snapshot = () =>
    JSON.stringify({ settings: S.settings, video: S.video, text: S.text, audio: S.audio, sel: S.sel });
  const restore = (json) => {
    const o = JSON.parse(json);
    Object.assign(S, o);
    if (S.sel && !VE.findClip(S.sel)) S.sel = null;
    VE.changed();
  };
  /** 変更前のスナップショットを履歴に積む */
  VE.commit = (pre = VE.snapshot()) => {
    H.undo.push(pre);
    if (H.undo.length > H.max) H.undo.shift();
    H.redo.length = 0;
    VE.bus.emit('history');
  };
  VE.undo = () => {
    if (!H.undo.length) return;
    H.redo.push(VE.snapshot());
    restore(H.undo.pop());
    VE.bus.emit('history');
  };
  VE.redo = () => {
    if (!H.redo.length) return;
    H.undo.push(VE.snapshot());
    restore(H.redo.pop());
    VE.bus.emit('history');
  };
  VE.canUndo = () => H.undo.length > 0;
  VE.canRedo = () => H.redo.length > 0;
  VE.clearHistory = () => {
    H.undo.length = 0;
    H.redo.length = 0;
    VE.bus.emit('history');
  };

  /** 状態変更の通知。props:false はプロパティパネルを再描画しない（入力中のフォーカス維持） */
  VE.changed = (opts = {}) => {
    VE.layout();
    VE.bus.emit('change', opts);
  };
  VE.select = (id) => {
    if (S.sel === id) return;
    S.sel = id;
    VE.changed();
  };

  /* ---------- クリップ生成 ---------- */
  const newVideoClip = (m) => ({
    id: VE.uid(), kind: 'video', mediaId: m.id, start: 0,
    in: 0, out: m.type === 'image' ? 5 : m.duration,
    speed: 1, volume: 1, fadeIn: 0, fadeOut: 0,
    brightness: 100, contrast: 100, saturate: 100,
    fit: 'contain', kenburns: false,
  });
  const newAudioClip = (m, start) => ({
    id: VE.uid(), kind: 'audio', mediaId: m.id, start: Math.max(0, start),
    in: 0, out: m.duration, volume: 1, fadeIn: 0, fadeOut: 0,
  });
  const newTextClip = (start) => ({
    id: VE.uid(), kind: 'text', text: 'テキストを入力', start: Math.max(0, start), duration: 3,
    x: 0.5, y: 0.85, size: 7, font: VE.FONTS[0][0], color: '#ffffff', bold: true,
    stroke: '#000000', strokeWidth: 12, bgOn: false, bg: '#000000', bgAlpha: 0.5,
    anim: 'none', fadeIn: 0.3, fadeOut: 0.3,
  });

  /* ---------- 編集操作 ---------- */
  const ops = (VE.ops = {});

  /** 映像トラックに挿入（index 省略で末尾） */
  ops.insertVideo = (m, index = S.video.length) => {
    if (!m.url) return VE.toast('素材がリンクされていません');
    VE.commit();
    const c = newVideoClip(m);
    S.video.splice(VE.clamp(index, 0, S.video.length), 0, c);
    S.sel = c.id;
    VE.changed();
    return c;
  };

  ops.addAudio = (m, start = 0) => {
    if (!m.url) return VE.toast('素材がリンクされていません');
    VE.commit();
    const c = newAudioClip(m, start);
    S.audio.push(c);
    S.sel = c.id;
    VE.changed();
    return c;
  };

  /** 素材を種類に応じたトラックへ追加 */
  ops.addToTimeline = (m) => {
    if (m.type === 'audio') return ops.addAudio(m, VE.engine ? VE.engine.t : 0);
    return ops.insertVideo(m);
  };

  ops.addText = (start) => {
    VE.commit();
    const c = newTextClip(start ?? VE.engine.t);
    S.text.push(c);
    S.sel = c.id;
    VE.changed();
    return c;
  };

  /** 時刻 t で分割。選択中クリップが t を含まなければ映像トラックのクリップを対象にする */
  ops.split = (t) => {
    let c = VE.selected();
    if (!c || t <= c.start || t >= VE.end(c)) c = VE.clipAt(S.video, t);
    if (!c) return VE.toast('再生ヘッドの位置に分割できるクリップがありません');
    const local = t - c.start;
    const dur = VE.dur(c);
    if (local < 0.05 || dur - local < 0.05) return VE.toast('クリップの端では分割できません');
    VE.commit();
    const b = { ...c, id: VE.uid() };
    if (c.kind === 'text') {
      c.duration = local;
      b.start = t;
      b.duration = dur - local;
    } else {
      const cut = c.in + local * (c.speed || 1);
      c.out = cut;
      b.in = cut;
      if (c.kind === 'audio') b.start = t;
    }
    c.fadeOut = 0;
    b.fadeIn = 0;
    const list = S[c.kind];
    list.splice(list.indexOf(c) + 1, 0, b);
    S.sel = b.id;
    VE.changed();
  };

  ops.remove = (id = S.sel) => {
    const c = id && VE.findClip(id);
    if (!c) return;
    VE.commit();
    S[c.kind].splice(S[c.kind].indexOf(c), 1);
    if (S.sel === id) S.sel = null;
    VE.changed();
  };

  ops.duplicate = (id = S.sel) => {
    const c = id && VE.findClip(id);
    if (!c) return;
    VE.commit();
    const d = { ...c, id: VE.uid() };
    if (c.kind !== 'video') d.start = VE.end(c);
    const list = S[c.kind];
    list.splice(list.indexOf(c) + 1, 0, d);
    S.sel = d.id;
    VE.changed();
  };

  /** 素材の削除（使用中クリップも削除） */
  ops.removeMedia = (mediaId) => {
    const used = [...S.video, ...S.audio].some((c) => c.mediaId === mediaId);
    if (used && !confirm('この素材はタイムラインで使用中です。クリップごと削除しますか？')) return;
    if (used) VE.commit();
    S.video = S.video.filter((c) => c.mediaId !== mediaId);
    S.audio = S.audio.filter((c) => c.mediaId !== mediaId);
    const m = VE.mediaById(mediaId);
    if (m && m.url) URL.revokeObjectURL(m.url);
    S.media = S.media.filter((x) => x.id !== mediaId);
    if (S.sel && !VE.findClip(S.sel)) S.sel = null;
    VE.bus.emit('media');
    VE.changed();
  };

  /* ---------- 保存・読み込み ---------- */
  VE.serialize = () =>
    JSON.stringify(
      {
        app: 'tkfm-video-editor',
        version: 1,
        settings: S.settings,
        media: S.media.map(({ id, name, type, duration, width, height }) => ({ id, name, type, duration, width, height })),
        video: S.video,
        text: S.text,
        audio: S.audio,
      },
      null,
      2,
    );

  VE.loadProject = (json) => {
    const o = JSON.parse(json);
    if (o.app !== 'tkfm-video-editor') throw new Error('このエディタのプロジェクトファイルではありません');
    // 同名・同種の読み込み済み素材があれば自動で再リンク
    S.media = o.media.map((fm) => {
      const ex = S.media.find((x) => x.url && x.name === fm.name && x.type === fm.type);
      return ex ? { ...ex, id: fm.id } : { ...fm, url: null };
    });
    S.settings = o.settings;
    S.video = o.video;
    S.text = o.text;
    S.audio = o.audio;
    S.sel = null;
    VE.clearHistory();
    VE.bus.emit('media');
    VE.changed();
    return S.media.filter((m) => !m.url).length;
  };
})();
