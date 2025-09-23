const palette = {
  // Neutrals
  neutral900: "#FFFFFF",
  neutral800: "#F4F2F1",
  neutral700: "#D7CEC9",
  neutral600: "#B6ACA6",
  neutral500: "#978F8A",
  neutral400: "#202761",
  neutral300: "#3C3836",
  neutral200: "#161C47",
  neutral100: "#FFFFFF",

  // Primary
  primary600: "#F4E0D9",
  primary500: "#B0B9FF",
  primary400: "#565E8C",
  primary300: "#4240D1",
  primary200: "#6274EE",
  primary100: "#A54F31",

  // Secondary
  secondary500: "#DCDDE9",
  secondary400: "#BCC0D6",
  secondary300: "#9196B9",
  secondary200: "#626894",
  secondary100: "#41476E",

  // Accent
  accent500: "#FFEED4",
  accent400: "#FFE1B2",
  accent300: "#FDD495",
  accent200: "#FBC878",
  accent100: "#FFBB50",

  // Angry/Error
  angry100: "#F2D6CD",
  angry500: "#C03403",
  angry600: "#FE98EB",

  // Blues
  blue100: "#E3F2FD",
  blue200: "#BBDEFB",
  blue300: "#90CAF9",
  blue400: "#42A5F5",
  blue500: "#2196F3",
  blue600: "#1976D2",

  // Grays
  gray100: "#F5F5F5",
  gray200: "#EEEEEE",
  gray300: "#E0E0E0",
  gray400: "#BDBDBD",
  gray500: "#9E9E9E",
  gray600: "#757575",
  gray700: "#616161",
  gray800: "#424242",
  gray900: "#212121",
  lightGray: "#CCCCCC",
  mediumGray: "#999999",

  // Success
  success100: "#E8F5E8",
  success500: "#4CAF50",

  // Overlays
  overlay90: "rgba(0, 0, 0, 0.9)",
  overlay70: "rgba(0, 0, 0, 0.7)",
  overlay60: "rgba(0, 0, 0, 0.6)",
  overlay40: "rgba(0, 0, 0, 0.4)",
  overlay30: "rgba(0, 0, 0, 0.3)",
  overlay20: "rgba(25, 16, 21, 0.2)",
  overlay10: "rgba(0, 0, 0, 0.1)",
  overlay50: "rgba(25, 16, 21, 0.5)",
  whiteOverlay90: "rgba(255, 255, 255, 0.9)",
  whiteOverlay85: "rgba(255, 255, 255, 0.85)",
  whiteOverlay70: "rgba(255, 255, 255, 0.7)",

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

const semantic = {
  // Tab bar gradients
  tabBarGradientStart: palette.darkBlue1,
  tabBarGradientEnd: palette.darkBlue2,
  altTabBarGradientStart: palette.darkBlue3,
  altTabBarGradientEnd: palette.darkBlue4,

  // Button gradients
  buttonGradientStart: palette.purpleBlue1,
  buttonGradientEnd: palette.purpleBlue2,

  // Warning colors
  warningBackground: palette.warningPink,
  warningBackgroundDestructive: palette.warningPinkStrong,
  warningBorderDestructive: palette.warningPinkBorder,
  warningPink: palette.angry600,

  // Input states
  inputBorderHighlight: palette.primary500,

  // Button pill variants
  buttonPillPrimary: palette.primary500,
  buttonPillSecondary: palette.transparent,
  buttonPillSecondaryBorder: palette.purpleGray2,
  buttonPillIcon: palette.darkPurple1,
  buttonPillPrimaryText: palette.darkPurple2,
  buttonPillSecondaryText: palette.lightText,
  buttonPillIconText: palette.white,

  // Gallery
  galleryBg: palette.darkGray,

  // Switch/toggle states
  switchTrackOff: palette.purpleGray1,
  switchTrackOn: palette.purpleBlue4,
  switchThumb: palette.neutral100,
  switchThumbOn: palette.white,
  switchThumbOff: palette.lightPurple1,
  switchBorder: palette.transparent,
  switchBorderWidth: 0,

  // Slider states
  sliderThumb: palette.white,
  sliderTrackActive: palette.purpleBlue4,
  sliderTrackInactive: palette.purpleGray1,

  // Tab bar states
  tabBarIconActive: palette.white,
  tabBarTextActive: palette.white,
  tabBarIconInactive: palette.neutral600,
  tabBarTextInactive: palette.neutral600,

  // List items
  chevron: palette.purpleGray3,

  // Tags
  foregroundTagBackground: palette.darkBlue5,
  foregroundTagText: palette.lightPurple2,

  // Status indicators
  statusIcon: palette.lightPurple1,
  statusText: palette.lightPurple1,

  // Checkmark
  checkmark: palette.purpleBlue3,

  // Search
  searchIcon: palette.neutral800,
} as const

export const colors = {
  palette,
  transparent: palette.transparent,

  // Text colors
  text: palette.neutral800,
  textDim: palette.neutral600,
  textAlt: palette.neutral200,

  // Backgrounds
  background: palette.neutral200,
  modalBackground: palette.modalDark,
  galleryBackground: semantic.galleryBg,
  fullscreenBackground: palette.black,

  // Borders
  border: palette.neutral400,
  borderLight: palette.overlay10,

  // Primary colors
  tint: palette.primary500,
  tintInactive: palette.neutral300,
  separator: palette.neutral300,

  // Error states
  error: palette.angry500,
  errorBackground: palette.angry100,

  // Login screen (no gradient in dark theme)
  loginGradientStart: palette.neutral200,
  loginGradientEnd: palette.neutral200,

  // Buttons
  buttonPrimary: palette.primary500,
  buttonSecondary: palette.blue500,
  buttonDisabled: palette.lightGray,
  buttonDanger: palette.angry500,
  buttonPressed: palette.neutral700,

  // Button gradients
  buttonGradientStart: semantic.buttonGradientStart,
  buttonGradientEnd: semantic.buttonGradientEnd,

  // Pill buttons
  buttonPillPrimary: semantic.buttonPillPrimary,
  buttonPillSecondary: semantic.buttonPillSecondary,
  buttonPillSecondaryBorder: semantic.buttonPillSecondaryBorder,
  buttonPillIcon: semantic.buttonPillIcon,
  buttonPillPrimaryText: semantic.buttonPillPrimaryText,
  buttonPillSecondaryText: semantic.buttonPillSecondaryText,
  buttonPillIconText: semantic.buttonPillIconText,

  // Overlays
  modalOverlay: palette.overlay70,
  fullscreenOverlay: palette.overlay60,
  pickerBackground: palette.overlay70,

  // Status colors
  success: palette.success500,
  statusSuccess: palette.success500,
  statusInfo: palette.blue500,

  // Switch/toggle
  switchTrackOff: semantic.switchTrackOff,
  switchTrackOn: semantic.switchTrackOn,
  switchThumb: semantic.switchThumb,
  switchThumbOn: semantic.switchThumbOn,
  switchThumbOff: semantic.switchThumbOff,
  switchBorder: semantic.switchBorder,
  switchBorderWidth: semantic.switchBorderWidth,

  // Icons
  icon: palette.neutral100,
  iconSecondary: palette.neutral500,

  // Tab bar
  tabBarBackground1: semantic.tabBarGradientStart,
  tabBarBackground2: semantic.tabBarGradientEnd,
  tabBarBackground: palette.neutral200,
  altTabBarBackground1: semantic.altTabBarGradientStart,
  altTabBarBackground2: semantic.altTabBarGradientEnd,
  tabBarIconActive: semantic.tabBarIconActive,
  tabBarTextActive: semantic.tabBarTextActive,
  tabBarIconInactive: semantic.tabBarIconInactive,
  tabBarTextInactive: semantic.tabBarTextInactive,

  // Actions
  shareButton: palette.blue500,
  destructiveAction: palette.angry600,

  // Gallery
  galleryLoadingIndicator: palette.blue500,

  // Warning states
  warningBackground: semantic.warningBackground,
  warningBackgroundDestructive: semantic.warningBackgroundDestructive,
  warningBorderDestructive: semantic.warningBorderDestructive,

  // Input states
  inputBorderHighlight: semantic.inputBorderHighlight,

  // Checkmark
  checkmark: semantic.checkmark,

  // Slider
  sliderThumb: semantic.sliderThumb,
  sliderTrackActive: semantic.sliderTrackActive,
  sliderTrackInactive: semantic.sliderTrackInactive,

  // Chevron
  chevron: semantic.chevron,

  // Tags
  foregroundTagBackground: semantic.foregroundTagBackground,
  foregroundTagText: semantic.foregroundTagText,

  // Status indicators
  statusIcon: semantic.statusIcon,
  statusText: semantic.statusText,

  // Search
  searchIcon: semantic.searchIcon,
} as const
