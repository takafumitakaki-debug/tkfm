// 全ページ共通のヘッダー・フッター・「次の章へ」を差し込む。
// <body data-page="about" data-next="philosophy"> のように指定する。
(function () {
  var CHAPTERS = [
    { id: "about", no: "01", name: "理念", en: "ABOUT", q: "なぜ、イバノはこの仕事を続けているのか。" },
    { id: "philosophy", no: "02", name: "フィロソフィ", en: "PHILOSOPHY", q: "理念を、毎日の仕事でどう形にしているか。" },
    { id: "business", no: "03", name: "事業", en: "BUSINESS", q: "その考え方を、どんな仕事で実現しているのか。" },
    { id: "people", no: "04", name: "人", en: "PEOPLE", q: "イバノを支えているのは、誰なのか。" },
    { id: "area", no: "05", name: "地域", en: "AREA", q: "イバノの仕事は、沖縄に何を生んでいるのか。" }
  ];
  var PAGES = [
    ["index", "TOP"], ["about", "01 理念"], ["philosophy", "02 フィロソフィ"], ["business", "03 事業"],
    ["people", "04 人"], ["area", "05 地域"], ["recruit", "採用"], ["company", "会社情報"],
    ["news", "ニュース"], ["contact", "お問い合わせ"]
  ];
  var page = document.body.dataset.page;

  // 表示切替バー（ワイヤー閲覧用。本番サイトには含まない）
  var bar = '<div class="wf-bar"><strong>WIREFRAME</strong>' +
    PAGES.map(function (p) {
      return '<a href="' + p[0] + '.html"' + (p[0] === page ? ' class="is-current"' : '') + '>' + p[1] + '</a>';
    }).join("") +
    '<label><input type="checkbox" id="toggle-notes" checked> 注釈を表示</label></div>';

  var header = '<header class="site-header">' +
    '<a class="logo" href="index.html">IVANO</a>' +
    '<nav class="gnav" aria-label="章">' +
    CHAPTERS.map(function (c) {
      return '<a href="' + c.id + '.html"' + (c.id === page ? ' class="is-current"' : '') + '><span class="num">' + c.no + '</span>' + c.name + '</a>';
    }).join("") + '</nav>' +
    '<nav class="unav" aria-label="情報"><a href="news.html">ニュース</a><a href="company.html">会社情報</a><a href="business.html#shop">店舗情報</a></nav>' +
    '<div class="hbtns"><a class="btn" href="recruit.html">採用情報</a><a class="btn primary" href="contact.html">お問い合わせ</a></div>' +
    '</header>';

  document.body.insertAdjacentHTML("afterbegin", bar + header);

  // 次の章へ
  var nextId = document.body.dataset.next;
  var nextSlot = document.getElementById("next-chapter");
  if (nextId && nextSlot) {
    var n = CHAPTERS.filter(function (c) { return c.id === nextId; })[0];
    nextSlot.innerHTML = '<a class="next-chapter" href="' + n.id + '.html">' +
      '<div class="lbl">NEXT CHAPTER ／ 次の章へ</div>' +
      '<div class="ttl">' + n.no + ' ' + n.name + ' <small>' + n.en + '</small> →</div>' +
      '<div class="q">' + n.q + '</div></a>';
  }

  // 章ラベル：<div class="chapter-head" data-ch="about"></div>
  document.querySelectorAll(".chapter-head").forEach(function (el) {
    var c = CHAPTERS.filter(function (x) { return x.id === el.dataset.ch; })[0];
    el.innerHTML = '<div class="chapter"><span class="no">' + c.no + '</span><span class="name">' + c.name +
      '</span><span class="en">' + c.en + '</span></div><p class="question">' + c.q + '</p>';
  });

  var footer =
    '<section class="contact-block"><h2 class="label">CONTACT ／ お問い合わせ</h2>' +
    '<div class="grid g4">' +
    '<a class="card" href="contact.html?type=business"><b>お取引のご相談</b><div class="meta">飲食店・ホテル・小売の方</div></a>' +
    '<a class="card" href="contact.html?type=shop"><b>店舗・商品について</b><div class="meta">イバノ牧港店・IVANO SELECT</div></a>' +
    '<a class="card" href="contact.html?type=recruit"><b>採用について</b><div class="meta">新卒・中途</div></a>' +
    '<a class="card" href="contact.html?type=other"><b>その他</b><div class="meta">取材・協賛など</div></a>' +
    '</div><p>TEL <span class="ph-text">【代表電話番号】</span> 受付 <span class="ph-text">【受付時間】</span></p></section>' +
    '<footer class="site-footer"><div class="logo" style="display:inline-block">IVANO</div> 株式会社イバノ<br>' +
    '沖縄県浦添市西洲2-9-7 <span class="confirm">要確認</span>' +
    '<nav>' + CHAPTERS.map(function (c) { return '<a href="' + c.id + '.html">' + c.no + ' ' + c.name + '</a>'; }).join("") + '</nav>' +
    '<nav><a href="news.html">ニュース</a><a href="company.html">会社情報</a><a href="business.html#shop">店舗情報</a><a href="recruit.html">採用情報</a><a href="contact.html">お問い合わせ</a><a href="#">プライバシーポリシー</a><a href="#">サイトマップ</a></nav>' +
    '© IVANO Co., Ltd.</footer>';
  document.body.insertAdjacentHTML("beforeend", footer);

  // 注釈の表示切替
  var t = document.getElementById("toggle-notes");
  t.addEventListener("change", function () { document.body.classList.toggle("hide-notes", !t.checked); });
})();
