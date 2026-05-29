import { createAdminClient } from "@/lib/supabase-server";
import FAQAccordion, { GLOBAL_FAQS } from "../components/FAQAccordion";
import Footer from "../components/Footer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "FAQ | West 72 Entertainment",
  description: "Frequently asked questions about tickets, refunds, and events at West 72 Entertainment.",
};

export default async function FAQPage() {
  // Resolve the default venue so we can load its custom FAQs
  const admin = createAdminClient();
  const { data: venues } = await admin
    .from("venues")
    .select("id")
    .limit(1)
    .single();

  let faqs = GLOBAL_FAQS;

  if (venues?.id) {
    const { data } = await admin
      .from("venue_faqs")
      .select("question, answer")
      .eq("venue_id", venues.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (data && data.length > 0) faqs = data;
  }

  return (
    <>
      <main className="faq-page">
        <section className="contact-hero">
          <h1 className="contact-hero-title">FREQUENTLY ASKED QUESTIONS</h1>
        </section>

        <section className="faq-page-content">
          <div className="faq-page-inner">
            <FAQAccordion faqs={faqs} />
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
