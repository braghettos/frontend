const PALETTE = {
  background: '#f5f5f5',
  blue: '#11B2E2',
  border: '#E1E3E8',
  dark: '#000000',
  darkBlue: '#05629A',
  error: '#f84c4c',
  gray: '#a0a0a0',
  green: '#00D690',
  info: '#11B2E2',
  light: '#FFFFFF',
  lightgray: '#F0F0F0',
  menubgend: '#002f46',
  menubgstart: '#005d8b',
  menuitem: '#ffffff80',
  menuitembg: '#11b2e266',
  orange: '#FFAA00',
  panelbg: '#FBFBFB',
  primary: '#05629A',
  red: '#F84C4C',
  success: '#00d690',
  text: '#323b40',
  violet: '#722ed1',
  warning: '#ffaa00',
} as const

type PaletteColor = keyof typeof PALETTE

export const getColorCode = (colorName: string | undefined) => {
  if (colorName && colorName in PALETTE) {
    return PALETTE[colorName as PaletteColor]
  }

  return PALETTE.dark
}

export const cssVariables = () => {
  const root = document.documentElement
  Object.entries(PALETTE).forEach(([key, value]) => {
    root.style.setProperty(`--${key}-color`, value)
  })
}

export default PALETTE
