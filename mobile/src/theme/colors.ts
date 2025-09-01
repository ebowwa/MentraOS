const palette = {
  // Neutrals
  neutral100: "#FFFFFF",
  neutral200: "#F4F2F1",
  neutral300: "#D7CEC9",
  neutral400: "#B6ACA6",
  neutral500: "#978F8A",
  neutral600: "#564E4A",
  neutral700: "#3C3836",
  neutral800: "#191015",
  neutral900: "#000000",

  // Primary
  primary100: "#DCDDE9",
  primary200: "#E0E0E0",
  primary300: "#9196B9",
  primary400: "#626894",
  primary500: "#41476E",
  primary600: "#21476E",

  // Secondary
  secondary100: "#DCDDE9",
  secondary200: "#BCC0D6",
  secondary300: "#9196B9",
  secondary400: "#626894",
  secondary500: "#41476E",

  // Accent
  accent100: "#FFEED4",
  accent200: "#FFE1B2",
  accent300: "#FDD495",
  accent400: "#FBC878",
  accent500: "#FFBB50",

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
  blue700: "#1565C0",
  blue800: "#0D47A1",

  // Grays
  gray100: "#F5F5F5",
  gray200: "#EEEEEE",
  gray300: "#E0E0E0",
  gray350: "#CECECE",
  gray400: "#BDBDBD",
  gray500: "#9E9E9E",
  gray600: "#757575",
  gray700: "#616161",
  gray800: "#424242",
  gray900: "#212121",
  lightGray: "#CCCCCC",
  mediumGray: "#999999",

  // Success
  success100: "#22C55E",
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
  lightBackground: "#F9F9F9",
  blueTintedWhite: "#F8FAFF",
  borderGray: "#E4E8EE",
  darkGalleryBg: "#121212",
  lightGalleryBg: "#f0f0f0",
  warmGradient1: "#F5E6D3",
  warmGradient2: "#FEFCFA",
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
  tagBackground: "rgba(66, 64, 209, 0.1)",
} as const

const semantic = {
  // Tab bar colors
  tabBarGradientStart: palette.blueTintedWhite,
  tabBarGradientEnd: palette.blueTintedWhite,
  altTabBarGradientStart: palette.warmGradient1,
  altTabBarGradientEnd: palette.warmGradient2,

  // Button gradients
  buttonGradientStart: palette.purpleBlue1,
  buttonGradientEnd: palette.purpleBlue2,

  // Warning colors
  warningBackground: palette.warningPink,
  warningBackgroundDestructive: palette.warningPinkStrong,
  warningBorderDestructive: palette.warningPinkBorder,
  warningPink: palette.angry600,

  // Input states
  inputBorderHighlight: palette.mediumBlue,

  // Button pill variants
  buttonPillPrimary: palette.purpleBlue4,
  buttonPillSecondary: palette.transparent,
  buttonPillSecondaryBorder: palette.purpleBlue3,
  buttonPillIcon: palette.primary200,
  buttonPillPrimaryText: palette.white,
  buttonPillSecondaryText: palette.darkText1,
  buttonPillIconText: palette.darkText2,

  // Gallery
  galleryBg: palette.lightGalleryBg,

  // Switch/toggle states
  switchTrackOff: palette.lightPurple1,
  switchTrackOn: palette.purpleBlue7,
  switchThumb: palette.neutral100,
  switchThumbOn: palette.neutral100,
  switchThumbOff: palette.neutral100,
  switchBorder: palette.purpleBlue3,
  switchBorderWidth: 2,

  // Slider states
  sliderThumb: palette.gray700,
  sliderTrackActive: palette.primary300,
  sliderTrackInactive: palette.neutral300,

  // Tab bar states
  tabBarIconActive: palette.purpleBlue3,
  tabBarTextActive: palette.purpleBlue5,
  tabBarIconInactive: palette.purpleGray1,
  tabBarTextInactive: palette.purpleGray2,

  // List items
  chevron: palette.purpleGray3,

  // Tags
  foregroundTagBackground: palette.tagBackground,
  foregroundTagText: palette.purpleBlue6,

  // Status indicators
  statusIcon: palette.purpleGray1,
  statusText: palette.darkText1,

  // Checkmark
  checkmark: palette.blue500,

  // Search
  searchIcon: palette.purpleBlue3,

  // Backgrounds
  backgroundGradient1: palette.neutral600,
  backgroundGradient2: palette.primary100,
  loginGradientStart: palette.blue100,
  loginGradientEnd: palette.neutral100,
} as const

export const colors = {
  palette,
  transparent: palette.transparent,
  trueBlack: palette.black,
  trueWhite: palette.white,

  // Text colors
  text: palette.neutral900,
  textDim: palette.neutral700,
  textAlt: palette.neutral200,

  // Backgrounds
  background: palette.lightBackground,
  modalBackground: palette.neutral100,
  galleryBackground: semantic.galleryBg,
  fullscreenBackground: palette.neutral900,
  backgroundGradient1: semantic.backgroundGradient1,
  backgroundGradient2: semantic.backgroundGradient2,

  // Borders
  border: palette.borderGray,
  borderLight: palette.overlay10,

  // Primary colors
  tint: palette.primary500,
  tintInactive: palette.neutral300,
  separator: palette.neutral300,

  // Error states
  error: palette.angry500,
  errorBackground: palette.angry100,

  // Login screen
  loginGradientStart: semantic.loginGradientStart,
  loginGradientEnd: semantic.loginGradientEnd,

  // Buttons
  buttonPrimary: semantic.buttonPillPrimary,
  buttonSecondary: palette.blue500,
  buttonDisabled: palette.lightGray,
  buttonDanger: palette.angry500,
  buttonPressed: palette.gray200,

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
  pickerBackground: palette.whiteOverlay70,

  // Success states
  success: palette.success500,

  // Switch/toggle
  switchTrackOff: semantic.switchTrackOff,
  switchTrackOn: semantic.switchTrackOn,
  switchThumb: semantic.switchThumb,
  switchThumbOn: semantic.switchThumbOn,
  switchThumbOff: semantic.switchThumbOff,
  switchBorder: semantic.switchBorder,
  switchBorderWidth: semantic.switchBorderWidth,

  // Icons
  icon: palette.neutral800,
  iconSecondary: palette.neutral700,

  // Tab bar
  tabBarBackground1: semantic.tabBarGradientStart,
  tabBarBackground2: semantic.tabBarGradientEnd,
  tabBarBackground: palette.blueTintedWhite,
  altTabBarBackground1: semantic.altTabBarGradientStart,
  altTabBarBackground2: semantic.altTabBarGradientEnd,
  tabBarIconActive: semantic.tabBarIconActive,
  tabBarTextActive: semantic.tabBarTextActive,
  tabBarIconInactive: semantic.tabBarIconInactive,
  tabBarTextInactive: semantic.tabBarTextInactive,

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
