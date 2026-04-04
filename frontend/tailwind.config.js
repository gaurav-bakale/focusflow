/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // ── Legacy (kept for backward compat) ──────────────────────────────
        primary:        "#3a6758",
        "primary-dark": "#2e5b4c",
        accent:         "#F59E0B",
        success:        "#10B981",
        danger:         "#EF4444",

        // ── Papercut Design System ─────────────────────────────────────────
        "pc-primary":               "#3a6758",
        "pc-primary-dim":           "#2e5b4c",
        "pc-on-primary":            "#dffff1",
        "pc-primary-container":     "#bcedda",
        "pc-on-primary-container":  "#2d5a4c",

        "pc-secondary":             "#536358",
        "pc-on-secondary":          "#ecfdf0",
        "pc-secondary-container":   "#d6e7da",
        "pc-on-secondary-container":"#46554b",

        "pc-surface":               "#fafaf5",
        "pc-surface-dim":           "#d5dcd0",
        "pc-surface-bright":        "#fafaf5",
        "pc-surface-low":           "#f3f4ee",
        "pc-surface-container":     "#ecefe7",
        "pc-surface-high":          "#e5eae0",
        "pc-surface-highest":       "#dee4da",
        "pc-surface-lowest":        "#ffffff",

        "pc-on-surface":            "#2e342d",
        "pc-on-surface-variant":    "#5b6159",
        "pc-outline":               "#767c74",
        "pc-outline-variant":       "#aeb4aa",

        "pc-tertiary":              "#566259",
        "pc-tertiary-container":    "#deece0",
        "pc-on-tertiary-container": "#4c584f",

        "pc-error":                 "#9f403d",
        "pc-error-container":       "#fe8983",
      },
      fontFamily: {
        headline: ['Epilogue', 'sans-serif'],
        body:     ['Manrope', 'sans-serif'],
        label:    ['Manrope', 'sans-serif'],
        sans:     ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        'paper':     '0 20px 40px rgba(46,52,45,0.06)',
        'paper-sm':  '0 4px 12px rgba(46,52,45,0.04)',
        'paper-lg':  '0 20px 50px rgba(46,52,45,0.08)',
        'sidebar':   '10px 0 30px rgba(46,52,45,0.04)',
        'card':      '0 4px 20px rgba(46,52,45,0.06)',
      },
    },
  },
  plugins: [],
}
