import React from 'react';

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className = "w-8 h-8", showText = true }) => {
  return (
    <div className="flex items-center gap-2">
      <div className={`${className} bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/50 relative overflow-hidden`}>
        {/* Abstract Icon representing growth/finance */}
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-2/3 h-2/3">
          <path d="M8 30H14V18H8V30Z" fill="currentColor" fillOpacity="0.8"/>
          <path d="M17 30H23V12H17V30Z" fill="currentColor" fillOpacity="0.9"/>
          <path d="M26 30H32V6H26V30Z" fill="white"/>
          <path d="M6 34H34" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      {showText && (
        <div className="flex flex-col">
            <span className="font-bold text-lg tracking-tight text-white leading-none">Tarmi</span>
            <span className="text-[10px] font-medium text-blue-400 uppercase tracking-widest leading-none mt-0.5">FinTrack</span>
        </div>
      )}
    </div>
  );
};
