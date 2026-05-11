"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence, useInView, type Variants } from "framer-motion";
import type { Sponsor } from "@/lib/types/sponsor";

type Props = {
  title: Sponsor[];
  presenting: Sponsor[];
  supporting: Sponsor[];
};

const TIER_CONFIG = {
  title:      { label: "Title Partner",        logoH: 72, fontSize: 22, cols: "repeat(auto-fit, minmax(240px, 1fr))" },
  presenting: { label: "Presenting Partners",  logoH: 56, fontSize: 18, cols: "repeat(auto-fit, minmax(200px, 1fr))" },
  supporting: { label: "Supporting Partners",  logoH: 40, fontSize: 15, cols: "repeat(auto-fit, minmax(160px, 1fr))" },
};

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

function SponsorCard({ sponsor, logoH, fontSize }: { sponsor: Sponsor; logoH: number; fontSize: number }) {
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false); // mobile tap state

  const hasBio = !!sponsor.bio;

  return (
    <motion.div
      variants={cardVariants}
      style={{ position: "relative" }}
    >
      {/* Card */}
      <motion.div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => { if (hasBio) setExpanded(e => !e); }}
        whileHover={hasBio ? { scale: 1.02 } : {}}
        style={{
          position: "relative",
          background: "rgba(255,255,255,0.03)",
          border: `1px solid ${hovered && hasBio ? "rgba(208,194,144,0.3)" : "rgba(255,255,255,0.07)"}`,
          borderRadius: 14,
          padding: "28px 20px",
          cursor: hasBio ? "pointer" : "default",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 120,
          overflow: "hidden",
          transition: "border-color 0.2s",
        }}
      >
        {/* Logo / Name */}
        {sponsor.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sponsor.logo_url}
            alt={sponsor.name}
            style={{ height: logoH, maxWidth: 220, objectFit: "contain", filter: "grayscale(0.3) brightness(1.1)", transition: "filter 0.2s" }}
          />
        ) : (
          <span style={{ fontSize, fontWeight: 800, color: "rgba(208,194,144,0.85)", textAlign: "center", letterSpacing: "0.04em" }}>
            {sponsor.name}
          </span>
        )}

        {/* Desktop hover bio overlay */}
        <AnimatePresence>
          {hovered && hasBio && (
            <motion.div
              key="bio-overlay"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.22 }}
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 14,
                background: "rgba(11,13,29,0.93)",
                backdropFilter: "blur(6px)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px 18px",
                textAlign: "center",
                // Hide on mobile — tap-expand handles it there
                // The pointer: fine media query isn't available in inline styles,
                // so we rely on the touch device not triggering hover
              }}
              className="partner-bio-overlay"
            >
              <p style={{ fontSize: 13, color: "#fff", lineHeight: 1.55, marginBottom: 12 }}>{sponsor.bio}</p>
              {sponsor.website_url && (
                <a
                  href={sponsor.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ fontSize: 12, color: "#d0c290", textDecoration: "none", fontWeight: 600, letterSpacing: "0.04em" }}
                >
                  Visit Website →
                </a>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bio hint indicator */}
        {hasBio && !hovered && (
          <div style={{ position: "absolute", bottom: 8, right: 10, fontSize: 10, color: "rgba(208,194,144,0.3)", fontWeight: 600 }}>
            ···
          </div>
        )}
      </motion.div>

      {/* Mobile tap-to-expand bio (shown below card) */}
      <AnimatePresence>
        {expanded && hasBio && (
          <motion.div
            key="mobile-bio"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden" }}
            className="partner-mobile-bio"
          >
            <div style={{ padding: "14px 4px 4px", textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, margin: "0 0 10px" }}>{sponsor.bio}</p>
              {sponsor.website_url && (
                <a
                  href={sponsor.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: "#d0c290", textDecoration: "none", fontWeight: 600 }}
                >
                  Visit Website →
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TierSection({ sponsors, tier }: { sponsors: Sponsor[]; tier: "title" | "presenting" | "supporting" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const config = TIER_CONFIG[tier];

  if (sponsors.length === 0) return null;

  return (
    <section ref={ref} style={{ marginBottom: 64 }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        transition={{ duration: 0.5 }}
        style={{ textAlign: "center", marginBottom: 32 }}
      >
        <span style={{
          display: "inline-block",
          fontSize: 10, fontWeight: 700, letterSpacing: "0.18em",
          textTransform: "uppercase", color: "rgba(208,194,144,0.5)",
          borderBottom: "1px solid rgba(208,194,144,0.2)",
          paddingBottom: 6,
        }}>
          {config.label}{sponsors.length > 1 ? "s" : ""}
        </span>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate={inView ? "visible" : "hidden"}
        style={{
          display: "grid",
          gridTemplateColumns: config.cols,
          gap: 16,
          maxWidth: tier === "title" ? 600 : tier === "presenting" ? 900 : 1100,
          margin: "0 auto",
        }}
      >
        {sponsors.map(s => (
          <SponsorCard key={s.id} sponsor={s} logoH={config.logoH} fontSize={config.fontSize} />
        ))}
      </motion.div>
    </section>
  );
}

export default function PartnersGrid({ title, presenting, supporting }: Props) {
  const hasAny = title.length + presenting.length + supporting.length > 0;

  if (!hasAny) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px", color: "rgba(255,255,255,0.3)", fontSize: 16 }}>
        Partners coming soon.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "60px 24px 0" }}>
      <TierSection sponsors={title}      tier="title"      />
      <TierSection sponsors={presenting} tier="presenting" />
      <TierSection sponsors={supporting} tier="supporting" />

      {/* CSS to hide desktop hover overlay on touch devices */}
      <style>{`
        @media (hover: none) {
          .partner-bio-overlay { display: none !important; }
        }
        @media (hover: hover) {
          .partner-mobile-bio { display: none !important; }
        }
      `}</style>
    </div>
  );
}
