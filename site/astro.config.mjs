// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import { rehypePlaceholder } from './src/lib/rehype-placeholder.mjs';

// 本番ドメイン確定後に差し替える（canonical / sitemap / OGP に使用）
const SITE = process.env.SITE_URL || 'https://www.ivano.co.jp';

export default defineConfig({
  site: SITE,
  trailingSlash: 'always',
  build: { format: 'directory' },
  markdown: {
    // 本文中の【…】（仮置き原稿）を自動でハイライトする
    processor: unified({ rehypePlugins: [rehypePlaceholder] }),
  },
  // 旧URL → 新URL（ホスティング側の _redirects と同じ内容を静的にも出力）
  redirects: {
    '/recruit/mid-career/': '/recruit/jobs/mid-career/',
  },
});
