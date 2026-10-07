// 検索エンジン向け sitemap.xml（ビルド済みの全ページから自動生成）
import type { APIRoute } from 'astro';

const pages = import.meta.glob('./**/*.astro', { eager: false });

export const GET: APIRoute = async ({ site }) => {
  const { businesses, interviews, news, jobKinds, newsCategories } = await import('../lib/data');
  const staticPaths = Object.keys(pages)
    .filter((p) => !p.includes('[') && !p.includes('404') && !p.includes('styleguide') && !p.includes('thanks'))
    .map((p) => p.replace(/^\.\//, '/').replace(/index\.astro$/, '').replace(/\.astro$/, '/'));
  const dyn = [
    ...(await businesses()).filter((b) => b.data.split && b.id !== 'shop').map((b) => `/business/${b.id}/`),
    ...(await interviews()).flatMap((i) => [`/people/interview/${i.id}/`, `/recruit/people/${i.id}/`]),
    ...(await news()).map((n) => `/news/${n.id}/`),
    ...Object.keys(jobKinds).map((k) => `/recruit/jobs/${k}/`),
    ...Object.keys(newsCategories).map((c) => `/news/category/${c}/`),
  ];
  const urls = [...new Set([...staticPaths, ...dyn])].sort();
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${new URL(u, site)}</loc></url>`)
    .join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
