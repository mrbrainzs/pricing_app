import { useColorScheme } from 'react-native';

const light = {
  bg: '#F6F5F1',
  card: '#FFFFFF',
  text: '#1B1F1D',
  muted: '#5E6561',
  border: '#E2E0D8',
  primary: '#0B6E5A',
  primarySoft: '#DDEFE9',
  onPrimary: '#FFFFFF',
  chip: '#ECEAE3',
  good: '#1D7F3A',
  goodSoft: '#E1F2E5',
  high: '#B3261E',
  highSoft: '#F9E3E1',
  warn: '#8A5300',
  warnSoft: '#FBEFD9',
};

const dark: typeof light = {
  bg: '#111413',
  card: '#1B1F1D',
  text: '#ECEFED',
  muted: '#A4ACA8',
  border: '#2E3431',
  primary: '#4FC3A6',
  primarySoft: '#183A32',
  onPrimary: '#06201A',
  chip: '#262B29',
  good: '#7BD08F',
  goodSoft: '#1D3324',
  high: '#F2A39C',
  highSoft: '#3D2220',
  warn: '#F0C27A',
  warnSoft: '#3A2D16',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const MAX_WIDTH = 640;
