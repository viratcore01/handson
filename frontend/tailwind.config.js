/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        indigo: {
          DEFAULT: '#4F46E5',
          dark: '#3C34C4',
        },
        mint: {
          DEFAULT: '#34D399',
          deep: '#0F9D6B',
        },
        amber: {
          DEFAULT: '#F59E0B',
          deep: '#B97008',
        },
        offwhite: '#FAFAFA',
        ink: '#211C3A',
        'ink-soft': '#5B5478',
        surface: '#FFFFFF',
        lavender: '#EEF0FF',
        'lavender-deep': '#E1E4FB',
        line: '#E5E2F5',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Baloo 2', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        'radius': '22px',
        'radius-sm': '14px',
      },
      boxShadow: {
        'shadow': '0 10px 30px -12px rgba(79,70,229,0.22)',
        'shadow-sm': '0 4px 14px -6px rgba(33,28,58,0.15)',
      },
    },
  },
  plugins: [],
}
