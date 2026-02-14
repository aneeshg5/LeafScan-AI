/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        'app-bg': '#101A14',
        'app-card': '#1C2921',
        'app-accent': '#2ED158',
        'app-accentDark': '#1E3E2A',
        'app-text': '#E1E3E1',
        'app-subtext': '#8A9A91',
        'app-warning': '#F59E0B',
        'app-danger': '#EF4444',
      },
    },
  },
  plugins: [],
}
