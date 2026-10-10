import type { Section, SiteConfig } from "@/content/types";
import { Faq, Features, FinalCta, Flow, Hero, Logos, Pricing, Problems, Stats, Testimonials } from "./blocks";
import { LeadForm } from "./lead-form";

// content の sections を上から順に並べる。並べ替え・削除は content 側だけで済む
export function RenderSection({ section, site }: { section: Section; site: SiteConfig }) {
  switch (section.type) {
    case "hero":
      return <Hero {...section} />;
    case "logos":
      return <Logos {...section} />;
    case "problems":
      return <Problems {...section} />;
    case "features":
      return <Features {...section} />;
    case "stats":
      return <Stats {...section} />;
    case "testimonials":
      return <Testimonials {...section} />;
    case "pricing":
      return <Pricing {...section} />;
    case "flow":
      return <Flow {...section} />;
    case "faq":
      return <Faq {...section} />;
    case "lead":
      return <LeadForm {...section} site={site} />;
    case "cta":
      return <FinalCta {...section} />;
  }
}
