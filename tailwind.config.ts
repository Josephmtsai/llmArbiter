export default {
  content: [
    './components/**/*.{vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './composables/**/*.ts',
    './app.vue',
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '1.2', letterSpacing: '0.08em' }],
        xs: ['12px', { lineHeight: '1.5' }],
        sm: ['13px', { lineHeight: '1.5' }],
        base: ['14px', { lineHeight: '1.5' }],
        md: ['15px', { lineHeight: '1.35' }],
        lg: ['18px', { lineHeight: '1.35' }],
        xl: ['24px', { lineHeight: '1.2', letterSpacing: '-0.015em' }],
        '2xl': ['32px', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        DEFAULT: '8px',
        lg: '10px',
        xl: '14px',
        pill: '999px',
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        10: '40px',
        12: '48px',
        16: '64px',
      },
      transitionTimingFunction: {
        'out-snap': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-std': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '200ms',
        slow: '320ms',
      },
      keyframes: {
        'arb-spin': { to: { transform: 'rotate(360deg)' } },
        'arb-enter': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'arb-fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'arb-slide-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        'arb-spin': 'arb-spin 0.7s linear infinite',
        'arb-enter': 'arb-enter 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'arb-fade-in': 'arb-fade-in 200ms ease-out',
        'arb-slide-in': 'arb-slide-in 240ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
