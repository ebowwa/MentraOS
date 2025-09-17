import React, { memo, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "./ui/button";
import { AppI } from "../types";

// ... existing code ...

interface AppCardProps {
  app: AppI;
  theme: string;
  isAuthenticated: boolean;
  isWebView: boolean;
  installingApp: string | null;
  onInstall: (packageName: string) => void;
  onUninstall: (packageName: string) => void;
  onOpen: (packageName: string) => void;
  onCardClick: (packageName: string) => void;
  onLogin: () => void;
}

const AppCard: React.FC<AppCardProps> = memo(
  ({
    app,
    theme,
    isAuthenticated,
    isWebView,
    installingApp,
    onInstall,
    onUninstall,
    onOpen,
    onCardClick,
    onLogin,
  }) => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);

    const handleCardClick = () => {
      onCardClick(app.packageName);
    };

    const handleInstallClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onInstall(app.packageName);
    };

    const handleOpenClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onOpen(app.packageName);
    };

    const handleLoginClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onLogin();
    };

    const handleImageLoad = () => {
      setImageLoaded(true);
    };

    const handleImageError = () => {
      setImageError(true);
      setImageLoaded(true);
    };

    return (
      <div
        className="p-4 sm:p-6 flex gap-3 transition-colors rounded-lg relative cursor-pointer"
        onClick={handleCardClick}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = "var(--bg-secondary)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = "transparent")
        }
      >
        <div
          className="absolute bottom-0 left-3 right-3 h-px"
          style={{ backgroundColor: "var(--border-color)" }}
        ></div>

        {/* Image Column */}
        <div className="shrink-0 flex items-start pt-2">
          <div className="relative w-12 h-12">
            {/* Placeholder that shows immediately */}
            <div
              className={`absolute inset-0 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center transition-opacity duration-200 ${
                imageLoaded ? "opacity-0" : "opacity-100"
              }`}
            >
              <div className="w-6 h-6 bg-gray-300 dark:bg-gray-600 rounded-full animate-pulse"></div>
            </div>

            {/* Actual image that loads in background */}
            <img
              src={
                imageError
                  ? "https://placehold.co/48x48/gray/white?text=App"
                  : app.logoURL
              }
              alt={`${app.name} logo`}
              className={`w-12 h-12 object-cover rounded-full transition-opacity duration-200 ${
                imageLoaded ? "opacity-100" : "opacity-0"
              }`}
              loading="lazy"
              decoding="async"
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          </div>
        </div>

        {/* Content Column */}
        <div className="flex-1 flex flex-col justify-center min-w-0">
          <div>
            <h3
              className="text-[15px] font-medium mb-1 truncate"
              style={{
                fontFamily: '"SF Pro Rounded", sans-serif',
                letterSpacing: "0.04em",
                color: "var(--text-primary)",
              }}
            >
              {app.name}
            </h3>

            {app.description && (
              <p
                className="text-[15px] font-normal leading-[1.3] line-clamp-3 break-words"
                style={{
                  fontFamily: '"SF Pro Rounded", sans-serif',
                  letterSpacing: "0.04em",
                  color: theme === "light" ? "#4a4a4a" : "#9A9CAC",
                  WebkitLineClamp: 3,
                  height: "3.9em",
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  wordBreak: "break-word",
                  overflowWrap: "break-word",
                }}
              >
                {app.description}
              </p>
            )}
          </div>
        </div>

        {/* Button Column */}
        <div className="shrink-0 flex items-center">
          {isAuthenticated ? (
            app.isInstalled ? (
              isWebView ? (
                <Button
                  onClick={handleOpenClick}
                  disabled={installingApp === app.packageName}
                  className="text-[15px] font-normal tracking-[0.1em] px-4 py-[6px] rounded-full w-fit h-fit"
                  style={{
                    backgroundColor: "var(--button-bg)",
                    color: "var(--button-text)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      "var(--button-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--button-bg)")
                  }
                >
                  Open
                </Button>
              ) : (
                <Button
                  disabled={true}
                  className="text-[15px] font-normal tracking-[0.1em] px-4 py-[6px] rounded-full w-fit h-fit opacity-30 cursor-not-allowed"
                  style={{
                    backgroundColor: "var(--button-bg)",
                    color: "var(--button-text)",
                    filter: "grayscale(100%)",
                  }}
                >
                  Installed
                </Button>
              )
            ) : (
              <Button
                onClick={handleInstallClick}
                disabled={installingApp === app.packageName}
                className="text-[15px] font-normal tracking-[0.1em] px-4 py-[6px] rounded-full w-fit h-fit"
                style={{
                  backgroundColor: "var(--button-bg)",
                  color: "var(--button-text)",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "var(--button-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--button-bg)")
                }
              >
                {installingApp === app.packageName ? (
                  <>
                    <div
                      className="animate-spin h-4 w-4 border-2 border-t-transparent rounded-full mr-2"
                      style={{
                        borderColor: "var(--button-text)",
                        borderTopColor: "transparent",
                      }}
                    ></div>
                    Installing
                  </>
                ) : (
                  "Get"
                )}
              </Button>
            )
          ) : (
            <Button
              onClick={handleLoginClick}
              className="text-[15px] font-normal tracking-[0.1em] px-4 py-[6px] rounded-full w-fit h-fit flex items-center gap-2"
              style={{
                backgroundColor: "var(--button-bg)",
                color: "var(--button-text)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "var(--button-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "var(--button-bg)")
              }
            >
              <Lock className="h-4 w-4 mr-1" />
              Sign in
            </Button>
          )}
        </div>
      </div>
    );
  },
);

AppCard.displayName = "AppCard";

export default AppCard;
