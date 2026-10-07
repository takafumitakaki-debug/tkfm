/* 動画の書き出し：canvas と WebAudio のストリームを MediaRecorder で録画する（実時間） */
(() => {
  const VE = window.VE;
  const S = VE.state;

  const X = (VE.exporter = {});

  const CANDIDATES = [
    ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'MP4（H.264 / AAC）', 'mp4'],
    ['video/mp4;codecs=avc1,opus', 'MP4（H.264 / Opus）', 'mp4'],
    ['video/mp4', 'MP4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'WebM（VP9 / Opus）', 'webm'],
    ['video/webm;codecs=vp8,opus', 'WebM（VP8 / Opus）', 'webm'],
    ['video/webm', 'WebM', 'webm'],
  ];

  X.formats = () =>
    window.MediaRecorder ? CANDIDATES.filter(([mime]) => MediaRecorder.isTypeSupported(mime)) : [];

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /** 書き出し実行。完了で Blob を返す */
  X.run = async ({ mime, bitrate, monitor = false, onProgress = () => {} }) => {
    const E = VE.engine;
    const total = VE.totalDuration();
    if (total <= 0) throw new Error('タイムラインが空です');
    if (E.exporting) throw new Error('書き出し中です');

    E.pause();
    E.ensureAudio();
    await E.ac.resume();
    E.monitor.gain.value = monitor ? 1 : 0;
    E.hideUI = true;
    E.seek(0);

    // 先頭フレームの読み込みを待つ
    for (let i = 0; i < 50; i++) {
      await wait(60);
      const c = E.activeVideo;
      const el = c && E.els.get(c.id);
      if (!el || (!el.seeking && el.readyState >= 2)) break;
    }

    const vTrack = E.canvas.captureStream(S.settings.fps).getVideoTracks()[0];
    const stream = new MediaStream([vTrack, ...E.dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: bitrate,
      audioBitsPerSecond: 192_000,
    });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    return new Promise((resolve, reject) => {
      let cancelled = false;
      const cleanup = () => {
        E.exporting = null;
        E.hideUI = false;
        E.monitor.gain.value = 1;
        E.dirty = true;
        vTrack.stop();
      };
      rec.onstop = () => {
        cleanup();
        if (cancelled) reject(new Error('cancelled'));
        else resolve(new Blob(chunks, { type: mime.split(';')[0] }));
      };
      rec.onerror = (e) => {
        cleanup();
        reject(e.error || new Error('録画エラー'));
      };
      E.exporting = {
        rec,
        progress: onProgress,
        finish: () => {
          onProgress(1);
          setTimeout(() => rec.state !== 'inactive' && rec.stop(), 120);
        },
        cancel: () => {
          cancelled = true;
          E.pause();
          if (rec.state !== 'inactive') rec.stop();
        },
      };
      rec.start(500);
      E.play();
    });
  };

  X.cancel = () => VE.engine.exporting && VE.engine.exporting.cancel();
})();
