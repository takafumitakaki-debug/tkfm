/* 素材ビン・プロパティパネル */
(() => {
  const VE = window.VE;
  const S = VE.state;
  const h = VE.h;

  /* ================= 素材ビン ================= */
  const bin = (VE.bin = {});
  bin.init = (listEl) => {
    bin.el = listEl;
    VE.bus.on('media', bin.render);
    bin.render();
  };
  bin.render = () => {
    const el = bin.el;
    if (!S.media.length) {
      el.replaceChildren(
        h('div', { class: 'empty' }, '動画・画像・音声ファイルを', h('br'), 'ここにドラッグ＆ドロップ', h('br'), h('small', {}, '（または「＋読み込み」）')),
      );
      return;
    }
    el.replaceChildren(
      ...S.media.map((m) => {
        const icon = { video: '🎬', image: '🖼', audio: '♪' }[m.type];
        return h(
          'div',
          {
            class: 'media' + (m.url ? '' : ' missing'),
            draggable: !!m.url,
            title: m.url ? `${m.name}\nダブルクリックでタイムラインに追加` : `${m.name}\n未リンク：同名ファイルを読み込むと再リンクされます`,
            ondragstart: (e) => {
              e.dataTransfer.setData(VE.timeline.MEDIA_MIME, m.id);
              e.dataTransfer.effectAllowed = 'copy';
            },
            ondblclick: () => VE.ops.addToTimeline(m),
          },
          h(
            'div',
            { class: 'thumb', style: m.thumb ? { backgroundImage: `url(${m.thumb})` } : {} },
            m.thumb ? '' : h('span', { class: 'icon' }, icon),
            m.type !== 'image' && m.duration ? h('span', { class: 'dur' }, VE.fmtTime(m.duration, false)) : null,
            m.url ? null : h('span', { class: 'warn' }, '未リンク'),
          ),
          h('div', { class: 'name' }, m.name),
          h(
            'div',
            { class: 'media-actions' },
            h('button', { title: 'タイムラインに追加', disabled: !m.url, onclick: () => VE.ops.addToTimeline(m) }, '＋追加'),
            h('button', { title: '素材を削除', class: 'ghost', onclick: () => VE.ops.removeMedia(m.id) }, '✕'),
          ),
        );
      }),
    );
  };

  /* ================= プロパティ ================= */
  const P = (VE.props = {});
  let body;
  let title;
  P.init = (bodyEl, titleEl) => {
    body = bodyEl;
    title = titleEl;
    VE.bus.on('change', (opts) => {
      if (opts.props !== false) P.render();
    });
    P.render();
  };

  /** 入力の変更を状態へ反映。最初の入力で変更前スナップショットを取り、確定時に履歴へ積む */
  function bind(input, read, write) {
    let pre = null;
    const begin = () => {
      if (pre == null) pre = VE.snapshot();
    };
    input.addEventListener('focus', begin);
    input.addEventListener('pointerdown', begin);
    input.addEventListener('input', () => {
      begin();
      write(read());
      VE.changed({ props: false });
    });
    input.addEventListener('change', () => {
      begin();
      write(read());
      VE.commit(pre);
      pre = null;
      VE.changed({ props: false });
    });
  }

  const field = (label, ...ctrl) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), h('div', { class: 'ctrl' }, ...ctrl));
  const section = (name, ...rows) => h('div', { class: 'section' }, h('div', { class: 'section-title' }, name), ...rows);

  /** スライダー＋数値入力 */
  function slider(obj, key, { min, max, step = 0.01, scale = 1, unit = '', after } = {}) {
    const toUi = (v) => VE.round(v * scale, 3);
    const range = h('input', { type: 'range', min, max, step, value: String(toUi(obj[key])) });
    const num = h('input', { type: 'number', min, max, step, value: String(toUi(obj[key])), class: 'num' });
    const write = (v) => {
      v = VE.clamp(parseFloat(v), min, max);
      if (Number.isNaN(v)) return;
      obj[key] = v / scale;
      range.value = String(v);
      num.value = String(VE.round(v, 3));
      after && after();
    };
    bind(range, () => range.value, write);
    bind(num, () => num.value, write);
    return [range, num, unit ? h('span', { class: 'unit' }, unit) : null];
  }

  /** 数値入力（範囲は関数で動的に） */
  function number(obj, key, { min = () => 0, max = () => Infinity, step = 0.01, unit = '秒' } = {}) {
    const num = h('input', { type: 'number', step, value: String(VE.round(obj[key])), class: 'num wide' });
    bind(num, () => num.value, (v) => {
      v = parseFloat(v);
      if (Number.isNaN(v)) return;
      obj[key] = VE.clamp(v, min(), max());
      if (document.activeElement !== num) num.value = String(VE.round(obj[key]));
    });
    num.addEventListener('change', () => (num.value = String(VE.round(obj[key]))));
    return [num, h('span', { class: 'unit' }, unit)];
  }

  function select(obj, key, options, after) {
    const sel = h('select', {}, ...options.map(([v, l]) => h('option', { value: v }, l)));
    sel.value = obj[key];
    bind(sel, () => sel.value, (v) => {
      obj[key] = v;
      after && after(v);
    });
    return sel;
  }

  function check(obj, key, label) {
    const cb = h('input', { type: 'checkbox', checked: !!obj[key] });
    bind(cb, () => cb.checked, (v) => (obj[key] = v));
    return h('span', { class: 'check' }, cb, label);
  }

  function color(obj, key) {
    const c = h('input', { type: 'color', value: obj[key] });
    bind(c, () => c.value, (v) => (obj[key] = v));
    return c;
  }

  const clipActions = () =>
    h(
      'div',
      { class: 'actions' },
      h('button', { onclick: () => VE.ops.split(VE.engine.t) }, '✂ 分割'),
      h('button', { onclick: () => VE.ops.duplicate() }, '複製'),
      h('button', { class: 'danger', onclick: () => VE.ops.remove() }, '削除'),
    );

  const fades = (c) =>
    section(
      'フェード',
      field('イン', ...slider(c, 'fadeIn', { min: 0, max: 5, step: 0.1, unit: '秒' })),
      field('アウト', ...slider(c, 'fadeOut', { min: 0, max: 5, step: 0.1, unit: '秒' })),
    );

  P.render = () => {
    if (!body) return;
    const c = VE.selected();
    if (!c) {
      title.textContent = 'プロジェクト設定';
      body.replaceChildren(projectPanel());
      return;
    }
    if (c.kind === 'video') {
      title.textContent = '映像クリップ';
      body.replaceChildren(videoPanel(c));
    } else if (c.kind === 'text') {
      title.textContent = 'テキスト';
      body.replaceChildren(textPanel(c));
    } else {
      title.textContent = '音声クリップ';
      body.replaceChildren(audioPanel(c));
    }
  };

  const info = (c, m) =>
    h(
      'div',
      { class: 'info' },
      h('div', { class: 'info-name' }, m ? m.name : ''),
      h('div', {}, `位置 ${VE.fmtTime(c.start)} ／ 長さ ${VE.fmtTime(VE.dur(c))}`),
    );

  function videoPanel(c) {
    const m = VE.mediaById(c.mediaId);
    const isImage = m && m.type === 'image';
    const mediaDur = () => (m ? m.duration : Infinity);
    return h(
      'div',
      {},
      info(c, m),
      section(
        isImage ? '表示時間' : '使用範囲（素材内）',
        isImage
          ? field('長さ', ...number(c, 'out', { min: () => 0.2, max: () => 3600 }))
          : [
              field('開始', ...number(c, 'in', { min: () => 0, max: () => c.out - 0.1 })),
              field('終了', ...number(c, 'out', { min: () => c.in + 0.1, max: mediaDur })),
            ],
      ),
      isImage
        ? null
        : section(
            '再生',
            field('速度', ...slider(c, 'speed', { min: 0.25, max: 4, step: 0.05, unit: '倍' })),
            field('音量', ...slider(c, 'volume', { min: 0, max: 200, step: 1, scale: 100, unit: '%' })),
          ),
      fades(c),
      section(
        '色調補正',
        field('明るさ', ...slider(c, 'brightness', { min: 0, max: 200, step: 1, unit: '%' })),
        field('コントラスト', ...slider(c, 'contrast', { min: 0, max: 200, step: 1, unit: '%' })),
        field('彩度', ...slider(c, 'saturate', { min: 0, max: 200, step: 1, unit: '%' })),
      ),
      section(
        '表示',
        field('フィット', select(c, 'fit', [['contain', '全体を表示（余白あり）'], ['cover', '画面を埋める（切り抜き）'], ['stretch', '引き伸ばす']])),
        field('', check(c, 'kenburns', 'ゆっくりズーム（Ken Burns）')),
      ),
      clipActions(),
    );
  }

  function textPanel(c) {
    const ta = h('textarea', { rows: 3 });
    ta.value = c.text;
    bind(ta, () => ta.value, (v) => (c.text = v));
    const posBtn = (label, y) =>
      h('button', {
        class: 'small',
        onclick: () => {
          VE.commit();
          c.x = 0.5;
          c.y = y;
          VE.changed();
        },
      }, label);
    return h(
      'div',
      {},
      section('文字', ta),
      section(
        '書式',
        field('フォント', select(c, 'font', VE.FONTS)),
        field('サイズ', ...slider(c, 'size', { min: 2, max: 30, step: 0.5, unit: '%' })),
        field('文字色', color(c, 'color'), check(c, 'bold', '太字')),
        field('縁取り', color(c, 'stroke'), ...slider(c, 'strokeWidth', { min: 0, max: 30, step: 1 })),
        field('背景', check(c, 'bgOn', '表示'), color(c, 'bg')),
        field('背景の濃さ', ...slider(c, 'bgAlpha', { min: 0, max: 100, step: 1, scale: 100, unit: '%' })),
      ),
      section(
        '位置',
        field('横', ...slider(c, 'x', { min: 0, max: 100, step: 0.5, scale: 100, unit: '%' })),
        field('縦', ...slider(c, 'y', { min: 0, max: 100, step: 0.5, scale: 100, unit: '%' })),
        h('div', { class: 'actions' }, posBtn('上', 0.12), posBtn('中央', 0.5), posBtn('下', 0.85)),
        h('div', { class: 'hint' }, 'プレビュー上でドラッグしても移動できます'),
      ),
      section(
        'タイミング',
        field('開始', ...number(c, 'start', { min: () => 0 })),
        field('長さ', ...number(c, 'duration', { min: () => 0.1, max: () => 3600 })),
        field('アニメ', select(c, 'anim', [['none', 'なし'], ['slide', 'スライドイン'], ['zoom', 'ズームイン'], ['type', 'タイプライター']])),
      ),
      fades(c),
      clipActions(),
    );
  }

  function audioPanel(c) {
    const m = VE.mediaById(c.mediaId);
    return h(
      'div',
      {},
      info(c, m),
      section(
        'タイミング',
        field('配置', ...number(c, 'start', { min: () => 0 })),
        field('素材の開始', ...number(c, 'in', { min: () => 0, max: () => c.out - 0.1 })),
        field('素材の終了', ...number(c, 'out', { min: () => c.in + 0.1, max: () => (m ? m.duration : Infinity) })),
      ),
      section('音量', field('音量', ...slider(c, 'volume', { min: 0, max: 200, step: 1, scale: 100, unit: '%' }))),
      fades(c),
      clipActions(),
    );
  }

  const RESOLUTIONS = [
    ['1920x1080', '1920×1080（フルHD 横）'],
    ['1280x720', '1280×720（HD 横）'],
    ['3840x2160', '3840×2160（4K 横）'],
    ['1080x1920', '1080×1920（縦型 ショート/リール）'],
    ['1080x1080', '1080×1080（正方形）'],
    ['1080x1350', '1080×1350（4:5 縦）'],
  ];

  function projectPanel() {
    const st = S.settings;
    const res = { v: `${st.width}x${st.height}` };
    const opts = RESOLUTIONS.some(([v]) => v === res.v) ? RESOLUTIONS : [[res.v, res.v.replace('x', '×')], ...RESOLUTIONS];
    const fps = { v: String(st.fps) };
    const total = VE.totalDuration();
    return h(
      'div',
      {},
      section(
        '出力',
        field('解像度', select(res, 'v', opts, (v) => {
          const [w, hh] = v.split('x').map(Number);
          st.width = w;
          st.height = hh;
        })),
        field('フレームレート', select(fps, 'v', [['24', '24 fps'], ['30', '30 fps'], ['60', '60 fps']], (v) => (st.fps = Number(v)))),
        field('背景色', color(st, 'bg')),
      ),
      section(
        '概要',
        h('div', { class: 'info' },
          h('div', {}, `総尺 ${VE.fmtTime(total)}`),
          h('div', {}, `映像 ${S.video.length} ／ テキスト ${S.text.length} ／ 音声 ${S.audio.length} クリップ`)),
      ),
      section(
        'ショートカット',
        h('dl', { class: 'keys' },
          ...[
            ['Space', '再生／一時停止'],
            ['S', '再生ヘッドで分割'],
            ['Delete', '選択クリップを削除'],
            ['← / →', '1フレーム移動（Shift で1秒）'],
            ['Home / End', '先頭／末尾へ'],
            ['T', 'テキスト追加'],
            ['Ctrl+D', '複製'],
            ['Ctrl+Z / Ctrl+Y', '元に戻す／やり直し'],
            ['Ctrl+S', 'プロジェクト保存'],
            ['Ctrl+ホイール', 'タイムライン拡大縮小'],
          ].flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      ),
    );
  }
})();
