import { createAdminClient } from "@/lib/supabase-server";
import type { Sponsor } from "@/lib/types/sponsor";
import PartnersGrid from "./PartnersGrid";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Our Partners | West 72 Entertainment",
  description: "The businesses and brands that make live music happen at West 72 Entertainment.",
};

export default async function PartnersPage() {
  const admin = createAdminClient();

  const { data } = await admin
    .from("sponsors")
    .select("*, sponsor_events(event_id)")
    .eq("is_active", true)
    .order("tier", { ascending: true })
    .order("sponsor_name", { ascending: true });

  const sponsors: Sponsor[] = (data ?? []).map(({ sponsor_events, ...s }) => ({
    ...s,
    event_ids: (sponsor_events as { event_id: string }[] ?? []).map((se) => se.event_id),
  }));

  const title    = sponsors.filter(s => s.tier === "title");
  const presenting = sponsors.filter(s => s.tier === "presenting");
  const supporting = sponsors.filter(s => s.tier === "supporting");

  return (
    <main style={{ minHeight: "100vh", background: "#0b0d1d", paddingBottom: 80 }}>
      {/* Hero */}
      <div style={{
        padding: "72px 24px 48px",
        textAlign: "center",
        borderBottom: "1px solid rgba(208,194,144,0.1)",
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(208,194,144,0.5)", marginBottom: 12 }}>
          Our Partners
        </p>
        <h1 style={{ fontSize: "clamp(28px, 5vw, 48px)", fontWeight: 800, color: "#fff", margin: "0 0 16px", lineHeight: 1.1 }}>
          The People Behind<br />
          <span style={{ color: "#d0c290" }}>the Music</span>
        </h1>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 16, maxWidth: 560, margin: "0 auto", lineHeight: 1.6 }}>
          These businesses make it possible to bring world-class live music and events to the Shoals region. We&apos;re proud to work alongside each of them.
        </p>
      </div>

      <PartnersGrid title={title} presenting={presenting} supporting={supporting} />
    </main>
  );
}
