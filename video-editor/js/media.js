/* 素材の読み込み（メタデータ・サムネイル・波形） */
(() => {
  const VE = window.VE;
  const S = VE.state;

  const EXT = {
    video: ['mp4', 'mov', 'webm', 'mkv', 'm4v', 'ogv'],
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'],
    audio: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'opus'],
  };
  const kindOf = (f) => {
    for (const k of ['video', 'image', 'audio']) if (f.type.startsWith(k + '/')) return k;
    const ext = f.name.split('.').pop().toLowerCase();
    for (const [k, list] of Object.entries(EXT)) if (list.includes(ext)) return k;
    return null;
  };

  const THUMB_W = 160;
  const makeThumb = (src, w, h) => {
    const c = document.createElement('canvas');
    c.width = THUMB_W;
    c.height = Math.max(1, Math.round((THUMB_W * h) / w)) || 90;
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.75);
  };

  async function probeVideo(url) {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    v.src = url;
    await VE.once(v, 'loadedmetadata');
    let duration = v.duration;
    if (!isFinite(duration)) {
      // MediaRecorder 由来の WebM などは duration が Infinity になるため末尾へシークして取得
      v.currentTime = 1e9;
      await VE.once(v, 'seeked').catch(() => {});
      duration = v.duration;
      if (!isFinite(duration)) duration = v.currentTime || 10;
    }
    const info = { duration, width: v.videoWidth, height: v.videoHeight, thumb: null };
    try {
      v.currentTime = Math.min(1, duration * 0.1);
      await VE.once(v, 'seeked');
      if (v.videoWidth) info.thumb = makeThumb(v, v.videoWidth, v.videoHeight);
    } catch { /* サムネイルなしで続行 */ }
    v.removeAttribute('src');
    v.load();
    if (!info.width) throw new Error('映像トラックがありません');
    return info;
  }

  async function probeAudio(url) {
    const a = document.createElement('audio');
    a.preload = 'metadata';
    a.src = url;
    await VE.once(a, 'loadedmetadata');
    const d = a.duration;
    a.removeAttribute('src');
    a.load();
    return isFinite(d) ? d : 0;
  }

  async function loadImage(url) {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  }

  /** 波形ピーク（1 秒あたり 50 サンプル） */
  async function computePeaks(file) {
    if (file.size > 300 * 1024 * 1024) return null;
    const buf = await file.arrayBuffer();
    const ac = new OfflineAudioContext(1, 1, 44100);
    const audio = await ac.decodeAudioData(buf);
    const pps = 50;
    const n = Math.max(1, Math.ceil(audio.duration * pps));
    const per = Math.max(1, Math.floor(audio.length / n));
    const chans = [];
    for (let i = 0; i < audio.numberOfChannels; i++) chans.push(audio.getChannelData(i));
    const peaks = new Array(n);
    for (let i = 0; i < n; i++) {
      let max = 0;
      const s = i * per;
      const e = Math.min(audio.length, s + per);
      for (const ch of chans) {
        for (let j = s; j < e; j += 4) {
          const v = Math.abs(ch[j]);
          if (v > max) max = v;
        }
      }
      peaks[i] = Math.round(max * 1000) / 1000;
    }
    return { peaks, pps: n / audio.duration, duration: audio.duration };
  }

  async function importOne(file) {
    const type = kindOf(file);
    if (!type) throw new Error('未対応の形式です');
    const url = URL.createObjectURL(file);
    try {
      let m = S.media.find((x) => !x.url && x.name === file.name && x.type === type);
      const relinked = !!m;
      if (!m) m = { id: VE.uid(), name: file.name, type };

      if (type === 'video') {
        Object.assign(m, await probeVideo(url));
      } else if (type === 'image') {
        const img = await loadImage(url);
        Object.assign(m, { img, width: img.naturalWidth, height: img.naturalHeight, duration: 3600 });
        m.thumb = makeThumb(img, img.naturalWidth, img.naturalHeight);
      } else {
        m.duration = await probeAudio(url);
      }
      m.url = url;

      if (type !== 'image') {
        computePeaks(file)
          .then((w) => {
            if (!w) return;
            m.peaks = w.peaks;
            m.pps = w.pps;
            if (type === 'audio' && !m.duration) m.duration = w.duration;
            VE.changed({ props: false });
          })
          .catch(() => { /* 音声なし・デコード不可 */ });
      }
      if (!relinked) S.media.push(m);
      return { media: m, relinked };
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
  }

  /** ファイル群を読み込み、読み込めた素材を返す */
  VE.importFiles = async (files) => {
    const added = [];
    let relinked = 0;
    for (const f of files) {
      try {
        const r = await importOne(f);
        added.push(r.media);
        if (r.relinked) relinked++;
      } catch (e) {
        console.warn(e);
        VE.toast(`「${f.name}」を読み込めませんでした（${e.message}）`, 4000);
      }
    }
    VE.bus.emit('media');
    if (relinked) {
      VE.toast(`${relinked} 件の素材を再リンクしました`);
      VE.changed();
    }
    return added;
  };
})();
