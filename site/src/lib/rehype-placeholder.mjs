// Markdown 本文中の【…】を <span class="ph"> で囲み、仮置き原稿だと一目で分かるようにする。
// 依存を増やさないため、hast を自前で走査する。
const RE = /【[^】]*】/g;

function split(value) {
  const out = [];
  let last = 0;
  for (const m of value.matchAll(RE)) {
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) });
    out.push({
      type: 'element',
      tagName: 'span',
      properties: { className: ['ph'] },
      children: [{ type: 'text', value: m[0] }],
    });
    last = m.index + m[0].length;
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}

function walk(node) {
  if (!node.children) return;
  const next = [];
  for (const child of node.children) {
    if (child.type === 'text' && RE.test(child.value)) {
      RE.lastIndex = 0;
      next.push(...split(child.value));
    } else {
      if (child.type === 'element' && (child.tagName === 'code' || child.tagName === 'pre')) {
        next.push(child);
        continue;
      }
      walk(child);
      next.push(child);
    }
  }
  node.children = next;
}

export function rehypePlaceholder() {
  return (tree) => walk(tree);
}
