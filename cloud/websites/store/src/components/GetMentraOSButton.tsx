import React from 'react';
import { useTheme } from '../hooks/useTheme';
import { openAppStore, isAndroid, isIOS, isMacOS } from '../utils/mobile';
import { Button } from './ui/button';

interface GetMentraOSButtonProps {
  className?: string;
  size?: 'small' | 'medium' | 'large';
  variant?: 'default' | 'outline';
}

const GetMentraOSButton: React.FC<GetMentraOSButtonProps> = ({ 
  className = '', 
  size = 'medium',
  variant = 'default'
}) => {
  const { theme } = useTheme();

  const handleClick = () => {
    openAppStore();
  };

  // Size configurations
  const sizeClasses = {
    small: 'h-9 px-4 py-2 text-sm',
    medium: 'h-10 px-4 text-sm',
    large: 'h-12 px-6 text-base'
  };

  const iconSizes = {
    small: 'h-4 w-4',
    medium: 'h-5 w-5',
    large: 'h-6 w-6'
  };

  // Always use white icon since button uses CSS variables with white text
  const iconSrc = '/icon_white.svg';

  return (
    <Button
      onClick={handleClick}
      variant={variant}
      className={`
        ${sizeClasses[size]} 
        rounded-full 
        flex 
        items-center 
        gap-2 
        transition-all 
        duration-200 
        ${className}
      `}
      style={{
        backgroundColor: 'var(--button-bg)',
        color: 'var(--button-text)',
        border: 'none'
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--button-hover)'}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--button-bg)'}
      aria-label="Download MentraOS"
    >
      <img 
        src={iconSrc}
        alt="MentraOS" 
        className={iconSizes[size]}
      />
      Get MentraOS
    </Button>
  );
};

export default GetMentraOSButton;