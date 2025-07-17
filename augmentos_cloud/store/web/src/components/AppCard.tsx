import React, { memo } from 'react';
import { Lock } from 'lucide-react';
import { Button } from './ui/button';
import { AppI } from '../types';

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

const AppCard: React.FC<AppCardProps> = memo(({
  app,
  theme,
  isAuthenticated,
  isWebView,
  installingApp,
  onInstall,
  onUninstall,
  onOpen,
  onCardClick,
  onLogin
}) => {
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

  return (
    <div 
      className="p-4 sm:p-6 flex gap-3 transition-colors rounded-lg relative cursor-pointer" 
      onClick={handleCardClick}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'} 
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
    >
      <div className="absolute bottom-0 left-3 right-3 h-px" style={{ backgroundColor: 'var(--border-color)' }}></div>
      
      {/* Image Column */}
      <div className="shrink-0 flex items-start pt-2">
        <img
          src={app.logoURL}
          alt={`${app.name} logo`}
          className="w-12 h-12 object-cover rounded-full"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://placehold.co/48x48/gray/white?text=App';
          }}
        />
      </div>

      {/* Content Column */}
      <div className="flex-1 flex flex-col justify-center">
        <div>
          <h3 className="text-[15px] font-medium mb-1" style={{
            fontFamily: '"SF Pro Rounded", sans-serif', 
            letterSpacing: '0.04em', 
            color: 'var(--text-primary)'
          }}>
            {app.name}
          </h3>
          {app.description && (
            <p className="text-[15px] font-normal leading-[1.3] line-clamp-3" style={{
              fontFamily: '"SF Pro Rounded", sans-serif', 
              letterSpacing: '0.04em', 
              color: theme === 'light' ? '#4a4a4a' : '#9A9CAC', 
              WebkitLineClamp: 3, 
              height: '3.9em', 
              display: '-webkit-box', 
              WebkitBoxOrient: 'vertical', 
              overflow: 'hidden'
            }}>
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
                  backgroundColor: 'var(--button-bg)',
                  color: 'var(--button-text)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--button-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--button-bg)'}
              >
                Open
              </Button>
            ) : (
              <Button
                disabled={true}
                className="text-[15px] font-normal tracking-[0.1em] px-4 py-[6px] rounded-full w-fit h-fit opacity-30 cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--button-bg)',
                  color: 'var(--button-text)',
                  filter: 'grayscale(100%)'
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
                backgroundColor: 'var(--button-bg)',
                color: 'var(--button-text)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--button-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--button-bg)'}
            >
              {installingApp === app.packageName ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-t-transparent rounded-full mr-2" style={{ 
                    borderColor: 'var(--button-text)', 
                    borderTopColor: 'transparent' 
                  }}></div>
                  Installing
                </>
              ) : (
                'Get'
              )}
            </Button>
          )
        ) : (
          <Button
            onClick={handleLoginClick}
            className="text-[15px] font-normal tracking-[0.1em] px-4 py-[6px] rounded-full w-fit h-fit flex items-center gap-2"
            style={{
              backgroundColor: 'var(--button-bg)',
              color: 'var(--button-text)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--button-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--button-bg)'}
          >
            <Lock className="h-4 w-4 mr-1" />
            Sign in
          </Button>
        )}
      </div>
    </div>
  );
});

AppCard.displayName = 'AppCard';

export default AppCard;