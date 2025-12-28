// Shared HSL color tokens for charts
export const HSL = {
  blue: '217.2 91.2% 59.8%',
  red: '0 84.2% 60.2%',
  orange: '24.6 95% 53.1%',
  amber: '37.7 92.1% 50.2%',
  yellow: '45.4 93.4% 47.5%',
  lime: '83.7 80.5% 44.3%',
  green: '142.1 70.6% 45.3%',
  emerald: '160.1 84.1% 39.4%',
  teal: '173.4 80.4% 40%',
  cyan: '188.7 94.5% 42.7%',
  sky: '217.2 91.2% 59.8%',
  indigo: '238.7 83.5% 66.7%',
  violet: '258.3 89.5% 66.3%',
  purple: '270.7 91% 65.1%',
  fuchsia: '292.2 84.1% 60.6%',
  pink: '330.4 81.2% 60.4%',
  rose: '349.7 89.2% 60.2%',
} as const

export type HslKey = keyof typeof HSL

export function hsl(keyOrRaw: HslKey | string, alpha?: number) {
  const raw = (HSL as any)[keyOrRaw] || keyOrRaw
  return alpha == null ? `hsl(${raw})` : `hsl(${raw} / ${alpha})`
}

export function applyAlpha(color: string, alpha: number) {
  const raw = String(color || '').trim()
  if (!raw) return raw
  if (raw.startsWith('hsl(')) {
    const inner = raw.slice(4, -1).trim()
    const base = inner.split('/')[0].trim()
    return `hsl(${base} / ${alpha})`
  }
  if (raw.startsWith('hsla(')) {
    const inner = raw.slice(5, -1).trim()
    const base = inner.split('/')[0].trim()
    return `hsl(${base} / ${alpha})`
  }
  if (raw.startsWith('#')) {
    const normalized = raw.replace('#', '')
    const value = normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized.padEnd(6, '0')
    const num = parseInt(value.slice(0, 6), 16)
    const r = (num >> 16) & 255
    const g = (num >> 8) & 255
    const b = num & 255
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  if (raw.startsWith('rgb(')) {
    const inner = raw.slice(4, -1).trim()
    return `rgba(${inner}, ${alpha})`
  }
  if (raw.startsWith('oklch(')) {
    const inner = raw.slice(6, -1).trim()
    const base = inner.split('/')[0].trim()
    return `oklch(${base} / ${alpha})`
  }
  if (raw.startsWith('oklab(')) {
    const inner = raw.slice(6, -1).trim()
    const base = inner.split('/')[0].trim()
    return `oklab(${base} / ${alpha})`
  }
  if (raw.startsWith('rgba(')) {
    const inner = raw.slice(5, -1).trim()
    const base = inner.split(',').slice(0, 3).map((s) => s.trim()).join(', ')
    return `rgba(${base}, ${alpha})`
  }
  return raw
}

export const softenPalette = (colors: string[], alpha = 0.75) =>
  colors.map((c) => applyAlpha(c, alpha))

// Default palette for multi-series charts
export const chartPalette = [
  hsl('indigo'),
  hsl('green'),
  hsl('orange'),
  hsl('cyan'),
  hsl('violet'),
  hsl('pink'),
  hsl('teal'),
  hsl('amber'),
]
