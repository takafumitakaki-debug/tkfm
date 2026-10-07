// コンテンツモデル定義。
// ここのスキーマと public/admin/config.yml（CMSの入力画面）は 1対1 で対応させる。
// 片方を変えたら必ずもう片方も変えること（docs/08_cms.md 参照）。
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const base = 'src/content';
/** 1ファイル＝1ページ分の設定（シングルトン） */
const single = (name: string) => glob({ pattern: `${name}.yaml`, base: `${base}/settings` });

/** 公開情報から仮置きした事実。confirmed=false の間は「要確認」バッジを出す */
const fact = z.object({ value: z.string(), confirmed: z.boolean().default(false) });

/** 写真枠。src が空の間は撮影指示（note）入りのプレースホルダーを表示する */
const photo = z
  .object({
    src: z.string().optional().nullable(),
    alt: z.string().optional().nullable(),
    note: z.string().optional().nullable(), // 撮影指示
    no: z.string().optional().nullable(), // docs/05_photo_list.md の No
  })
  .default({});

const link = z.object({ label: z.string(), href: z.string() });

// ───────── 章（01〜05） ─────────
const chapters = defineCollection({
  loader: glob({ pattern: '*.yaml', base: `${base}/chapters` }),
  schema: z.object({
    num: z.string(),
    slug: z.string(),
    title: z.string(),
    en: z.string(),
    question: z.string(),
    teaser: z.string(), // TOP の章予告文
    topCta: z.string(),
    hero: photo,
    topPhotos: z.array(photo).default([]),
  }),
});

// ───────── シングルトン ─────────
const company = defineCollection({
  loader: single('company'),
  schema: z.object({
    name: z.string(),
    nameEn: z.string(),
    founded: fact,
    established: fact,
    representative: fact,
    capital: fact,
    employees: fact,
    postal: fact,
    address: fact,
    tel: fact,
    hours: fact,
    business: fact,
    clients: fact,
    banks: fact,
    certifications: z.array(z.object({ name: z.string(), detail: z.string().optional(), confirmed: z.boolean().default(false) })).default([]),
    locations: z
      .array(
        z.object({
          name: z.string(),
          kind: z.enum(['hq', 'warehouse', 'shop']),
          address: z.string(),
          tel: z.string().optional(),
          hours: z.string().optional(),
          holidays: z.string().optional(),
          parking: z.string().optional(),
          mapUrl: z.string().optional(),
          features: z.string().optional(),
          photo,
          confirmed: z.boolean().default(false),
        }),
      )
      .default([]),
    sns: z.object({ facebook: z.string().optional(), instagram: z.string().optional() }).default({}),
    hero: photo,
  }),
});

const top = defineCollection({
  loader: single('top'),
  schema: z.object({
    fvCopy: z.string(),
    fvSub: z.string(),
    fvLead: z.string(),
    fvPhotos: z.array(photo).default([]),
    peopleCulture: z.string().optional(),
    recruitPhoto: photo,
    companyPhoto: photo,
  }),
});

const about = defineCollection({
  loader: single('about'),
  schema: z.object({
    statement: z.string(), // 経営理念
    statementNote: z.string().optional(),
    meanings: z.array(z.object({ keyword: z.string(), meaning: z.string(), inPractice: z.string(), photo })).default([]),
    message: z.object({
      heading: z.string(),
      body: z.string(),
      signature: z.string(),
      photos: z.array(photo).default([]),
      excerpt: z.string(), // TOP に出す一文
    }),
    values: z.array(z.object({ target: z.string(), text: z.string() })).default([]),
  }),
});

const philosophy = defineCollection({
  loader: single('philosophy'),
  schema: z.object({
    preface: z.string(),
    items: z
      .array(
        z.object({
          title: z.string(),
          frame: z.string().optional(), // 原稿がない間の整理枠
          body: z.string(),
          inPractice: z.string(),
          photo,
          related: z.array(link).default([]),
        }),
      )
      .default([]),
    scenes: z.array(z.object({ title: z.string(), body: z.string(), photo })).default([]),
  }),
});

const history = defineCollection({
  loader: single('history'),
  schema: z.object({
    entries: z.array(
      z.object({
        year: z.string(),
        month: z.string().optional(),
        title: z.string(),
        story: z.string().optional(), // ABOUT「歩み」用：そのとき何を考えて決めたか
        milestone: z.boolean().default(false), // true で ABOUT の「歩み」にも表示
        photo,
        confirmed: z.boolean().default(false),
      }),
    ),
  }),
});

const businessPage = defineCollection({
  loader: single('business'),
  schema: z.object({
    lead: z.string(),
    flow: z.array(z.object({ step: z.string(), dept: z.string() })),
    numbers: z.array(z.object({ label: z.string(), value: z.string(), unit: z.string().optional(), confirmed: z.boolean().default(false) })),
    quality: z.string(),
    qualityPhoto: photo,
  }),
});

const people = defineCollection({
  loader: single('people'),
  schema: z.object({
    stance: z.string(),
    culture: z.string().optional(),
    stancePhoto: photo,
    departments: z.array(
      z.object({ name: z.string(), role: z.string(), members: z.string().optional(), comment: z.string().optional(), interview: z.string().optional(), photo }),
    ),
    days: z.array(z.object({ role: z.string(), schedule: z.array(z.object({ time: z.string(), text: z.string() })) })).default([]),
    environment: z.string(),
    environmentPhotos: z.array(photo).default([]),
    recruitCopy: z.string(),
  }),
});

const area = defineCollection({
  loader: single('area'),
  schema: z.object({
    lead: z.string(),
    axes: z.array(
      z.object({ key: z.string(), title: z.string(), body: z.string(), examples: z.array(z.string()).default([]), photo, cta: link.optional() }),
    ),
    future: z.string(),
    futurePhoto: photo,
    closing: z.string(),
    closingPhoto: photo,
  }),
});

const recruit = defineCollection({
  loader: single('recruit'),
  schema: z.object({
    message: z.string(),
    lead: z.string(),
    hero: photo,
    meaning: z.string(),
    meaningPhoto: photo,
    ceoMessage: z.string(),
    persona: z.string(),
    numbers: z.array(z.object({ label: z.string(), value: z.string(), confirmed: z.boolean().default(false) })),
    benefits: z.string(),
    culture: z.string(),
    training: z.string(),
    workplacePhotos: z.array(photo).default([]),
    roles: z.array(
      z.object({
        name: z.string(),
        summary: z.string(),
        duties: z.string(),
        day: z.string(),
        rewarding: z.string(),
        hard: z.string(),
        skills: z.string(),
        career: z.string(),
        photo,
      }),
    ),
    entryNote: z.string(),
    contact: z.string(),
  }),
});

const contact = defineCollection({
  loader: single('contact'),
  schema: z.object({
    tel: fact,
    hours: fact,
    shopTel: fact,
    types: z.array(z.object({ key: z.string(), label: z.string(), description: z.string() })),
    endpoint: z.string().optional(), // フォーム送信先（未設定なら Netlify Forms）
    privacy: z.string(),
  }),
});

// ───────── 一覧型（記事・社員・事業・求人） ─────────
const business = defineCollection({
  loader: glob({ pattern: '*.md', base: `${base}/business` }),
  schema: z.object({
    order: z.number(),
    name: z.string(),
    heading: z.string(), // 「誰に」を見出しにする
    what: z.string(),
    who: z.string(),
    value: z.string(),
    link: z.string(), // 理念とのつながり
    philosophyTags: z.array(z.string()).default([]),
    examples: z.string().optional(),
    photo,
    voice: z.object({ quote: z.string(), name: z.string() }).optional(),
    cta: link.optional(),
    split: z.boolean().default(false), // true で /business/{id}/ を独立ページとして生成
  }),
});

const interviews = defineCollection({
  loader: glob({ pattern: '*.md', base: `${base}/interviews` }),
  schema: z.object({
    order: z.number().default(100),
    name: z.string(),
    dept: z.string(),
    role: z.string(),
    joined: z.string(),
    quote: z.string(), // 一覧カードの見出し
    recruitHeadline: z.string().optional(), // 採用サイト一覧で優先表示する見出し
    portrait: photo,
    photos: z.array(photo).default([]),
    philosophyTags: z.array(z.string()).default([]),
    featured: z.boolean().default(false), // TOP に表示
    draft: z.boolean().default(false),
  }),
});

const news = defineCollection({
  loader: glob({ pattern: '*.md', base: `${base}/news` }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.enum(['info', 'shop', 'recruit', 'area']),
    thumbnail: z.string().optional().nullable(),
    draft: z.boolean().default(false),
  }),
});

const jobs = defineCollection({
  loader: glob({ pattern: '*.md', base: `${base}/jobs` }),
  schema: z.object({
    title: z.string(),
    kind: z.enum(['new-graduate', 'mid-career']),
    order: z.number().default(100),
    open: z.boolean().default(true),
    fields: z.array(z.object({ label: z.string(), value: z.string() })),
  }),
});

export const collections = {
  chapters, company, top, about, philosophy, history, businessPage, people, area, recruit, contact,
  business, interviews, news, jobs,
};
