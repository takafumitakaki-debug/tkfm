import { getCollection, getEntry } from 'astro:content';

type Singles = 'company' | 'top' | 'about' | 'philosophy' | 'history' | 'businessPage' | 'people' | 'area' | 'recruit' | 'contact';
const files: Record<Singles, string> = {
  company: 'company', top: 'top', about: 'about', philosophy: 'philosophy', history: 'history',
  businessPage: 'business', people: 'people', area: 'area', recruit: 'recruit', contact: 'contact',
};

/** シングルトン（settings/*.yaml）の中身を返す */
export async function single<K extends Singles>(name: K) {
  const entry = await (getEntry as any)(name, files[name]);
  if (!entry) throw new Error(`src/content/settings/${files[name]}.yaml がありません`);
  return (entry as { data: any }).data as import('astro:content').CollectionEntry<K>['data'];
}

export async function chapters() {
  const list = await getCollection('chapters');
  return list.map((c) => c.data).sort((a, b) => a.num.localeCompare(b.num));
}

export async function chapter(slug: string) {
  const list = await chapters();
  const i = list.findIndex((c) => c.slug === slug);
  return { current: list[i], next: list[i + 1] ?? null, all: list };
}

export async function businesses() {
  return (await getCollection('business')).sort((a, b) => a.data.order - b.data.order);
}

export const businessHref = (b: { id: string; data: { split: boolean } }) =>
  b.data.split ? `/business/${b.id}/` : `/business/#${b.id}`;

export async function interviews() {
  return (await getCollection('interviews', (e) => !e.data.draft || import.meta.env.DEV)).sort((a, b) => a.data.order - b.data.order);
}

export const newsCategories = {
  info: 'お知らせ',
  shop: '店舗',
  recruit: '採用',
  area: '地域',
} as const;

/** ニュースのカテゴリ → 関連する章 */
export const newsChapter: Record<keyof typeof newsCategories, { label: string; href: string } | null> = {
  info: null,
  shop: { label: '03 事業 ― 店舗', href: '/business/shop/' },
  recruit: { label: '採用情報', href: '/recruit/' },
  area: { label: '05 地域', href: '/area/' },
};

export async function news() {
  return (await getCollection('news', (e) => !e.data.draft || import.meta.env.DEV)).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function jobs(kind?: 'new-graduate' | 'mid-career') {
  return (await getCollection('jobs', (e) => !kind || e.data.kind === kind)).sort((a, b) => a.data.order - b.data.order);
}

export const jobKinds = { 'new-graduate': '新卒採用', 'mid-career': '中途採用' } as const;

export const NEWS_PER_PAGE = 20;
