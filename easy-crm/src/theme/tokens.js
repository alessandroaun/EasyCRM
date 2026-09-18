import { Platform } from 'react-native';

export const MODERN_FONT = Platform.OS === 'web' 
  ? '"Plus Jakarta Sans", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  : 'System';

export const TOKENS = {
  font: MODERN_FONT,
  
  // Cores de Superfície - Tema Claro
  light: {
    background: '#f8fafc',
    surface: '#ffffff',
    surfaceSubtle: '#f1f5f9',
    surfaceHover: '#f8fafc',
    border: '#e2e8f0',
    borderSubtle: '#f1f5f9',
    borderFocus: '#3b82f6',
    
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#94a3b8',
    textFaint: '#cbd5e1',
    
    // Status Semânticos
    primary: '#2563eb',
    primaryHover: '#1d4ed8',
    primarySubtle: '#eff6ff',
    
    success: '#059669',
    successSubtle: '#ecfdf5',
    successBorder: '#a7f3d0',
    
    warning: '#d97706',
    warningSubtle: '#fffbeb',
    warningBorder: '#fde68a',
    
    danger: '#dc2626',
    dangerSubtle: '#fef2f2',
    dangerBorder: '#fecaca',
    
    info: '#0284c7',
    infoSubtle: '#f0f9ff',
    infoBorder: '#bae6fd',
    
    purple: '#7c3aed',
    purpleSubtle: '#f5f3ff',
    purpleBorder: '#ddd6fe',
    
    cardShadow: Platform.select({
      web: { boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)' },
      default: {}
    }),
    cardShadowElevated: Platform.select({
      web: { boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)' },
      default: {}
    }),
    modalShadow: Platform.select({
      web: { boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)' },
      default: {}
    })
  },

  // Cores de Superfície - Tema Escuro
  dark: {
    background: '#0b0f19',
    surface: '#131c2e',
    surfaceSubtle: '#1a263d',
    surfaceHover: '#1f2e4a',
    border: '#24334f',
    borderSubtle: '#1e2b42',
    borderFocus: '#60a5fa',
    
    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    textFaint: '#475569',
    
    // Status Semânticos
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    primarySubtle: '#1e293b',
    
    success: '#10b981',
    successSubtle: '#064e3b',
    successBorder: '#059669',
    
    warning: '#fbbf24',
    warningSubtle: '#451a03',
    warningBorder: '#b45309',
    
    danger: '#f87171',
    dangerSubtle: '#450a0a',
    dangerBorder: '#991b1b',
    
    info: '#38bdf8',
    infoSubtle: '#082f49',
    infoBorder: '#0369a1',
    
    purple: '#a78bfa',
    purpleSubtle: '#2e1065',
    purpleBorder: '#6d28d9',
    
    cardShadow: Platform.select({
      web: { boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.35)' },
      default: {}
    }),
    cardShadowElevated: Platform.select({
      web: { boxShadow: '0 12px 30px -5px rgba(0, 0, 0, 0.55)' },
      default: {}
    }),
    modalShadow: Platform.select({
      web: { boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)' },
      default: {}
    })
  },

  radius: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 9999
  }
};
