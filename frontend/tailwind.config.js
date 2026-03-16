/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#4F46E5",
        "primary-dark": "#3730A3",
        accent: "#F59E0B",
        success: "#10B981",
        danger: "#EF4444",
      },
    },
  },
  plugins: [],
}
