/**
 * Shared Stripe Elements Appearance API config (dark theme) — every raw
 * Elements checkout in the app (InlineCheckout.tsx, EventLandingPage.tsx,
 * and any PaymentIntent-based flow) should import this instead of keeping
 * its own copy.
 *
 * Colors are hardcoded, not var(--vc-gold-rgb)/CSS-custom-property based:
 * Stripe renders Elements fields inside a cross-origin iframe that does not
 * inherit this page's :root custom properties, so a value like
 * `rgb(var(--vc-gold-rgb))` fails to resolve there and silently falls back
 * to Stripe's default (black text on white) — which is the exact bug this
 * config exists to avoid. Gold is retired everywhere under the liquid-glass
 * theme anyway (both operators run it now), so there's no live case where
 * these should be anything but white/dark-neutral.
 */
export const stripeAppearance = {
  theme: "night" as const,
  variables: {
    colorPrimary: "#ffffff",
    colorBackground: "rgba(255, 255, 255, 0.04)",
    colorText: "#ffffff",
    colorTextSecondary: "rgba(255, 255, 255, 0.5)",
    colorTextPlaceholder: "rgba(255, 255, 255, 0.3)",
    colorDanger: "#ef4444",
    fontFamily: "var(--font-urbanist), system-ui, sans-serif",
    fontSizeBase: "16px",
    spacingUnit: "4px",
    borderRadius: "12px",
    colorIconCardError: "#ef4444",
  },
  rules: {
    ".Input": {
      backgroundColor: "rgba(255, 255, 255, 0.04)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      color: "#ffffff",
      padding: "14px 16px",
      fontSize: "16px",
      transition: "border-color 0.2s ease, box-shadow 0.2s ease",
    },
    ".Input:focus": {
      borderColor: "rgba(255, 255, 255, 0.5)",
      boxShadow: "0 0 0 2px rgba(255, 255, 255, 0.15)",
    },
    ".Input--invalid": {
      borderColor: "#ef4444",
      boxShadow: "0 0 0 2px rgba(239, 68, 68, 0.15)",
    },
    // Chrome/Safari autofill forces its own black text color on the input
    // (via -webkit-text-fill-color), overriding the color set above — this
    // pins it back to white when a saved card gets autofilled.
    ".Input:-webkit-autofill": {
      "-webkit-text-fill-color": "#ffffff",
      "-webkit-box-shadow": "0 0 0 1000px rgba(255, 255, 255, 0.04) inset",
      caretColor: "#ffffff",
    } as Record<string, string>,
    ".Label": {
      color: "rgba(255, 255, 255, 0.7)",
      fontSize: "13px",
      fontWeight: "600",
    },
    ".Error": {
      color: "#ef4444",
      fontSize: "12px",
    },
  },
};
