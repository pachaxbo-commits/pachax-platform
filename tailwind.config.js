/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#F6F8FC',
        surface: '#FFFFFF',
        surfaceSecondary: '#F1F5F9',
        border: '#DCE3EC',
        textPrimary: '#172033',
        textSecondary: '#64748B',
        textMuted: '#94A3B8',

        primary: '#2563EB',
        primaryHover: '#1D4ED8',
        primarySoft: '#EAF2FF',

        accent: '#0EA5A8',
        accentSoft: '#E6F7F7',

        success: '#16A34A',
        successSoft: '#DCFCE7',
        warning: '#D97706',
        warningSoft: '#FEF3C7',
        danger: '#DC2626',
        dangerSoft: '#FEE2E2',

        // Legacy compatibility aliases mapped to light theme tokens
        canvas: '#F6F8FC',
        panel: '#FFFFFF',
        panelLight: '#F1F5F9',
        panelBorder: '#DCE3EC',
        ink: '#172033',
        muted: '#64748B',
        mutedDark: '#94A3B8',
        line: '#E2E8F0',
        lineStrong: '#CBD5E1',
        pachaxDark: '#172033',
        pachaxNavy: '#1E293B',
        pachaxNavyLight: '#334155',
        pachaxCyan: '#0EA5A8',
        pachaxCyanDark: '#0D9488',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        card: '0 2px 8px 0 rgba(15, 23, 42, 0.06), 0 0 0 1px #DCE3EC',
        modal: '0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.05)',
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      fontFamily: {
        sans: [
          'Plus Jakarta Sans',
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
