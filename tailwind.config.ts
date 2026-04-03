import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0A0A0F',
          secondary: '#111118',
          card: '#16161E',
          card2: '#1C1C26' },
        primary: {
          DEFAULT: '#6C63FF',
          hover: '#7B74FF',
          muted: 'rgba(108,99,255,0.15)' },
        accent: {
          red: '#FF6B6B',
          yellow: '#FFD93D',
          green: '#6BCB77' },
        border: {
          DEFAULT: 'rgba(255,255,255,0.07)',
          active: 'rgba(108,99,255,0.4)' },
        text: {
          DEFAULT: '#F0EFF8',
          secondary: '#9998B0',
          muted: '#5A5970' } },
      fontFamily: {
        sans: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-dm-mono)', 'monospace'] },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #6C63FF, #FF6B6B)',
        'gradient-card': 'linear-gradient(135deg, #16161E, #1C1C26)',
        'glass': 'rgba(22,22,30,0.8)' },
      boxShadow: {
        glow: '0 0 30px rgba(108,99,255,0.3)',
        'glow-sm': '0 0 15px rgba(108,99,255,0.2)',
        card: '0 4px 24px rgba(0,0,0,0.4)' },
      animation: {
        'fade-up': 'fadeUp 0.4s ease forwards',
        'pop-in': 'popIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards',
        'shimmer': 'shimmer 1.5s infinite',
        'pulse-glow': 'pulseGlow 2s infinite' },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' } },
        popIn: {
          from: { opacity: '0', transform: 'scale(0.9)' },
          to: { opacity: '1', transform: 'scale(1)' } },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' } },
        pulseGlow: {
          '0%,100%': { boxShadow: '0 0 15px rgba(108,99,255,0.2)' },
          '50%': { boxShadow: '0 0 30px rgba(108,99,255,0.5)' } } },
      screens: {
        xs: '390px',
        sm: '640px',
        md: '768px',
        tablet: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px' } } },
  plugins: [] }

export default config
