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
