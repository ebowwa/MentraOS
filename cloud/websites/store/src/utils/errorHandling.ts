/**
 * Utility functions for handling various error types in the store app
 */

/**
 * Formats hardware compatibility error messages from API responses
 * @param error The error object from a failed API call
 * @returns A user-friendly error message if it's a compatibility error, null otherwise
 */
export const formatCompatibilityError = (error: any): string | null => {
  try {
    // Check if this is a compatibility error with detailed information
    if (error?.response?.data?.compatibility) {
      const compatibility = error.response.data.compatibility;

      // Use the backend's generated message if available
      if (compatibility.message) {
        return compatibility.message;
      }

      // Fallback: generate message from missing required hardware
      if (
        compatibility.missingRequired &&
        compatibility.missingRequired.length > 0
      ) {
        const missingItems = compatibility.missingRequired.map((req: any) => {
          const hardwareName = req.type.toLowerCase().replace("_", " ");
          return req.description || `${hardwareName}`;
        });

        if (missingItems.length === 1) {
          return `This app requires ${missingItems[0]} which is not available on your connected glasses`;
        } else {
          return `This app requires ${missingItems.slice(0, -1).join(", ")} and ${missingItems[missingItems.length - 1]} which are not available on your connected glasses`;
        }
      }
    }

    // Check for generic compatibility error message
    if (
      error?.response?.data?.message &&
      error.response.data.message.includes("incompatible")
    ) {
      return error.response.data.message;
    }

    return null;
  } catch (e) {
    console.error("Error parsing compatibility information:", e);
    return null;
  }
};

/**
 * Gets a user-friendly error message from an API error response
 * @param error The error object from a failed API call
 * @param fallbackMessage Default message if no specific error can be extracted
 * @returns A user-friendly error message
 */
export const getErrorMessage = (
  error: any,
  fallbackMessage: string = "An error occurred",
): string => {
  // First try to get compatibility-specific error
  const compatibilityError = formatCompatibilityError(error);
  if (compatibilityError) {
    return compatibilityError;
  }

  // Fall back to generic API error message
  return error?.response?.data?.message || fallbackMessage;
};
