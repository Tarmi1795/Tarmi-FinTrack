
import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

interface Option {
  id: string;
  label: string;
  subLabel?: string;
  color?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select...",
  className = "",
  required = false,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(option => 
    option.label.toLowerCase().includes(search.toLowerCase()) || 
    (option.subLabel && option.subLabel.toLowerCase().includes(search.toLowerCase()))
  );

  useEffect(() => {
    if (isOpen) {
        setHighlightedIndex(0);
    }
  }, [search, isOpen]);

  useEffect(() => {
    if (isOpen && listRef.current && listRef.current.children[highlightedIndex]) {
        (listRef.current.children[highlightedIndex] as HTMLElement).scrollIntoView({
            block: 'nearest',
            behavior: 'smooth'
        });
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (optionId: string) => {
    onChange(optionId);
    setIsOpen(false);
    setSearch('');
    // Return focus to trigger after selection if mouse clicked or enter pressed
    // But if Tab pressed, we want focus to move naturally.
  };

  const clearSelection = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    onChange('');
    setSearch('');
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          setIsOpen(true);
      }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // If we're closed (shouldn't happen for input but good safety), pass
    if (!isOpen) return;

    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            setHighlightedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
            break;
        case 'ArrowUp':
            e.preventDefault();
            setHighlightedIndex(prev => (prev > 0 ? prev - 1 : prev));
            break;
        case 'Enter':
            e.preventDefault();
            if (filteredOptions.length > 0) {
                handleSelect(filteredOptions[highlightedIndex].id);
                // Return focus to trigger on Enter so user doesn't get lost
                if(triggerRef.current) triggerRef.current.focus();
            }
            break;
        case 'Escape':
            e.preventDefault();
            setIsOpen(false);
            if(triggerRef.current) triggerRef.current.focus();
            break;
        case 'Tab':
            // Custom Tab Behavior: Select highlighted item, then allow focus to move
            if (filteredOptions.length > 0) {
                // Select the item
                onChange(filteredOptions[highlightedIndex].id);
                setSearch('');
                // We do NOT preventDefault here. 
                // We let the Tab event propagate so the browser moves focus to the next element.
                // We also close the menu.
                setIsOpen(false);
            } else {
                setIsOpen(false);
            }
            break;
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div
        ref={triggerRef}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleTriggerKeyDown}
        className={`w-full px-4 py-3 bg-gray-900 border ${isOpen ? 'border-primary ring-1 ring-primary' : 'border-gray-700'} rounded-xl text-sm flex items-center justify-between cursor-pointer transition-all outline-none focus:ring-2 focus:ring-primary/50 ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-600'}`}
        onClick={() => {
            if (!disabled) {
                setIsOpen(!isOpen);
            }
        }}
      >
        <div className="flex-1 truncate flex items-center gap-2">
          {selectedOption ? (
            <>
              {selectedOption.color && (
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: selectedOption.color }} />
              )}
              <span className="text-white font-medium">{selectedOption.label}</span>
              {selectedOption.subLabel && <span className="text-xs text-gray-500 hidden sm:inline">({selectedOption.subLabel})</span>}
            </>
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedOption && !required && !disabled && (
            <div 
                role="button" 
                onClick={clearSelection} 
                className="p-1 hover:bg-gray-800 rounded-full text-gray-500"
                tabIndex={-1} // Skip clear button in tab order for speed, can be clicked
            >
              <X size={14} />
            </div>
          )}
          <ChevronDown size={16} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-[60] w-full mt-2 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-h-60 sm:max-h-64 flex flex-col overflow-hidden animate-fade-in backdrop-blur-xl">
          <div className="p-2 border-b border-gray-800 sticky top-0 bg-gray-900/95 z-10">
            <div className="flex items-center gap-2 bg-gray-950 px-3 py-2.5 rounded-lg border border-gray-800 focus-within:border-primary transition-colors">
              <Search size={14} className="text-gray-500" />
              <input
                ref={inputRef}
                type="text"
                className="bg-transparent border-none outline-none text-white text-xs w-full placeholder-gray-600"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={handleInputKeyDown}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 custom-scrollbar min-h-[120px]" ref={listRef}>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => {
                const isSelected = option.id === value;
                const isHighlighted = index === highlightedIndex;
                let bgClass = 'text-gray-300 hover:bg-gray-800';
                if (isSelected) bgClass = 'bg-primary/20 text-white';
                if (isHighlighted) bgClass = isSelected ? 'bg-primary/30 text-white' : 'bg-gray-800 text-white';

                return (
                    <div
                    key={option.id}
                    className={`px-4 py-3 cursor-pointer flex items-center justify-between text-sm transition-colors ${bgClass}`}
                    onClick={() => {
                        handleSelect(option.id);
                        if(triggerRef.current) triggerRef.current.focus();
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    >
                    <div className="flex items-center gap-3">
                        {option.color && <div className="w-2 h-2 rounded-full" style={{ background: option.color }} />}
                        <div className="flex flex-col">
                            <span className="font-medium">{option.label}</span>
                            {option.subLabel && <span className="text-[10px] text-gray-500 md:hidden">{option.subLabel}</span>}
                        </div>
                    </div>
                    {option.subLabel && <span className="text-xs text-gray-500 hidden md:inline">{option.subLabel}</span>}
                    </div>
                );
              })
            ) : (
              <div className="px-4 py-8 text-center text-xs text-gray-500">No results found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
