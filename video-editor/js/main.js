/* 画面の組み立て・ボタン・ショートカット・ドラッグ＆ドロップ */
(() => {
  const VE = window.VE;
  const S = VE.state;
  const E = VE.engine;
  const $ = (id) => document.getElementById(id);

  E.init($('preview'));
  VE.timeline.init($('timeline'));
  VE.bin.init($('media-list'));
  VE.props.init($('props'), $('props-title'));

  /* ---------- 読み込み ---------- */
  const fileInput = $('file-input');
  $('btn-import').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const added = await VE.importFiles([...fileInput.files]);
    fileInput.value = '';
    // タイムラインが空なら最初の素材を自動配置
    if (added.length && !S.video.length && !S.audio.length) {
      for (const m of added) VE.ops.addToTimeline(m);
      VE.timeline.fit();
    }
  };

  // ウィンドウ全体へのファイルドロップ（タイムライン上は timeline.js が処理）
  const overlay = $('drop-overlay');
  let dragDepth = 0;
  const hasFiles = (e) => [...e.dataTransfer.types].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    dragDepth++;
    overlay.classList.add('show');
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    if (--dragDepth <= 0) {
      dragDepth = 0;
      overlay.classList.remove('show');
    }
  });
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener('drop', async (e) => {
    dragDepth = 0;
    overlay.classList.remove('show');
    if (!hasFiles(e)) return;
    e.preventDefault();
    const added = await VE.importFiles([...e.dataTransfer.files]);
    if (added.length && !S.video.length && !S.audio.length) {
      for (const m of added) VE.ops.addToTimeline(m);
      VE.timeline.fit();
    }
  });
  // タイムラインへのドロップでもオーバーレイを消す
  $('timeline').addEventListener('drop', () => {
    dragDepth = 0;
    overlay.classList.remove('show');
  }, true);

  /* ---------- トランスポート ---------- */
  $('btn-play').onclick = () => E.toggle();
  $('btn-start').onclick = () => E.seek(0);
  $('btn-end').onclick = () => E.seek(VE.totalDuration());
  $('btn-back').onclick = () => E.step(-1);
  $('btn-fwd').onclick = () => E.step(1);
  $('btn-snapshot').onclick = async () => {
    const blob = await E.snapshot();
    VE.download(blob, `frame_${VE.fmtTime(E.t).replace(/[:.]/g, '-')}.png`);
  };
  const timecode = $('timecode');
  VE.bus.on('time', (t) => (timecode.textContent = `${VE.fmtTime(t)} / ${VE.fmtTime(VE.totalDuration())}`));
  VE.bus.on('change', () => (timecode.textContent = `${VE.fmtTime(E.t)} / ${VE.fmtTime(VE.totalDuration())}`));
  VE.bus.on('playstate', (p) => {
    $('btn-play').textContent = p ? '❚❚' : '▶';
    document.body.classList.toggle('is-playing', p);
  });

  /* ---------- プレビュー上のテキスト移動 ---------- */
  const canvas = $('preview');
  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
  };
  canvas.addEventListener('pointerdown', (e) => {
    const p = toCanvas(e);
    const id = E.hitText(p.x, p.y);
    if (!id) {
      if (VE.selected() && VE.selected().kind === 'text') VE.select(null);
      return;
    }
    VE.select(id);
    const c = VE.findClip(id);
    const pre = VE.snapshot();
    const ox = c.x;
    const oy = c.y;
    let moved = false;
    const move = (ev) => {
      const q = toCanvas(ev);
      moved = true;
      let nx = VE.clamp(ox + (q.x - p.x) / canvas.width, 0, 1);
      let ny = VE.clamp(oy + (q.y - p.y) / canvas.height, 0, 1);
      if (Math.abs(nx - 0.5) < 0.015) nx = 0.5; // 中央に吸着
      c.x = nx;
      c.y = ny;
      VE.changed({ props: false });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moved) {
        VE.commit(pre);
        VE.changed();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = toCanvas(e);
    canvas.style.cursor = E.hitText(p.x, p.y) ? 'move' : 'default';
  });

  /* ---------- タイムラインツールバー ---------- */
  $('tl-split').onclick = () => VE.ops.split(E.t);
  $('tl-delete').onclick = () => VE.ops.remove();
  $('tl-add-text').onclick = () => VE.ops.addText();
  $('tl-snap').onchange = (e) => (S.snap = e.target.checked);
  const zoom = $('tl-zoom');
  zoom.value = VE.timeline.zoomToSlider(S.zoom);
  zoom.oninput = () => VE.timeline.setZoom(VE.timeline.sliderToZoom(Number(zoom.value)));
  VE.bus.on('zoom', (z) => (zoom.value = VE.timeline.zoomToSlider(z)));
  $('tl-fit').onclick = () => VE.timeline.fit();

  /* ---------- 履歴 ---------- */
  const undoBtn = $('btn-undo');
  const redoBtn = $('btn-redo');
  const syncHistory = () => {
    undoBtn.disabled = !VE.canUndo();
    redoBtn.disabled = !VE.canRedo();
  };
  VE.bus.on('history', syncHistory);
  syncHistory();
  undoBtn.onclick = VE.undo;
  redoBtn.onclick = VE.redo;

  /* ---------- プロジェクト ---------- */
  const isEmpty = () => !S.video.length && !S.text.length && !S.audio.length;
  $('btn-new').onclick = () => {
    if (!isEmpty() && !confirm('現在の編集内容を破棄して新規プロジェクトを作成しますか？')) return;
    E.pause();
    S.video = [];
    S.text = [];
    S.audio = [];
    S.sel = null;
    E.t = 0;
    VE.clearHistory();
    VE.changed();
  };
  const saveProject = () => {
    VE.download(new Blob([VE.serialize()], { type: 'application/json' }), 'project.tkfm.json');
    VE.toast('プロジェクトを保存しました（素材ファイル本体は含まれません）');
  };
  $('btn-save').onclick = saveProject;
  const projInput = $('project-input');
  $('btn-open').onclick = () => projInput.click();
  projInput.onchange = async () => {
    const f = projInput.files[0];
    projInput.value = '';
    if (!f) return;
    if (!isEmpty() && !confirm('現在の編集内容を破棄してプロジェクトを開きますか？')) return;
    try {
      E.pause();
      E.t = 0;
      const missing = VE.loadProject(await f.text());
      VE.timeline.fit();
      VE.toast(missing ? `${missing} 件の素材が未リンクです。同じファイルを読み込むと再リンクされます` : 'プロジェクトを開きました', 5000);
    } catch (e) {
      VE.toast(`開けませんでした：${e.message}`, 4000);
    }
  };
  window.addEventListener('beforeunload', (e) => {
    if (!isEmpty()) e.preventDefault();
  });

  /* ---------- 書き出し ---------- */
  const dlg = $('export-dialog');
  const fmtSel = $('ex-format');
  const setupBox = dlg.querySelector('.export-setup');
  const progBox = dlg.querySelector('.export-progress');
  const startBtn = $('ex-start');
  const cancelBtn = $('ex-cancel');
  let lastBlob = null;

  $('btn-export').onclick = () => {
    if (VE.totalDuration() <= 0) return VE.toast('タイムラインにクリップを追加してください');
    const formats = VE.exporter.formats();
    if (!formats.length) return VE.toast('このブラウザは動画の書き出しに対応していません（Chrome / Edge を推奨）', 5000);
    fmtSel.replaceChildren(...formats.map(([mime, label, ext]) => VE.h('option', { value: mime, 'data-ext': ext }, label)));
    $('ex-summary').textContent = `${S.settings.width}×${S.settings.height} / ${S.settings.fps}fps / 長さ ${VE.fmtTime(VE.totalDuration())}（書き出しにも同じ時間がかかります）`;
    setupBox.hidden = false;
    progBox.hidden = true;
    startBtn.hidden = false;
    startBtn.textContent = '書き出し開始';
    cancelBtn.textContent = '閉じる';
    lastBlob = null;
    dlg.showModal();
  };

  startBtn.onclick = async () => {
    if (lastBlob) {
      VE.download(lastBlob.blob, lastBlob.name);
      return;
    }
    const opt = fmtSel.selectedOptions[0];
    const ext = opt.dataset.ext;
    setupBox.hidden = true;
    progBox.hidden = false;
    startBtn.hidden = true;
    cancelBtn.textContent = '中止';
    const fill = $('ex-fill');
    const status = $('ex-status');
    try {
      const blob = await VE.exporter.run({
        mime: fmtSel.value,
        bitrate: Number($('ex-quality').value),
        monitor: $('ex-monitor').checked,
        onProgress: (p) => {
          fill.style.width = `${Math.round(p * 100)}%`;
          status.textContent = `書き出し中… ${Math.round(p * 100)}%（${VE.fmtTime(E.t)} / ${VE.fmtTime(VE.totalDuration())}）`;
        },
      });
      const name = `video_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.${ext}`;
      lastBlob = { blob, name };
      VE.download(blob, name);
      status.textContent = `完了しました（${(blob.size / 1024 / 1024).toFixed(1)} MB）。ダウンロードが始まらない場合は「再ダウンロード」を押してください。`;
      startBtn.hidden = false;
      startBtn.textContent = '再ダウンロード';
      cancelBtn.textContent = '閉じる';
    } catch (e) {
      if (e.message === 'cancelled') {
        status.textContent = '中止しました';
      } else {
        console.error(e);
        status.textContent = `書き出しに失敗しました：${e.message}`;
      }
      cancelBtn.textContent = '閉じる';
    }
  };
  cancelBtn.onclick = () => {
    if (E.exporting) VE.exporter.cancel();
    else dlg.close();
  };
  dlg.addEventListener('cancel', (e) => {
    if (E.exporting) e.preventDefault();
  });

  /* ---------- キーボード ---------- */
  window.addEventListener('keydown', (e) => {
    if (VE.isTyping(e) || dlg.open) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (mod && k.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? VE.redo() : VE.undo();
    } else if (mod && k.toLowerCase() === 'y') {
      e.preventDefault();
      VE.redo();
    } else if (mod && k.toLowerCase() === 's') {
      e.preventDefault();
      saveProject();
    } else if (mod && k.toLowerCase() === 'd') {
      e.preventDefault();
      VE.ops.duplicate();
    } else if (mod) {
      return;
    } else if (k === ' ') {
      e.preventDefault();
      E.toggle();
    } else if (k === 's' || k === 'S') {
      VE.ops.split(E.t);
    } else if (k === 't' || k === 'T') {
      VE.ops.addText();
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      VE.ops.remove();
    } else if (k === 'ArrowLeft') {
      e.preventDefault();
      e.shiftKey ? E.seek(E.t - 1) : E.step(-1);
    } else if (k === 'ArrowRight') {
      e.preventDefault();
      e.shiftKey ? E.seek(E.t + 1) : E.step(1);
    } else if (k === 'Home') {
      E.seek(0);
    } else if (k === 'End') {
      E.seek(VE.totalDuration());
    } else if (k === 'Escape') {
      VE.select(null);
    } else if (k === '+' || k === '=') {
      VE.timeline.zoomAt(1.25);
    } else if (k === '-') {
      VE.timeline.zoomAt(0.8);
    }
  });

  // デバッグ・自動テスト用
  window.__VE = VE;
})();
