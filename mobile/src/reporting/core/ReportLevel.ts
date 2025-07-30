/**
 * Enum defining different levels of reporting
 */
export enum ReportLevel {
  DEBUG = "debug",
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
  CRITICAL = "critical",
}

/**
 * Helper function to check if a level is at least as severe as another
 */
export const isAtLeast = (level: ReportLevel, minimumLevel: ReportLevel): boolean => {
  const levels = {
    [ReportLevel.DEBUG]: 0,
    [ReportLevel.INFO]: 1,
    [ReportLevel.WARNING]: 2,
    [ReportLevel.ERROR]: 3,
    [ReportLevel.CRITICAL]: 4,
  }
  
  return levels[level] >= levels[minimumLevel]
} 