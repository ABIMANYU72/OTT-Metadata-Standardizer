/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2A7C13',
          light: '#76C457',
        },
        accent: {
          warm: '#FFF8CF',
          peach: '#FBE6C2',
        },
        surface: '#161b22',
        border: '#21262d',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease forwards',
        'pulse-green': 'pulse-green 2s infinite',
      },
    },
  },
  plugins: [],
}
