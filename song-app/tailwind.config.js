/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          950: '#0b0d12',
          900: '#12151c',
          850: '#171b24',
          800: '#1d222d',
          700: '#2a3140',
          600: '#3a4356',
        },
      },
    },
  },
  plugins: [],
}
