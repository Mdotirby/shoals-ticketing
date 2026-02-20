"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useInView } from "framer-motion";
import Footer from "../components/Footer";

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

export default function AboutPage() {
  return (
    <>
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
                CREATING MEMORIES, NOT{" "}
                <span className="about-gold-text">SPREADSHEETS</span>
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
              <h3 className="about-feature-title">
                FAN-FIRST, ALWAYS
              </h3>
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
              <h3 className="about-feature-title">
                ROOTED IN THE SHOALS
              </h3>
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
              <h3 className="about-feature-title">
                UNFORGETTABLE NIGHTS, ZERO PRETENSION
              </h3>
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

      <Footer />
    </>
  );
}
