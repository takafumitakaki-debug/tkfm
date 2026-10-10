import { About, Area, Business, People, Philosophy } from "@/components/sections/chapters";
import { Header } from "@/components/sections/header";
import { Hero } from "@/components/sections/hero";
import { Company, Contact, Footer, News, Recruit } from "@/components/sections/info";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <About />
        <Philosophy />
        <Business />
        <People />
        <Area />
        <News />
        <Recruit />
        <Company />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
