"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useInView } from "framer-motion";
import Footer from "../components/Footer";
import { useOperator } from "../components/OperatorContext";

function AnimatedCard({ children, index }: { children: React.ReactNode; index: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      className="about-feature-card"
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.5, delay: index * 0.15 }}
    >
      {children}
    </motion.div>
  );
}

// ─── West72 About ──────────────────────────────────────────────────────────────
function West72About() {
  return (
    <main className="about-page">
      {/* ── PHILOSOPHY SECTION ── */}
      <section className="about-philosophy">
        <div className="about-philosophy-inner">
          <div className="about-philosophy-text">
            <div className="about-section-label">
              <span className="about-label-text">OUR PHILOSOPHY</span>
              <span className="about-label-line" />
            </div>

            <h1 className="about-philosophy-title">
              CREATING MEMORIES,{" "}
              <span className="about-gold-text">ONE NIGHT AT A TIME</span>
            </h1>

            <p className="about-philosophy-desc">
              West 72 Entertainment started with a pretty radical idea: what if
              live shows were actually about the people in the crowd? We know&mdash;groundbreaking stuff.
              While other promoters were busy counting beans, we were busy making sure
              you&apos;d lose your voice by the encore.
            </p>
            <p className="about-philosophy-desc">
              We&apos;re a fan-first concert production and artist promotion company
              based in the Shoals. We believe in the raw, unfiltered power of live
              music to bring a community together&mdash;the kind of night where
              strangers become friends and nobody checks their phone for two hours straight.
              That&apos;s basically magic, and we take it very seriously. Well, seriously enough.
            </p>

            <Link href="/events" className="about-cta-btn">
              Upcoming Events <span className="cta-arrow">&rarr;</span>
            </Link>
          </div>

          <div className="about-philosophy-image">
            <Image
              src="/IMG_5742.png"
              alt="West 72 Entertainment"
              width={600}
              height={450}
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 12 }}
            />
          </div>
        </div>
      </section>

      {/* ── WHY US SECTION ── */}
      <section className="about-why-us">
        <div className="about-section-label about-section-label-center">
          <span className="about-label-line" />
          <span className="about-label-text">WHY US?</span>
          <span className="about-label-line" />
        </div>

        <h2 className="about-why-us-title">
          WHAT MAKES <span className="about-gold-text">WEST 72</span> DIFFERENT
        </h2>

        <div className="about-features-grid">
          <AnimatedCard index={0}>
            <div className="about-feature-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
            <h3 className="about-feature-title">FAN-FIRST, ALWAYS</h3>
            <p className="about-feature-desc">
              We don&apos;t do velvet ropes and VIP egos. Every show is built
              around the people who actually show up, sing along, and make the
              night worth having. You&apos;re the headliner. The band just doesn&apos;t
              know it yet.
            </p>
          </AnimatedCard>

          <AnimatedCard index={1}>
            <div className="about-feature-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <h3 className="about-feature-title">ROOTED IN THE SHOALS</h3>
            <p className="about-feature-desc">
              This is where the music was born, and we&apos;re not about to
              let anyone forget it. We promote shows in the community we
              love, for the community we love. Also the barbecue here
              is incredible. That&apos;s not related, but it needed to be said.
            </p>
          </AnimatedCard>

          <AnimatedCard index={2}>
            <div className="about-feature-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <h3 className="about-feature-title">UNFORGETTABLE NIGHTS, ZERO PRETENSION</h3>
            <p className="about-feature-desc">
              We put on shows that people actually talk about the
              next morning&mdash;and not because the sound was bad. Great
              artists, great production, great vibes. Come as you are,
              leave with a story. Shoes optional (kidding, wear shoes).
            </p>
          </AnimatedCard>
        </div>
      </section>
    </main>
  );
}

// ─── VenueCore About ───────────────────────────────────────────────────────────
function VenueCoreAbout() {
  return (
    <main className="about-page">
      {/* ── PHILOSOPHY SECTION ── */}
      <section className="about-philosophy">
        <div className="about-philosophy-inner">
          <div className="about-philosophy-text">
            <div className="about-section-label">
              <span className="about-label-text">OUR PHILOSOPHY</span>
              <span className="about-label-line" />
            </div>

            <h1 className="about-philosophy-title">
              WE DIDN&apos;T INVENT LIVE MUSIC.{" "}
              <span className="about-gold-text">WE JUST MADE IT LESS OF A NIGHTMARE TO RUN.</span>
            </h1>

            <p className="about-philosophy-desc">
              Look, somebody had to do it. The live music industry has been running on handshake
              deals, spreadsheet disasters, and software built during the Clinton administration
              for long enough. While everyone else was busy shipping features like
              &ldquo;export to PDF,&rdquo; venues were drowning in paper contracts,
              artists were waiting months for settlements that should take minutes, and
              promoters were somehow still juggling four different tools that don&apos;t
              speak to each other. We noticed. We built something about it.
            </p>
            <p className="about-philosophy-desc">
              VenueCore is the all-in-one platform for the entire live event ecosystem&mdash;ticketing,
              offer management, contracts, settlements, marketing, loyalty, and more.
              One login. One source of truth. Zero excuses for lost paperwork. We&apos;re not
              trying to replace the magic of live music. We&apos;re just here to make sure
              the people who create it don&apos;t lose their minds in the process.
            </p>

            <Link href="/events" className="about-cta-btn">
              See It in Action <span className="cta-arrow">&rarr;</span>
            </Link>
          </div>

          <div className="about-philosophy-image">
            <Image
              src="/hero-images/default/hero.jpg"
              alt="VenueCore Platform"
              width={600}
              height={450}
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 12 }}
            />
          </div>
        </div>
      </section>

      {/* ── WHY US SECTION ── */}
      <section className="about-why-us">
        <div className="about-section-label about-section-label-center">
          <span className="about-label-line" />
          <span className="about-label-text">WHY VENUECORE?</span>
          <span className="about-label-line" />
        </div>

        <h2 className="about-why-us-title">
          WHAT MAKES{" "}
          <span className="about-gold-text">VENUECORE</span> DIFFERENT
        </h2>

        <div className="about-features-grid">
          <AnimatedCard index={0}>
            <div className="about-feature-icon">
              {/* Building/venue icon */}
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <h3 className="about-feature-title">FOR VENUES: YOU RUN THE SHOW. WE RUN EVERYTHING ELSE.</h3>
            <p className="about-feature-desc">
              Sell tickets, manage capacity, run your box office, track revenue in real time,
              fire off marketing campaigns, and settle with artists&mdash;all without switching
              tabs. It&apos;s like having a full operations team, except it doesn&apos;t call
              in sick on a Saturday night or eat your catering rider.
            </p>
          </AnimatedCard>

          <AnimatedCard index={1}>
            <div className="about-feature-icon">
              {/* Handshake/deal icon */}
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
            <h3 className="about-feature-title">FOR PROMOTERS: OFFER MADE. DEAL DONE. NOBODY CRYING.</h3>
            <p className="about-feature-desc">
              Build offers with guarantees, versus splits, and walk clauses.
              Generate professional deal memos that don&apos;t look like they were formatted
              in Microsoft Works. Route everything to the right people without a single
              spreadsheet. Prism.FM and OpenDate are solid at routing&mdash;VenueCore does
              routing <em>and</em> everything that happens after the show. The part where
              money actually changes hands? Yeah, we do that too.
            </p>
          </AnimatedCard>

          <AnimatedCard index={2}>
            <div className="about-feature-icon">
              {/* Music/artist icon */}
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <h3 className="about-feature-title">FOR ARTISTS & AGENTS: GET PAID. ON TIME. WITH DOCUMENTATION.</h3>
            <p className="about-feature-desc">
              Real-time settlement sheets. Offer PDFs that look like they came from a
              real company. A portal that lets your whole team see exactly what&apos;s
              happening with every deal, every night, every dollar. The era of
              &ldquo;we&apos;ll wire it next week, probably&rdquo; is officially over.
              Well, it&apos;s over on our end. We make no promises about the other guys.
            </p>
          </AnimatedCard>

          <AnimatedCard index={3}>
            <div className="about-feature-icon">
              {/* Ticket icon */}
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z" />
              </svg>
            </div>
            <h3 className="about-feature-title">FOR FANS: JUST LET THEM BUY THE TICKET.</h3>
            <p className="about-feature-desc">
              No hidden fees that appear at the last possible second. No mandatory account
              creation for a purchase you&apos;ll make once. Digital tickets, QR codes,
              and a checkout flow that doesn&apos;t make you want to cancel the concert
              before you even get there. Revolutionary concept, we know.
            </p>
          </AnimatedCard>
        </div>
      </section>

      {/* ── DIFFERENTIATOR SECTION ── */}
      <section className="about-why-us" style={{ paddingTop: 0 }}>
        <div className="about-section-label about-section-label-center">
          <span className="about-label-line" />
          <span className="about-label-text">THE FULL STACK</span>
          <span className="about-label-line" />
        </div>

        <h2 className="about-why-us-title">
          EVERYTHING IN ONE PLACE.{" "}
          <span className="about-gold-text">NO EXCUSES.</span>
        </h2>

        <div className="about-features-grid">
          <AnimatedCard index={0}>
            <div className="about-feature-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <h3 className="about-feature-title">MARKET RADAR</h3>
            <p className="about-feature-desc">
              Know what&apos;s happening in your market before your competition does.
              Track competing events, routing trends, and demand signals so you&apos;re
              never the last to know an artist is playing your city next Saturday.
            </p>
          </AnimatedCard>

          <AnimatedCard index={1}>
            <div className="about-feature-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <h3 className="about-feature-title">FAN LOYALTY ENGINE</h3>
            <p className="about-feature-desc">
              A built-in loyalty program that turns one-time ticket buyers into
              regulars. Points, tiers, streaks, and rewards&mdash;because the fans
              who come back every weekend deserve more than a thank you email.
            </p>
          </AnimatedCard>

          <AnimatedCard index={2}>
            <div className="about-feature-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3 className="about-feature-title">PRIVATE EVENTS & RENTALS</h3>
            <p className="about-feature-desc">
              Corporate events, weddings, private buyouts — manage venue rentals
              with contracts, invoices, and payment collection all in one place.
              The same platform that runs your concerts runs your private calendar.
              Efficient. Probably borderline impressive.
            </p>
          </AnimatedCard>
        </div>
      </section>
    </main>
  );
}

// ─── Page entry point ──────────────────────────────────────────────────────────
export default function AboutPage() {
  const operator = useOperator();

  return (
    <>
      {operator.slug === "venuecore" ? <VenueCoreAbout /> : <West72About />}
      <Footer />
    </>
  );
}
