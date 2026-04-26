/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#08080a',
          900: '#0c0c0e',
          850: '#101013',
          800: '#15151a',
          700: '#1c1c22',
          600: '#26262e',
          500: '#3a3a44',
          400: '#5b5b66',
          300: '#8a8a92',
        },
        bone: {
          50: '#fdfaf2',
          100: '#f6f1e6',
          200: '#ebe4d2',
          300: '#d3cab4',
          400: '#9a9382',
        },
        signal: {
          amber: '#f5b942',
          ember: '#e07a3c',
          sage: '#8aa67a',
          rust: '#c64a3a',
        },
      },
      fontFamily: {
        display: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Geist"', '"Inter Tight"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        widest2: '0.22em',
      },
      keyframes: {
        pulse_ring: {
          '0%': { transform: 'scale(0.8)', opacity: '0.7' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        cursor: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        pulse_ring: 'pulse_ring 1.6s ease-out infinite',
        cursor: 'cursor 1s steps(2) infinite',
        scan: 'scan 4s linear infinite',
        rise: 'rise .6s ease-out both',
      },
    },
  },
  plugins: [],
}
