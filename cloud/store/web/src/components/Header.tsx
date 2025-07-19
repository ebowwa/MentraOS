import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { usePlatform } from '../hooks/usePlatform';
import { useTheme } from '../hooks/useTheme';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { useSearch } from '../contexts/SearchContext';
import { Button } from './ui/button';
import { Baseline } from 'lucide-react';
import AppStoreButtons from './AppStoreButtons';
import SearchBar from './SearchBar';

interface HeaderProps {
  onSearch?: (e: React.FormEvent) => void;
  onSearchClear?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onSearch, onSearchClear }) => {
  const { isAuthenticated, signOut, user } = useAuth();
  const { isWebView } = usePlatform();
  const { theme } = useTheme();
  const { searchQuery, setSearchQuery } = useSearch();
  const navigate = useNavigate();
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const isStorePage = location.pathname === '/';

  // Handle sign out
  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  // Don't show header in webview
  if (isWebView) {
    return null;
  }

  return (
    <header 
      className="sticky top-0 z-10" 
      style={{ 
        background: theme === 'light' ? '#ffffff' : 'linear-gradient(to bottom, #0c0d27, #030514)', 
        borderBottom: `1px solid var(--border-color)` 
      }}
    >
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">

          {/* Logo, Site Name and App Store Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 select-none">
            {/* Logo and Site Name */}
            <div className="flex items-center gap-3 select-none" style={{ minWidth: isDesktop ? '200px' : 'auto' }}>
              <img 
                src={theme === 'light' ? '/icon_black.svg' : '/icon_white.svg'} 
                alt="Mentra Logo" 
                className="h-8 w-8"
              />
              <span
                className="text-[26px] font-light"
                style={{ 
                  fontFamily: '"SF Pro Rounded", sans-serif', 
                  letterSpacing: '0.06em', 
                  color: 'var(--text-primary)' 
                }}
              >
                Mentra Store
              </span>
            </div>
            
            {/* App Store Buttons - below on mobile, to the right on desktop */}
            <div className="mt-2 sm:mt-0 -translate-y-1 sm:translate-y-0">
              <AppStoreButtons size="small" />
            </div>
          </div>

          {/* Search bar on desktop for store page */}
          {isDesktop && isStorePage && onSearch && (
            <div className="flex-1 max-w-md mx-auto">
              <SearchBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onSearchSubmit={onSearch}
                onClear={onSearchClear || (() => setSearchQuery(''))}
              />
            </div>
          )}

          {/* Authentication */}
          <div className="flex items-center justify-end" style={{ minWidth: isDesktop ? '200px' : 'auto' }}>
            {isAuthenticated ? (
              <div className="flex flex-col items-end">
                {/* Uncomment if you want to show user email
                {user?.email && (
                  <span className="text-sm text-gray-600 px-3">
                    {user.email}
                  </span>
                )} */}
                <Button
                  onClick={handleSignOut}
                  variant={theme === 'light' ? 'default' : 'outline'}
                  className="rounded-full border-[1.5px]"
                  style={{ 
                    backgroundColor: theme === 'light' ? '#000000' : 'transparent',
                    borderColor: theme === 'light' ? '#000000' : '#C0C4FF',
                    color: theme === 'light' ? '#ffffff' : '#C0C4FF'
                  }}
                >
                  Sign Out
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => navigate('/login')}
                variant={theme === 'light' ? 'default' : 'outline'}
                className="rounded-full border-[1.5px]"
                style={{ 
                  backgroundColor: theme === 'light' ? '#000000' : 'transparent',
                  borderColor: theme === 'light' ? '#000000' : '#C0C4FF',
                  color: theme === 'light' ? '#ffffff' : '#C0C4FF'
                }}
              >
                Sign In
              </Button>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};

export default Header;