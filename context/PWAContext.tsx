
import React, { createContext, useContext, useEffect, useState } from 'react';

interface PWAContextType {
  isInstallable: boolean; // True if app is not in standalone mode (show button)
  installPWA: () => Promise<boolean>; // Returns true if native prompt was shown
  isIOS: boolean;
}

const PWAContext = createContext<PWAContextType | undefined>(undefined);

// 1. Global capture to ensure we don't miss the event before React mounts
let globalDeferredPrompt: any = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // Prevent default mini-infobar
    globalDeferredPrompt = e;
    console.log("PWA Event captured globally");
  });
}

export const PWAProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // 1. Detect iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    // 2. Check if already installed (Standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    
    // IF NOT STANDALONE -> WE ARE INSTALLABLE (Show Button)
    setIsInstallable(!isStandalone);

    // 3. Check if we caught the event globally before this component mounted
    if (globalDeferredPrompt) {
        setDeferredPrompt(globalDeferredPrompt);
    }

    // 4. Listen for future events
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      globalDeferredPrompt = e;
      console.log("PWA Event captured in Effect");
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const installPWA = async (): Promise<boolean> => {
    // Android/Desktop Native Prompt
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
          setIsInstallable(false); // Hide button after install
      }
      setDeferredPrompt(null);
      globalDeferredPrompt = null;
      return true; // Native prompt shown
    } 
    return false; // No native prompt available (iOS or Desktop fallback needed)
  };

  return (
    <PWAContext.Provider value={{ isInstallable, installPWA, isIOS }}>
      {children}
    </PWAContext.Provider>
  );
};

export const usePWA = () => {
  const context = useContext(PWAContext);
  if (!context) throw new Error('usePWA must be used within a PWAProvider');
  return context;
};
