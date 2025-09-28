const palette = {
  // Neutrals
  neutral900: "#FFFFFF",
  neutral800: "#F4F2F1",
  neutral700: "#D7CEC9",
  neutral600: "#B6ACA6",
  neutral500: "#978F8A",
  neutral400: "#564E4A",
  neutral300: "#3C3836",
  neutral200: "#191015",
  neutral100: "#000000",

  // Primary
  primary900: "#D8C0E7",
  primary800: "#C4B0EE",
  primary700: "#B0B9FF",
  primary600: "#A090E6",
  primary500: "#8070DE",
  primary400: "#6054D6",
  primary300: "#4040CE",
  primary200: "#202761",
  primary100: "#161C47",

  // Secondary
  secondary900: "#F0F0F5",
  secondary800: "#E6E7F0",
  secondary700: "#DCDDE9",
  secondary600: "#CCD0E0",
  secondary500: "#BCC0D6",
  secondary400: "#A6ABCC",
  secondary300: "#9196B9",
  secondary200: "#626894",
  secondary100: "#41476E",

  // Accent
  accent900: "#FFF8F0",
  accent800: "#FFF4E6",
  accent700: "#FFEED4",
  accent600: "#FFE6C2",
  accent500: "#FFDEB0",
  accent400: "#FFD49E",
  accent300: "#FFCA8C",
  accent200: "#FFC07A",
  accent100: "#FFB668",

  // Angry/Error
  angry100: "#F2D6CD",
  angry500: "#C03403",
  angry600: "#FE98EB",

  // Success
  success500: "#E8F5E8",
  success100: "#4CAF50",

  // Pure colors
  black: "#000000",
  white: "#FFFFFF",
  transparent: "rgba(0, 0, 0, 0)",

  // Additional unique colors
  darkBlue1: "#090A14",
  darkBlue2: "#080D33",
  darkBlue3: "#030514",
  darkBlue4: "#1D1D45",
  darkBlue5: "#0F1861",
  purpleBlue1: "#4340D3",
  purpleBlue2: "#06114D",
  purpleBlue3: "#7B79FF",
  purpleBlue4: "#7674FB",
  purpleGray1: "#565E8C",
  purpleGray2: "#747CAB",
  purpleGray3: "#898FB2",
  lightPurple1: "#D5D8F5",
  lightPurple2: "#ABAAFF",
  darkPurple1: "#474794",
  darkPurple2: "#141434",
  lightText: "#F9F8FE",
  darkGray: "#121212",
  modalDark: "#1c1c1c",
  warningPink: "rgba(254, 152, 235, 0.2)",
  warningPinkStrong: "rgba(254, 152, 235, 0.4)",
  warningPinkBorder: "rgba(254, 152, 235, 0.16)",
} as const

const unique = {
  backgroundStart: "#090A14",
  backgroundEnd: "#080D33",

  // Switch/toggle states
  switchTrackOff: palette.purpleGray1,
  switchTrackOn: palette.purpleBlue4,
  switchThumb: palette.neutral100,
  switchThumbOn: palette.white,
  switchThumbOff: palette.lightPurple1,
  switchBorder: palette.transparent,

  // Slider states
  sliderThumb: palette.white,
  sliderTrackActive: palette.purpleBlue4,
  sliderTrackInactive: palette.purpleGray1,
} as const

export const colors = {
  palette,

  // Text colors
  text: palette.neutral800,
  textDim: palette.neutral600,
  textAlt: palette.neutral200,

  // Backgrounds
  background: palette.primary100,
  backgroundAlt: palette.primary300,

  // Borders
  border: palette.primary200,
  separator: palette.neutral300,

  // Primary colors
  tint: palette.primary800,
  tintInactive: palette.neutral300,

  // Error states
  error: palette.angry500,
  errorBackground: palette.angry100,
  warning: palette.accent300,

  // Common:
  primary: palette.primary700,
  secondary: palette.secondary300,
  accent: palette.accent300,

  // Iconography
  icon: palette.neutral900,
  iconSecondary: palette.neutral500,

  // Status chips
  statusIcon: palette.lightPurple1,
  statusText: palette.neutral900,

  ...unique,
} as const
