
import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Bot, User, Sparkles } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { aiService } from '../services/ai';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

export const AIChat: React.FC = () => {
  const { state } = useFinance();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'Hello! I am your AI CFO. Ask me about your receivables, budget, or spending trends.' }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  if (!aiService.isEnabled()) return null; // Hide if no API Key

  return (
    <>
      {/* FAB */}
      <button 
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-24 md:bottom-8 right-4 md:right-8 z-40 bg-gray-900 border border-gold-500/30 text-gold-400 p-4 rounded-full shadow-2xl hover:scale-110 hover:border-gold-500 transition-all duration-300 group ${isOpen ? 'hidden' : 'flex'}`}
      >
        <Sparkles size={24} className="group-hover:animate-spin" />
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8 w-[90vw] md:w-[400px] h-[500px] max-h-[80vh] bg-gray-950 border border-gold-500/20 rounded-2xl shadow-2xl flex flex-col z-50 animate-slide-up backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50 rounded-t-2xl">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-gold-500/10 rounded-lg">
                <Bot size={20} className="text-gold-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-100">AI CFO</h3>
                <p className="text-[10px] text-green-400 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"/> Online</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center shrink-0 border border-gray-700">
                    <Bot size={14} className="text-gold-500" />
                  </div>
                )}
                <div className={`p-3 rounded-2xl max-w-[80%] text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-primary text-white rounded-br-none' 
                    : 'bg-gray-900 border border-gray-800 text-gray-300 rounded-bl-none'
                }`}>
                  {msg.text.split('\n').map((line, i) => <p key={i} className="mb-1 last:mb-0">{line}</p>)}
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
                    <Bot size={14} className="text-gold-500" />
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
        </div>
      )}
    </>
  );
};
