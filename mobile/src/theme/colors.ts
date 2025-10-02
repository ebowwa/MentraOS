const palette = {
  // Neutrals
  // neutral100: "#FFFFFF",
  // neutral200: "#F4F2F1",
  // neutral300: "#D7CEC9",
  // neutral400: "#B6ACA6",
  // neutral500: "#978F8A",
  // neutral600: "#564E4A",
  // neutral700: "#3C3836",
  // neutral800: "#191015",
  // neutral900: "#000000",

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
  primary900: "#F4E0D9",
  primary800: "#E6D0E0",
  primary700: "#D8C0E7",
  primary600: "#C4B0EE",
  primary500: "#A090E6",
  primary400: "#8070DE",
  primary300: "#6054D6",
  primary200: "#4040CE",
  primary100: "#2030C6",

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
  angry600: "#FC7DE3",

  // Success
  success500: "#22C55E",
  success100: "#4CAF50",

  // Pure colors
  black: "#000000",
  white: "#FFFFFF",
  transparent: "rgba(0, 0, 0, 0)",

  // Additional unique colors
  blueTintedWhite: "#F8FAFF",
  purpleBlue1: "#4340D3",
  purpleBlue2: "#06114D",
  purpleBlue3: "#4240D1",
  purpleBlue4: "#3230A4",
  purpleBlue5: "#2B29B4",
  purpleBlue6: "#312FB4",
  purpleBlue7: "#7674FB",
  mediumBlue: "#4A90E2",
  lightPurple1: "#E7E7FF",
  purpleGray1: "#565E8C",
  purpleGray2: "#4F5474",
  purpleGray3: "#898FB2",
  darkText1: "#030514",
  darkText2: "#333333",
  warningPink: "rgba(254, 152, 235, 0.2)",
  warningPinkStrong: "rgba(254, 152, 235, 0.4)",
  warningPinkBorder: "rgba(254, 152, 235, 0.16)",

  // special:
  tagBackground: "rgba(66, 64, 209, 0.1)",
} as const

const unique = {
  backgroundStart: palette.neutral900,
  backgroundEnd: palette.neutral800,

  // Switch/toggle states
  switchTrackOff: palette.lightPurple1,
  switchTrackOn: palette.purpleBlue7,
  switchThumb: palette.neutral900,
  switchThumbOn: palette.neutral900,
  switchThumbOff: palette.neutral900,
  switchBorder: palette.purpleBlue3,

  // Slider states
  sliderThumb: palette.neutral300,
  sliderTrackActive: palette.primary300,
  sliderTrackInactive: palette.lightPurple1,
} as const

export const colors = {
  palette,

  // Text colors
  text: palette.neutral100,
  textDim: palette.neutral300,
  textAlt: palette.neutral800,

  // Backgrounds
  background: palette.neutral900,
  backgroundAlt: palette.neutral800,
  modalOverlay: "rgba(0, 0, 0, 0.7)",

  // Borders
  border: palette.neutral700,

  // Primary colors
  tint: palette.primary500,
  tintInactive: palette.neutral700,
  separator: palette.neutral700,

  // Error states
  error: palette.angry500,
  errorBackground: palette.angry100,
  success: palette.success500,
  warning: palette.accent300,

  // Common:
  primary: palette.purpleBlue4,
  secondary: palette.secondary600,
  accent: palette.accent500,

  // Iconography
  icon: palette.neutral100,
  iconSecondary: palette.neutral300,

  // Status chips
  statusIcon: palette.secondary200,
  statusText: palette.neutral100,

  ...unique,
} as const
