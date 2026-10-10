import { Footer, Header, StickyCta } from "@/components/sections/chrome";
import { RenderSection } from "@/components/sections/render";
import { site } from "@/content/site";

export default function Home() {
  return (
    <>
      <Header site={site} />
      <main>
        {site.sections.map((s, i) => (
          <RenderSection key={i} section={s} site={site} />
        ))}
      </main>
      <Footer site={site} />
      <StickyCta site={site} />
    </>
  );
}
