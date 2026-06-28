/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/**/*.html',
    './public/assets/js/**/*.js',
    './src/**/*.js',
  ],
  // NoorVista already uses Bootstrap and many legacy CSS files.
  // Prefixing Tailwind utilities prevents collisions with classes like .container, .row, .btn, etc.
  prefix: 'tw-',
  // Keep legacy UI stable: do not inject Tailwind's CSS reset/preflight.
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      fontFamily: {
        sans: ['Vazir', 'Shabnam', 'Tahoma', 'Arial', 'sans-serif'],
      },
      colors: {
        noor: {
          50: '#eef9ff',
          100: '#d9f1ff',
          200: '#bce8ff',
          300: '#8edbff',
          400: '#59c5f7',
          500: '#2da9e6',
          600: '#1689c4',
          700: '#126d9f',
          800: '#155d83',
          900: '#184e6d',
        },
        clinic: {
          ink: '#123047',
          muted: '#64748b',
          soft: '#f8fafc',
          line: '#e2e8f0',
          success: '#16a34a',
          warning: '#d97706',
          danger: '#dc2626',
        },
      },
      boxShadow: {
        noor: '0 18px 50px rgba(18, 48, 71, 0.10)',
        'noor-soft': '0 10px 30px rgba(18, 48, 71, 0.08)',
      },
      borderRadius: {
        noor: '1.25rem',
      },
    },
  },
  plugins: [],
};
