
import React, { useState, useEffect } from 'react';
import { X, Smartphone, Share, PlusSquare } from 'lucide-react';
import { usePWA } from '../context/PWAContext';

export const InstallPWA: React.FC = () => {
  const { isInstallable, installPWA, isIOS } = usePWA();
  const [isVisible, setIsVisible] = useState(false);

  // Auto-show popup if installable (can limit this logic if user only wants the button)
  useEffect(() => {
    if (isInstallable) {
        // Optional: Add delay or check local storage if user dismissed it before
        setIsVisible(true);
    } else {
        setIsVisible(false);
    }
  }, [isInstallable]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:bottom-8 md:right-8 md:left-auto md:w-96 bg-gray-900 border border-gold-500/40 p-4 rounded-2xl shadow-2xl z-[100] animate-slide-up backdrop-blur-xl">
       <div className="flex items-start justify-between gap-4">
           <div className="flex gap-4">
                <div className="p-3 bg-gradient-to-br from-gold-500 to-amber-600 rounded-xl text-black shadow-lg shadow-gold-500/20 shrink-0 h-12 w-12 flex items-center justify-center">
                    <Smartphone size={24} strokeWidth={2.5} />
                </div>
                <div>
                    <h4 className="font-bold text-gray-100 text-sm">Install App</h4>
                    {isIOS ? (
                         <div className="text-xs text-gray-400 mt-2 space-y-1.5">
                             <p>Install on iPhone/iPad:</p>
                             <div className="flex items-center gap-1.5"><Share size={12} className="text-blue-400" /> <span>Tap <b>Share</b></span></div>
                             <div className="flex items-center gap-1.5"><PlusSquare size={12} className="text-gray-300" /> <span>Select <b>Add to Home Screen</b></span></div>
                         </div>
                    ) : (
                        <p className="text-xs text-gray-400 mt-1">Add to Home Screen for fast access and offline capability.</p>
                    )}
                </div>
           </div>
           
           <button 
             onClick={() => setIsVisible(false)} 
             className="text-gray-500 hover:text-white transition-colors p-1"
           >
             <X size={20} />
           </button>
       </div>

       {!isIOS && (
           <button 
             onClick={installPWA} 
             className="w-full mt-4 py-2.5 bg-gold-500 hover:bg-gold-400 text-black text-xs font-bold rounded-lg transition-colors shadow-lg shadow-gold-500/20"
           >
             Install Now
           </button>
       )}
    </div>
  );
};
