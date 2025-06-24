import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from './ui/button';

const Header: React.FC = () => {
  const { isAuthenticated, signOut, user, isWebViewAuth } = useAuth();
  const navigate = useNavigate();

  // Handle sign out
  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-10 bg-gradient-to-b from-[#0c0d27] to-[#030514]">
      <div className="container mx-auto px-4 py-4 border-b border-[#0c0c25]">
        <div className="flex items-end justify-between">

          {/* Logo and Site Name */}
          <div className="flex flex-col items-start select-none">
            <span
              className="text-[26px] text-[#F1F1F1] font-light"
              style={{ fontFamily: '"SF Pro Rounded", sans-serif', letterSpacing: '0.06em' }}
            >
              AugmentOS
            </span>
          </div>
          
          {/* Authentication */}
          {!isWebViewAuth && (
            <div className="flex items-center">
              {isAuthenticated ? (
                <div className="flex flex-col items-end">
                  {/* {user?.email && (
                    <span className="text-sm text-gray-600 px-3">
                      {user.email}
                    </span>
                  )} */}
                  <Button
                    onClick={handleSignOut}
                    variant="outline"
                    className="rounded-full border-[1.5px] border-[#C0C4FF] text-[#C0C4FF]"
                  >
                    Sign Out
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => navigate('/login')}
                  variant="outline"
                  className="rounded-full border-[1.5px] border-[#C0C4FF] text-[#C0C4FF]"
                >
                  Sign In
                </Button>
              )}
            </div>
          )}
          
        </div>
      </div>
    </header>
  );
};

export default Header;