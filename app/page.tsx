import { getHomeAggregate } from "@/lib/home/aggregate";
import { getDailyBrief } from "@/lib/home/brief";
import HomeHero from "@/components/home/HomeHero";
import ScaleSection from "@/components/home/ScaleSection";
import LensCards from "@/components/home/LensCards";
import FeaturedObject from "@/components/home/FeaturedObject";
import DailyBriefPanel from "@/components/home/DailyBriefPanel";
import PersonaShowcase from "@/components/home/PersonaShowcase";
import TrustSignals from "@/components/home/TrustSignals";
import HomeFooter from "@/components/home/HomeFooter";

export const revalidate = 600; // 10 min — keep stats fresh-ish

export default async function HomePage() {
  const aggregate = await getHomeAggregate();
  const brief = await getDailyBrief();

  const featured = aggregate.featured;
  const firstBody = brief?.items?.[0]?.body ?? "";
  const whyText =
    featured && firstBody.includes(featured.object.name)
      ? firstBody
      : featured
        ? `Highest composite score in the catalogue at ${featured.scores.composite.toFixed(1)} — a ${featured.object.type.replace(/_/g, " ")} that scores across collision risk, regulatory exposure, and salvage economics simultaneously.`
        : "";

  return (
    <div className="bg-bg text-text">
      <HomeHero />
      <ScaleSection aggregate={aggregate} />
      <LensCards aggregate={aggregate} />
      <FeaturedObject featured={featured} whyText={whyText} />
      <DailyBriefPanel brief={brief} />
      <PersonaShowcase />
      <TrustSignals />
      <HomeFooter />
    </div>
  );
}
