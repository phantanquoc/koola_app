/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.js', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        koola: {
          ink: '#101828',
          muted: '#667085',
          faint: '#98A2B3',
          line: '#E4E7EC',
          canvas: '#F7F9FC',
          surface: '#FFFFFF',
          primary: '#2563EB',
          primaryDark: '#1D4ED8',
          primarySoft: '#DBEAFE',
          accent: '#10B981',
          accentSoft: '#D1FAE5',
          warm: '#F97316',
          danger: '#EF4444',
          dangerSoft: '#FEE2E2',
          warning: '#F59E0B',
          warningSoft: '#FEF3C7',
          warningInk: '#B45309',
          success: '#12B76A',
          successSoft: '#DCFCE7',
          skeleton: '#EEF2F7',
        },
      },
      borderRadius: {
        koola: '14px',
        'koola-sm': '10px',
        'koola-lg': '20px',
      },
      boxShadow: {
        koola: '0 10px 24px rgba(16, 24, 40, 0.10)',
      },
      fontSize: {
        'koola-title': ['24px', '30px'],
        'koola-heading': ['20px', '26px'],
        'koola-body': ['15px', '22px'],
        'koola-caption': ['12px', '16px'],
      },
    },
  },
  plugins: [],
};
