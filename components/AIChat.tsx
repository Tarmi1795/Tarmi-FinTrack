
import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, User } from 'lucide-react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useFinance } from '../context/FinanceContext';
import { aiService } from '../services/ai';

// Dark-theme markdown styling for assistant answers (tables, bold, code, lists)
const assistantMarkdownClass = `
  [&_p]:mb-1.5 [&_p:last-child]:mb-0
  [&_strong]:text-white [&_strong]:font-semibold
  [&_em]:text-gold-200/90
  [&_a]:text-gold-400 [&_a]:underline
  [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1.5
  [&_li]:mb-0.5
  [&_code]:bg-gray-800 [&_code]:border [&_code]:border-gray-700 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_code]:font-mono [&_code]:text-gold-200
  [&_pre]:bg-gray-900 [&_pre]:border [&_pre]:border-gray-800 [&_pre]:rounded-lg [&_pre]:p-2 [&_pre]:overflow-x-auto [&_pre]:my-1.5
  [&_table]:w-full [&_table]:my-2 [&_table]:text-[12px] [&_table]:border-collapse
  [&_th]:bg-gray-800 [&_th]:text-gray-100 [&_th]:text-left [&_th]:font-semibold [&_th]:px-2 [&_th]:py-1.5 [&_th]:border [&_th]:border-gray-700
  [&_td]:px-2 [&_td]:py-1.5 [&_td]:border [&_td]:border-gray-800 [&_td]:text-gray-200
  [&_tr:nth-child(even)_td]:bg-gray-900/60
  [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-white [&_h1]:mt-2 [&_h1]:mb-1
  [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-2 [&_h2]:mb-1
  [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-gold-300 [&_h3]:mt-1.5 [&_h3]:mb-1
  [&_blockquote]:border-l-2 [&_blockquote]:border-gold-500/50 [&_blockquote]:pl-2 [&_blockquote]:text-gray-300
  [&_hr]:border-gray-800 [&_hr]:my-2
`;

const AiRianeIcon = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="4" y="8" width="16" height="11" rx="3" />
    <path d="M12 8V5" />
    <circle cx="12" cy="4" r="1" />
    <path d="M8 12c0-.5.5-1 1-1s1 .5 1 1" />
    <path d="M14 12c0-.5.5-1 1-1s1 .5 1 1" />
    <path d="M9 15.5c1 1.5 5 1.5 6 0" />
    <path d="M4 10.5c-1.5 0-2 1-2 2s.5 2 2 2" />
    <path d="M20 10.5c1.5 0 2 1 2 2s-.5 2-2 2" />
  </svg>
);

const PADDING = 20;
const BUTTON_SIZE = 64;

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

export const AIChat: React.FC = () => {
  const { state } = useFinance();
  const dragControls = useDragControls();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'Hello! I am AI_riane, your AI CFO. Ask me about your receivables, budget, or spending trends.' }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Bottom clearance must clear the mobile tab bar (~56px + safe area)
  const mobileBottomInset = () => 80;

  const getInitialPos = () => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    const isMobile = window.innerWidth < 768;
    const safeBottom = isMobile ? mobileBottomInset() : 0;
    const safeRight = isMobile ? 16 : 0;
    return {
      x: window.innerWidth - BUTTON_SIZE - PADDING - safeRight,
      y: window.innerHeight - BUTTON_SIZE - PADDING - safeBottom
    };
  };

  const [snapPos, setSnapPos] = useState(getInitialPos);

  useEffect(() => {
    const handleResize = () => {
      setSnapPos(prev => {
        const isMobile = window.innerWidth < 768;
        const safeBottom = isMobile ? mobileBottomInset() : 0;
        const safeRight = isMobile ? 16 : 0;
        const isRight = prev.x > window.innerWidth / 2;
        const isBottom = prev.y > window.innerHeight / 2;
        return {
          x: isRight ? window.innerWidth - BUTTON_SIZE - PADDING - safeRight : PADDING + safeRight,
          y: isBottom ? window.innerHeight - BUTTON_SIZE - PADDING - safeBottom : PADDING
        };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleDragEnd = (e: any, info: any) => {
    const { point } = info;
    const midX = window.innerWidth / 2;
    const midY = window.innerHeight / 2;
    const isMobile = window.innerWidth < 768;
    const safeBottom = isMobile ? mobileBottomInset() : 0;
    const safeRight = isMobile ? 16 : 0;

    setSnapPos({
      x: point.x < midX ? PADDING + safeRight : window.innerWidth - BUTTON_SIZE - PADDING - safeRight,
      y: point.y < midY ? PADDING : window.innerHeight - BUTTON_SIZE - PADDING - safeBottom
    });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim() || isTyping) return;

    const userText = query;
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setIsTyping(true);

    const response = await aiService.askCFO(userText, state);
    
    setIsTyping(false);
    setMessages(prev => [...prev, { role: 'assistant', text: response }]);
  };

  return (
    <>
      {/* FAB */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button 
            drag
            dragMomentum={false}
            onDragEnd={handleDragEnd}
            onClick={() => setIsOpen(true)}
            className="fixed top-0 left-0 z-[9999] bg-gold-500 text-black w-14 h-14 md:w-16 md:h-16 rounded-full shadow-2xl flex items-center justify-center cursor-grab active:cursor-grabbing"
            aria-label="Open AI Chat"
            initial={{ scale: 0, opacity: 0, x: snapPos.x, y: snapPos.y }}
            animate={{ scale: 1, opacity: 1, x: snapPos.x, y: snapPos.y }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <AiRianeIcon size={32} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            drag
            dragControls={dragControls}
            dragListener={false}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-4 right-4 md:bottom-8 md:right-8 w-[90vw] md:w-[400px] h-[460px] max-h-[70dvh] md:h-[500px] md:max-h-[80vh] bg-gray-950 border border-gold-500/20 rounded-2xl shadow-2xl flex flex-col z-[10000] backdrop-blur-xl overflow-hidden chat-safe-layout"
          >
            {/* Header */}
            <div
              className="chat-header flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50 cursor-move"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="flex items-center gap-2 pointer-events-none">
                <div className="p-2 bg-gold-500/10 rounded-lg">
                  <AiRianeIcon size={20} className="text-gold-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-100">AI_riane</h3>
                  <p className="text-[10px] text-green-400 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"/> Online</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-white transition-colors p-1">
                <X size={20} />
              </button>
            </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center shrink-0 border border-gray-700">
                    <AiRianeIcon size={16} className="text-gold-500" />
                  </div>
                )}
                <div className={`p-3 rounded-2xl max-w-[80%] text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-primary text-white rounded-br-none' 
                    : 'bg-gray-900 border border-gray-800 text-gray-300 rounded-bl-none'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className={assistantMarkdownClass}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.text.split('\n').map((line, i) => <p key={i} className="mb-1 last:mb-0">{line}</p>)
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30">
                    <User size={14} className="text-primary" />
                  </div>
                )}
              </div>
            ))}
            {isTyping && (
              <div className="flex gap-3">
                 <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center shrink-0">
                    <AiRianeIcon size={16} className="text-gold-500" />
                  </div>
                  <div className="bg-gray-900 border border-gray-800 p-3 rounded-2xl rounded-bl-none flex gap-1 items-center">
                    <span className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}/>
                    <span className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}/>
                    <span className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}/>
                  </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="p-3 border-t border-gray-800 bg-gray-900/50 rounded-b-2xl">
            <div className="relative flex items-center">
              <input 
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Ask about finances..."
                className="w-full bg-gray-950 border border-gray-700 text-white text-sm rounded-xl py-3 pl-4 pr-12 outline-none focus:border-gold-500 transition-colors placeholder-gray-600"
              />
              <button 
                type="submit"
                disabled={!query.trim() || isTyping}
                className="absolute right-2 p-2 bg-gold-600 hover:bg-gold-500 text-black rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
          </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
