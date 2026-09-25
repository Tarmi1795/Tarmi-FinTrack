/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './context/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          750: '#3f3f46', // Zinc 700
          850: '#27272a', // Zinc 800
          900: '#18181b', // Zinc 900
          950: '#09090b', // Zinc 950 (True Dark Gray)
        },
        primary: '#3b82f6',
        secondary: '#8b5cf6',
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
        qatar: {
          maroon: '#8A1538', // Qatari Flag Maroon
        },
        gold: {
          100: '#FFF9C4',
          200: '#FFF176',
          300: '#FFD700', // Classic Gold
          400: '#FBC02D',
          500: '#D4AF37', // Metallic Gold
          600: '#C0A02E',
          700: '#A08020',
          800: '#6D5616',
          900: '#42330D',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-slow': 'pulse 3s infinite',
        'border-beam': 'borderBeam 4s linear infinite',
        'bounce-slight': 'bounceSlight 2s infinite',
        shimmer: 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        borderBeam: {
          '0%': { 'offset-distance': '0%' },
          '100%': { 'offset-distance': '100%' },
        },
        bounceSlight: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5%)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(to bottom right, #FDE68A, #D4AF37, #92400E)',
        'liquid-gold': 'linear-gradient(45deg, #FFD700, #FDB931, #FFFFAC, #D4AF37)',
      },
    },
  },
  plugins: [],
};
