/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0f",
        card: "#12121c",
        accent: "#6366f1",
      },
      backdropBlur: {
        '2xl': '24px',
      }
    },
  },
  plugins: [],
}
