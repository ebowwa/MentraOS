// Example of how to use the platform detection
import React from 'react';
import { usePlatform } from '../hooks/usePlatform';

export const PlatformExample: React.FC = () => {
  const { platform, isMobile, isDesktop, isWebView } = usePlatform();

  return (
    <div>
      {/* Show different content based on platform */}
      {isWebView && (
        <div>This is optimized for webview display</div>
      )}
      
      {isMobile && !isWebView && (
        <div>Mobile browser experience</div>
      )}
      
      {isDesktop && (
        <div>Full desktop experience</div>
      )}

      {/* Platform-specific styling */}
      <button
        className={`
          ${isWebView ? 'fixed bottom-4 left-4 right-4' : ''}
          ${isMobile ? 'w-full py-3' : 'px-6 py-2'}
          ${isDesktop ? 'hover:shadow-lg' : ''}
        `}
      >
        Action Button
      </button>

      {/* Conditional features */}
      {!isWebView && (
        <div className="auth-section">
          {/* Show auth UI only on desktop/mobile browsers */}
        </div>
      )}

      {/* Debug info (remove in production) */}
      <div className="text-xs text-gray-500">
        Platform: {platform}
      </div>
    </div>
  );
};