// テキスト整形ヘルパー。CMS から来る短いテキスト（frontmatter / YAML）用。

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 【…】を仮置き表示に、改行を <br> にして HTML 文字列を返す（set:html 用） */
export function ph(text: string | undefined | null): string {
  if (!text) return '';
  return escape(text)
    .replace(/【[^】]*】/g, (m) => `<span class="ph">${m}</span>`)
    .replace(/\n/g, '<br>');
}

/** 仮置きが残っているか */
export const hasPh = (text?: string | null) => !!text && /【[^】]*】/.test(text);

export const formatDate = (d: Date) =>
  `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
