
import React from 'react';

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className = "w-10 h-10", showText = true }) => {
  return (
    <div className="flex items-center gap-3 select-none">
      <div className={`${className} relative flex-shrink-0 group`}>
        {/* Glow behind the globe */}
        <div className="absolute inset-0 bg-gold-500/20 blur-xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>
        <img 
            src="https://iili.io/fe0Q41I.png" 
            alt="Tarmi Finance Logo" 
            className="w-full h-full object-contain drop-shadow-2xl relative z-10"
        />
      </div>
      {showText && (
        <div className="flex flex-col justify-center">
            <span className="font-serif font-bold text-xl tracking-wide text-gray-100 leading-none drop-shadow-lg">TARMI</span>
            <span className="text-[10px] font-bold text-gold-400 uppercase tracking-[0.3em] leading-none mt-1 ml-0.5">FINANCE</span>
        </div>
      )}
    </div>
  );
};
