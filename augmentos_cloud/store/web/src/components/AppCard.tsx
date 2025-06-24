import React, { useState } from 'react';
import { X, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AppI } from '../types';
import { Button } from '@/components/ui/button';
import api from '../api';
import { toast } from 'sonner';

interface AppCardProps {
  app: AppI;
  isInstalling: boolean;
  onInstall: (packageName: string) => void;
  onOpen: (packageName: string) => void;
}

const AppCard: React.FC<AppCardProps> = ({ app, isInstalling, onInstall, onOpen }) => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [showModal, setShowModal] = useState(false);

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleCardClick = () => {
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  return (
    <>
      {/* Custom Scrollbar Styles */}
      <style>
        {`
          .custom-scrollbar::-webkit-scrollbar {
            width: 3px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #242454;
            border-radius: 1px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #2d2f5a;
          }
        `}
      </style>
      
      {/* App Card */}
      <div className="p-6 flex gap-3 border-b border-[#0c0d24]">
        {/* Image Column */}
        <div className="shrink-0 flex items-start justify-center pt-5">
          <img
            src={app.logoURL}
            alt={`${app.name} logo`}
            className="w-16 h-16 object-cover rounded-full mr-5"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://placehold.co/64x64/gray/white?text=App';
            }}
          />
        </div>
        
        {/* Content Column */}
        <div className="flex-1 flex flex-col">
          <div className="cursor-pointer" onClick={handleCardClick}>
            <h3 className="text-[15px] text-white font-medium mb-1" style={{fontFamily: '"SF Pro Rounded", sans-serif', letterSpacing: '0.04em'}}>{app.name}</h3>
            {app.description && (
              <p className="text-[15px] text-[#9A9CAC] font-normal leading-[1.3] line-clamp-2 mb-3" style={{fontFamily: '"SF Pro Rounded", sans-serif', letterSpacing: '0.04em'}}>{app.description}</p>
            )}
          </div>

          {/* Action button */}
          {isAuthenticated ? (
            app.isInstalled ? (
              <Button
                onClick={() => onOpen(app.packageName)}
                disabled={isInstalling}
                className="bg-[#242454] text-white text-[15px] font-normal px-8 py-2.5 rounded-full w-fit" style={{fontFamily: '"SF Pro Rounded", sans-serif', letterSpacing: '0.04em'}}
              >
                Open
              </Button>
            ) : (
              <Button
                onClick={() => onInstall(app.packageName)}
                disabled={isInstalling}
                className="bg-[#242454] text-white text-[15px] font-normal px-8 py-2.5 rounded-full w-fit" style={{fontFamily: '"SF Pro Rounded", sans-serif', letterSpacing: '0.04em'}}
              >
                {isInstalling ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                    Installing
                  </>
                ) : (
                  'Get'
                )}
              </Button>
            )
          ) : (
            <Button
              onClick={() => navigate('/login')}
              className="bg-[#242454] text-white text-[15px] font-normal px-8 py-2.5 rounded-full w-fit flex items-center gap-2" style={{fontFamily: '"SF Pro Rounded", sans-serif', letterSpacing: '0.04em'}}
            >
              <Lock className="h-4 w-4 mr-1" />
              Sign in
            </Button>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-50 p-4 backdrop-blur-[4px]" 
          style={{backgroundColor: 'rgba(3, 5, 20, 0.70)'}}
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-modal-title"
        >
          <div 
            className="w-full max-w-[90vw] md:w-[720px] md:max-w-[720px] max-h-[90vh] overflow-y-auto rounded-[24px] custom-scrollbar relative" 
            style={{
              background: 'linear-gradient(180deg, #0A0B19 0%, #080B27 100%)',
              boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.1), inset 0 0 32px rgba(0, 0, 0, 0.25)',
              padding: '48px 48px 56px',
              scrollbarWidth: 'thin',
              scrollbarColor: '#242454 transparent'
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-8 max-[840px]:flex-col max-[840px]:items-center max-[840px]:gap-6">
              {/* Close button for mobile - positioned absolutely */}
              <button
                onClick={handleCloseModal}
                className="text-[#9CA3AF] hover:text-white transition-colors hidden max-[840px]:block absolute top-4 right-4"
                aria-label="Close modal"
              >
                <X className="h-6 w-6" />
              </button>
              
              <div className="flex items-center gap-4 max-[840px]:flex-col max-[840px]:items-center max-[840px]:gap-4">
                <img
                  src={app.logoURL}
                  alt={`${app.name} logo`}
                  className="w-16 h-16 object-cover rounded-full"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://placehold.co/64x64/gray/white?text=App';
                  }}
                />
                <h2 
                  id="app-modal-title"
                  className="text-[32px] text-[#E4E4E7] font-medium leading-[1.2] max-[840px]:text-center" 
                  style={{fontFamily: '"SF Pro Rounded", sans-serif', letterSpacing: '0.02em'}}
                >
                  {app.name}
                </h2>
              </div>
              <div className="flex items-center gap-4 max-[840px]:w-full max-[840px]:justify-center">
                {isAuthenticated ? (
                  app.isInstalled ? (
                    <Button
                      onClick={() => onOpen(app.packageName)}
                      disabled={isInstalling}
                      className="w-[140px] h-[40px] bg-[#353574] hover:bg-[#404080] text-[#E2E4FF] text-[16px] font-normal rounded-full" 
                      style={{fontFamily: '"SF Pro Rounded", sans-serif'}}
                    >
                      Open
                    </Button>
                  ) : (
                    <Button
                      onClick={() => onInstall(app.packageName)}
                      disabled={isInstalling}
                      className="w-[140px] h-[40px] bg-[#242454] text-[#E2E4FF] text-[16px] font-normal rounded-full" 
                      style={{fontFamily: '"SF Pro Rounded", sans-serif'}}
                    >
                      {isInstalling ? 'Installing...' : 'Get App'}
                    </Button>
                  )
                ) : (
                  <Button
                    onClick={() => navigate('/login')}
                    className="w-[140px] h-[40px] bg-[#242454] text-[#E2E4FF] text-[16px] font-normal rounded-full" 
                    style={{fontFamily: '"SF Pro Rounded", sans-serif'}}
                  >
                    Get App
                  </Button>
                )}
                {/* Close button for desktop */}
                <button
                  onClick={handleCloseModal}
                  className="text-[#9CA3AF] hover:text-white transition-colors ml-4 max-[840px]:hidden"
                  aria-label="Close modal"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex flex-col h-full">
              {/* Description */}
              <div className="mb-12">
                <p 
                  className="text-[16px] text-[#E4E4E7] font-normal leading-[1.6] max-w-[480px]" 
                  style={{fontFamily: '"SF Pro Rounded", sans-serif'}}
                >
                  {app.description || 'No description available.'}
                </p>
              </div>

              {/* Information Section */}
              <div className="mb-12">
                <h3 
                  className="text-[12px] text-[#9CA3AF] font-semibold uppercase mb-6" 
                  style={{fontFamily: '"SF Pro Rounded", sans-serif', letterSpacing: '0.05em'}}
                >
                  Information
                </h3>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span 
                      className="text-[14px] text-[#9CA3AF] font-medium" 
                      style={{fontFamily: '"SF Pro Rounded", sans-serif'}}
                    >
                      Company
                    </span>
                    <span 
                      className="text-[14px] text-[#E4E4E7] font-normal text-right" 
                      style={{fontFamily: '"SF Pro Rounded", sans-serif'}}
                    >
                      {app.orgName || app.developerProfile?.company || 'Mentra'}
                    </span>
                  </div>
                  
                  {app.developerProfile?.website && (
                    <div className="flex justify-between items-center">
                      <span 
                        className="text-[14px] text-[#9CA3AF] font-medium" 
                        style={{fontFamily: '"SF Pro Rounded", sans-serif'}}
                      >
                        Website
                      </span>
                      <a 
                        href={app.developerProfile.website} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-[14px] text-[#E4E4E7] font-normal text-right hover:underline" 
                        style={{fontFamily: '"SF Pro Rounded", sans-serif'}}
                      >
                        {app.developerProfile.website}
                      </a>
                    </div>
                  )}
                  
                  {app.developerProfile?.contactEmail && (
                    <div className="flex justify-between items-center">
                      <span 
                        className="text-[14px] text-[#9CA3AF] font-medium" 
                        style={{fontFamily: '"SF Pro Rounded", sans-serif'}}
                      >
                        Contact
                      </span>
                      <a 
                        href={`mailto:${app.developerProfile.contactEmail}`} 
                        className="text-[14px] text-[#E4E4E7] font-normal text-right hover:underline" 
                        style={{fontFamily: '"SF Pro Rounded", sans-serif'}}
                      >
                        {app.developerProfile.contactEmail}
                      </a>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center">
                    <span 
                      className="text-[14px] text-[#9CA3AF] font-medium" 
                      style={{fontFamily: '"SF Pro Rounded", sans-serif'}}
                    >
                      App Type
                    </span>
                    <span 
                      className="text-[14px] text-[#E4E4E7] font-normal text-right capitalize" 
                      style={{fontFamily: '"SF Pro Rounded", sans-serif'}}
                    >
                      {app.tpaType || 'Standard'}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span 
                      className="text-[14px] text-[#9CA3AF] font-medium" 
                      style={{fontFamily: '"SF Pro Rounded", sans-serif'}}
                    >
                      Package
                    </span>
                    <span 
                      className="text-[14px] text-[#E4E4E7] font-normal text-right" 
                      style={{fontFamily: '"SF Pro Rounded", sans-serif'}}
                    >
                      {app.packageName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Required Permissions Section */}
              <div >
                <h3 
                  className="text-[12px] text-[#9CA3AF] font-semibold uppercase mb-6" 
                  style={{fontFamily: '"SF Pro Rounded", sans-serif', letterSpacing: '0.05em'}}
                >
                  Required Permissions
                </h3>
                <div className="space-y-3">
                  {app.permissions && app.permissions.length > 0 ? (
                    app.permissions.map((permission, index) => (
                      <div 
                        key={index} 
                        className="text-[14px] text-[#9CA3AF] font-normal leading-[1.5]" 
                        style={{fontFamily: '"SF Pro Rounded", sans-serif'}}
                      >
                        <strong className="text-[#E4E4E7]">{permission.type || 'Microphone'}</strong> {permission.description || 'For voice import and audio processing.'}
                      </div>
                    ))
                  ) : (
                    <div 
                      className="text-[14px] text-[#9CA3AF] font-normal" 
                      style={{fontFamily: '"SF Pro Rounded", sans-serif'}}
                    >
                      None
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AppCard; 