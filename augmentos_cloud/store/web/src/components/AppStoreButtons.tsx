import React from 'react';

interface AppStoreButtonsProps {
  className?: string;
  size?: 'small' | 'medium' | 'large';
}

const AppStoreButtons: React.FC<AppStoreButtonsProps> = ({ 
  className = '', 
  size = 'medium' 
}) => {
  const sizes = {
    small: 'h-8',
    medium: 'h-10', 
    large: 'h-12'
  };

  const buttonHeight = sizes[size];

  const handleGooglePlayClick = () => {
    window.open('https://play.google.com/store/apps/details?id=com.augmentos.manager', '_blank');
  };

  const handleiOSClick = () => {
    window.open('https://apps.apple.com/app/mentraos-manager/id6670486393', '_blank');
  };

  return (
    <div className={`flex items-center gap-4 sm:gap-3 ${className}`}>
      <button
        onClick={handleiOSClick}
        className="transition-opacity hover:opacity-80"
        aria-label="Download MentraOS on App Store"
      >
        <img
          src="/app-icons/ios.svg"
          alt="Download on the App Store"
          className={`${buttonHeight} w-auto`}
        />
      </button>
      <button
        onClick={handleGooglePlayClick}
        className="transition-opacity hover:opacity-80"
        aria-label="Download MentraOS on Google Play"
      >
        <img
          src="/app-icons/googleplay.png"
          alt="Get it on Google Play"
          className={`${buttonHeight} w-auto`}
        />
      </button>
    </div>
  );
};

export default AppStoreButtons;