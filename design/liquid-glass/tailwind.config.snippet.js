/**
 * LIQUID GLASS — Tailwind config additions
 * Merge these into your existing tailwind.config.js under theme.extend.
 * (Tailwind v3 syntax shown; if you're on v4's CSS-based config, the
 * same tokens are listed as @theme variables at the bottom of this file.)
 */

module.exports = {
  theme: {
    extend: {
      fontFamily: {
        // pair with next/font/google Archivo — see globals.css.snippet.css notes
        sans: ['var(--font-archivo)', 'Archivo', '-apple-system', 'sans-serif'],
      },
      colors: {
        ink: '#08080a',
        glass: {
          bg: 'rgba(255,255,255,0.07)',
          bg2: 'rgba(255,255,255,0.04)',
          border: 'rgba(255,255,255,0.16)',
          track: 'rgba(255,255,255,0.12)',
        },
        accent: {
          DEFAULT: '#ffffff',
          soft: 'rgba(255,255,255,0.90)',
        },
        ink50: 'rgba(255,255,255,0.60)',   // secondary text on glass
        ink40: 'rgba(255,255,255,0.40)',   // tertiary / dim text
        good: '#8fd6a8',
      },
      borderRadius: {
        'glass-lg': '24px',
        'glass-md': '18px',
        'glass-sm': '12px',
      },
      backdropBlur: {
        glass: '28px',
      },
      boxShadow: {
        glass: '0 20px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.16)',
        'glass-btn': '0 10px 30px rgba(255,255,255,0.22), inset 0 1px 0 rgba(255,255,255,0.4)',
      },
      backgroundImage: {
        'glass-sheen':
          'linear-gradient(120deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.02) 30%, rgba(255,255,255,0) 60%)',
        'glass-surface':
          'linear-gradient(155deg, rgba(255,255,255,0.07), rgba(255,255,255,0.04))',
        'btn-white':
          'linear-gradient(155deg, rgba(255,255,255,0.95), rgba(255,255,255,0.6))',
      },
    },
  },
};

/* ---------------------------------------------------------------
   If your project is on Tailwind v4 (CSS-first config), put this in
   globals.css instead of a JS config file:

   @theme {
     --color-ink: #08080a;
     --color-accent: #ffffff;
     --color-good: #8fd6a8;
     --radius-glass-lg: 24px;
     --radius-glass-md: 18px;
     --radius-glass-sm: 12px;
   }
--------------------------------------------------------------- */
