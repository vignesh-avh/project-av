/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      // We are defining a new, professional color palette for the app.
      // This allows us to use classes like `bg-primary` or `text-neutral-700`.
      colors: {
        primary: {
          DEFAULT: '#4f46e5', // A vibrant, trustworthy Indigo
          light: '#6366f1',
          dark: '#4338ca',
        },
        neutral: {
          50: '#f8fafc',  // A modern, cool-toned Slate gray palette
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        success: '#10b981', // A clean Emerald green
        warning: '#f59e0b', // A rich Amber yellow
        danger: '#ef4444',  // A clear, modern Red
      },
      // Here we set a new default font for the entire application.
      // 'Inter' is a highly readable and professional font used in many modern UIs.
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}