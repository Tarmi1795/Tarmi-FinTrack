
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { Lock, ArrowRight, ShieldCheck, Mail, AlertTriangle, Download, Share, PlusSquare, Monitor, Smartphone, Bot, Sparkles } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { usePWA } from '../context/PWAContext';
import { Modal } from '../components/ui/Modal';
import { GoogleGenAI } from "@google/genai";
import { Logo } from '../components/ui/Logo';

interface LoginProps {
  onLogin: () => void;
}

// Fallback image in case AI generation fails or key is missing
// A high-quality, abstract golden architectural shot reminiscent of Doha
const FALLBACK_BG = "https://images.unsplash.com/photo-1512453979798-5ea904f18431?q=80&w=2832&auto=format&fit=crop";

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const { authMethods } = useFinance();
  const { isInstallable, installPWA, isIOS } = usePWA();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showIOSInstruction, setShowIOSInstruction] = useState(false);
  const [showGenericInstruction, setShowGenericInstruction] = useState(false);
  
  // Background State
  const [bgImage, setBgImage] = useState<string>(FALLBACK_BG);
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);

  // Particles for Gold Dust effect
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; size: number; duration: number }[]>([]);

  useEffect(() => {
    // Generate static random particles
    const newParticles = Array.from({ length: 25 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      duration: Math.random() * 10 + 15
    }));
    setParticles(newParticles);

    // Attempt to generate a unique AI background
    const generateBackground = async () => {
        const key = process.env.API_KEY;
        if (!key) return; // Fallback to Unsplash

        setIsGeneratingBg(true);
        try {
            const ai = new GoogleGenAI({ apiKey: key });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image', // Using the image model as per instructions
                contents: {
                    parts: [{
                        text: "A cinematic, photorealistic wide shot of a futuristic golden city skyline at night. Inspired by Doha architecture (Burj Qatar, Tornado Tower). Liquid gold textures, dark charcoal sky, dramatic lighting, 8k resolution, luxury finance theme."
                    }]
                }
            });

            // Parse response for image data
            if (response.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        setBgImage(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                        break;
                    }
                }
            }
        } catch (e) {
            console.warn("Background generation failed, using fallback:", e);
        } finally {
            setIsGeneratingBg(false);
        }
    };

    // generateBackground(); 

  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
        let res;
        if (mode === 'login') {
            res = await authMethods.login(email, password);
        } else {
            res = await authMethods.signUp(email, password);
        }

        if (res.error) {
            setError(res.error.message);
        } else {
            if (mode === 'login') onLogin();
            else {
                alert("Sign up successful! Please check your email or login.");
                setMode('login');
            }
        }
    } catch (err: any) {
        setError(err.message);
    } finally {
        setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
      setLoading(true);
      setError(null);
      const res = await authMethods.signInWithGoogle();
      if(res.error) {
          setError(res.error.message);
          setLoading(false);
      }
  };

  const handleInstallClick = async () => {
      if (isIOS) {
          setShowIOSInstruction(true);
      } else {
          const promptShown = await installPWA();
          if (!promptShown) {
              setShowGenericInstruction(true);
          }
      }
  };

  // --- Animations ---
  const hangingVariants: Variants = {
    initial: { rotateZ: 0 },
    animate: { 
      rotateZ: [0.5, -0.5, 0.5],
      transition: { 
        duration: 8, 
        repeat: Infinity, 
        ease: "easeInOut" 
      } 
    }
  };

  const chainVariants: Variants = {
    initial: { height: 0, opacity: 0 },
    animate: { 
      height: '140px', 
      opacity: 1,
      transition: { duration: 1.2, ease: "easeOut" } 
    }
  };

  const cardEntrance: Variants = {
    initial: { y: -300, opacity: 0 },
    animate: { 
      y: 0, 
      opacity: 1,
      transition: { 
        type: "spring", 
        stiffness: 80, 
        damping: 12, 
        delay: 0.2 
      } 
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col md:flex-row overflow-hidden relative font-inter selection:bg-gold-500/30">
        
        {/* --- LEFT SIDE: THE GOLDEN DOHA HERO --- */}
        <div className="hidden md:flex w-[60%] relative flex-col justify-end p-16 overflow-hidden bg-gray-900 shadow-[20px_0_50px_rgba(0,0,0,0.5)] z-10">
            {/* Background Image with Ken Burns Effect */}
            <div className="absolute inset-0 z-0 overflow-hidden">
                <motion.div 
                    initial={{ scale: 1.1 }}
                    animate={{ scale: 1.0 }}
                    transition={{ duration: 20, repeat: Infinity, repeatType: "reverse", ease: "linear" }}
                    className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
                    style={{ backgroundImage: `url('${bgImage}')` }}
                />
                {/* Overlays for readability and mood */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/60 to-transparent z-10"></div>
                <div className="absolute inset-0 bg-gradient-to-r from-[#050505]/90 via-[#050505]/40 to-transparent z-10"></div>
                <div className="absolute inset-0 bg-gold-900/10 mix-blend-overlay z-10"></div>
            </div>

            {/* Qatar Flag Pattern Vertical Strip */}
            <div className="absolute right-12 top-0 bottom-0 w-24 z-20 flex flex-col items-center opacity-90">
                <div className="w-[1px] h-full bg-gradient-to-b from-transparent via-gold-500/50 to-transparent"></div>
                <div className="absolute top-0 w-16 h-40 bg-qatar-maroon shadow-[0_10px_40px_-10px_rgba(138,21,56,0.6)] flex flex-col items-center justify-end pb-6 rounded-b-sm">
                    <span className="text-4xl font-serif text-gold-100 font-bold drop-shadow-md">T</span>
                    
                    {/* Serrated Edge CSS */}
                    <div className="absolute -bottom-3 left-0 w-full h-4 overflow-hidden">
                         <div className="w-full h-full bg-qatar-maroon" style={{
                             clipPath: 'polygon(0 0, 100% 0, 50% 100%)' // Simple V, or use repeat-x logic for zig zag
                         }}></div>
                    </div>
                </div>
            </div>

            {/* Content Overlay */}
            <div className="relative z-20 space-y-8 pl-4 max-w-2xl">
                <div className="flex items-center gap-4 mb-2">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.8 }}
                        className="w-12 h-12 rounded-xl bg-gradient-to-br from-gold-300 via-gold-500 to-gold-700 flex items-center justify-center shadow-lg shadow-gold-500/20 border border-white/20"
                    >
                        <Bot size={24} className="text-black" />
                    </motion.div>
                    <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: 60 }}
                        transition={{ delay: 0.5, duration: 0.8 }}
                        className="h-[1px] bg-gold-500/50"
                    />
                    <motion.span 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1 }}
                        className="text-gold-300 font-mono text-xs uppercase tracking-[0.4em]"
                    >
                        Tarmi FinTrack
                    </motion.span>
                </div>

                <motion.div 
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.8 }}
                >
                    <h1 className="text-7xl font-bold leading-tight tracking-tight mb-2 font-inter">
                        <span className="block text-white drop-shadow-2xl">Global</span>
                        <span className="block text-transparent bg-clip-text bg-gradient-to-r from-gold-200 via-gold-400 to-gold-200 drop-shadow-sm filter brightness-110">Finance App.</span>
                    </h1>
                    <div className="h-1.5 w-24 bg-gradient-to-r from-qatar-maroon to-transparent rounded-full mt-6"></div>
                </motion.div>

                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.2 }}
                    className="backdrop-blur-md bg-white/5 border-l-2 border-gold-500/50 p-6 rounded-r-xl max-w-lg"
                >
                    <p className="text-gray-300 text-sm leading-relaxed font-light">
                        Hybrid Personal & Business Insights. Real-Time Analytics & Growth. Unlock unparalleled financial clarity with the most advanced AI features.
                        <br/><span className="text-gold-400 font-medium mt-2 block">Experience the power of luxurious financial control.</span>
                    </p>
                </motion.div>
            </div>

            {/* Gold Dust Particles */}
            <div className="absolute inset-0 pointer-events-none z-10">
                {particles.map((p) => (
                    <motion.div
                        key={p.id}
                        className="absolute rounded-full bg-gold-300/40 blur-[1px]"
                        style={{
                            left: `${p.x}%`,
                            top: `${p.y}%`,
                            width: p.size,
                            height: p.size,
                        }}
                        animate={{
                            y: [0, -120, 0],
                            opacity: [0, 0.6, 0],
                            scale: [0.5, 1.2, 0.5]
                        }}
                        transition={{
                            duration: p.duration,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: Math.random() * 5
                        }}
                    />
                ))}
            </div>
        </div>

        {/* --- RIGHT SIDE: AUTHENTICATION --- */}
        <div className="w-full md:w-[40%] relative bg-[#050505] flex items-center justify-center p-6 perspective-[1000px] overflow-hidden">
            {/* Dark/Gold Gradient Mesh Background */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-gold-900/20 via-[#050505] to-[#050505]"></div>
            
            {/* The Hanging Mechanism */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] sm:w-[380px] h-[140px] flex justify-between px-8 z-20 pointer-events-none">
                {/* Left Chain */}
                <motion.div variants={chainVariants} initial="initial" animate="animate" className="w-[2px] bg-gradient-to-b from-[#222] via-gold-600 to-gold-300 relative shadow-lg origin-top">
                    {/* Chain Links simulated by dashed border or small divs - kept simple for performance */}
                    <div className="absolute bottom-0 -left-[5px] w-3 h-3 rounded-full border-[2px] border-gold-400 bg-[#050505] shadow-[0_0_10px_#D4AF37]"></div>
                </motion.div>
                {/* Right Chain */}
                <motion.div variants={chainVariants} initial="initial" animate="animate" className="w-[2px] bg-gradient-to-b from-[#222] via-gold-600 to-gold-300 relative shadow-lg origin-top">
                    <div className="absolute bottom-0 -left-[5px] w-3 h-3 rounded-full border-[2px] border-gold-400 bg-[#050505] shadow-[0_0_10px_#D4AF37]"></div>
                </motion.div>
            </div>

            {/* The Swinging Card */}
            <motion.div 
                variants={hangingVariants}
                initial="initial"
                animate="animate"
                className="origin-top relative z-10 w-full max-w-md pt-20" // pt-20 to account for chain length
            >
                <motion.div 
                    variants={cardEntrance}
                    initial="initial"
                    animate="animate"
                    className="glass-panel rounded-[2rem] border border-white/10 bg-[#0A0A0A]/80 backdrop-blur-2xl shadow-[0_50px_100px_-20px_rgba(0,0,0,0.9)] relative overflow-hidden group"
                >
                    {/* Top Golden Bar on Card */}
                    <div className="h-1.5 w-full bg-gradient-to-r from-gold-700 via-gold-300 to-gold-700"></div>

                    {/* Qatar Flag Corner Ribbon */}
                    <div className="absolute top-0 right-10 w-10 h-20 bg-qatar-maroon z-20 shadow-lg flex items-end justify-center pb-2 rounded-b-sm">
                         <div className="absolute -bottom-2 left-0 w-full h-2 bg-transparent"
                             style={{
                                backgroundImage: `linear-gradient(45deg, #8A1538 25%, transparent 25%), linear-gradient(-45deg, #8A1538 25%, transparent 25%)`,
                                backgroundSize: '10px 10px',
                                backgroundRepeat: 'repeat-x'
                             }} 
                        />
                        <div className="w-[1px] h-12 bg-white/20"></div>
                    </div>

                    <div className="p-8 sm:p-10 relative">
                        
                        {/* Logo Area */}
                        <div className="flex flex-col items-center mb-8">
                            <div className="relative mb-6">
                                {/* Use New Logo Component */}
                                <Logo className="w-28 h-28" showText={false} />
                                {/* Hanging Chains Connectors on Card */}
                                <div className="absolute -top-10 left-2 w-[1px] h-12 bg-gold-500/30 -z-10"></div>
                                <div className="absolute -top-10 right-2 w-[1px] h-12 bg-gold-500/30 -z-10"></div>
                            </div>
                            
                            <h2 className="text-2xl font-bold text-center text-white tracking-tight">
                                {mode === 'login' ? 'Welcome Back.' : 'Join the Elite.'}
                            </h2>
                            <p className="text-[10px] text-gold-500/70 uppercase tracking-[0.2em] mt-2 font-semibold">
                                {mode === 'login' ? 'Access your Vault' : 'Secure your Future'}
                            </p>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }} 
                                animate={{ opacity: 1, height: 'auto' }}
                                className="mb-6 p-3 bg-red-900/20 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-200 text-xs"
                            >
                                <AlertTriangle size={16} /> {error}
                            </motion.div>
                        )}

                        {/* Install Button (Conditional) */}
                        {isInstallable && (
                            <motion.button 
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleInstallClick}
                                className="w-full mb-6 py-3 rounded-xl bg-gray-900/50 border border-dashed border-gold-500/30 text-gold-400/80 text-xs font-bold flex items-center justify-center gap-2 hover:bg-gray-800 hover:border-gold-500 hover:text-gold-400 transition-all"
                            >
                                <Download size={14} /> Install App
                            </motion.button>
                        )}

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest ml-1">Email</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Mail size={16} className="text-gray-500 group-focus-within:text-gold-400 transition-colors duration-300" />
                                    </div>
                                    <input 
                                        type="email" 
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className="w-full bg-[#0F0F0F] border border-gray-800 text-gray-100 text-sm rounded-xl py-3.5 pl-11 pr-4 outline-none focus:border-gold-600/50 focus:ring-1 focus:ring-gold-500/20 transition-all duration-300 placeholder-gray-700"
                                        placeholder="user@example.com"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-widest ml-1">Password</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Lock size={16} className="text-gray-500 group-focus-within:text-gold-400 transition-colors duration-300" />
                                    </div>
                                    <input 
                                        type="password" 
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        className="w-full bg-[#0F0F0F] border border-gray-800 text-gray-100 text-sm rounded-xl py-3.5 pl-11 pr-4 outline-none focus:border-gold-600/50 focus:ring-1 focus:ring-gold-500/20 transition-all duration-300 placeholder-gray-700"
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>
                                {mode === 'login' && (
                                    <div className="flex justify-end pt-1">
                                        <button type="button" className="text-[10px] text-gray-600 hover:text-gold-500 transition-colors">Recover Access?</button>
                                    </div>
                                )}
                            </div>

                            <motion.button 
                                whileHover={{ scale: 1.02, boxShadow: "0 0 25px rgba(212, 175, 55, 0.2)" }}
                                whileTap={{ scale: 0.98 }}
                                disabled={loading}
                                className="w-full relative overflow-hidden bg-gradient-to-b from-[#FDE68A] via-[#D4AF37] to-[#92400E] text-black font-bold py-3.5 rounded-xl shadow-lg shadow-gold-900/20 transition-all group mt-2"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-100%] group-hover:animate-shimmer" />
                                <span className="relative flex items-center justify-center gap-2 text-sm uppercase tracking-wide">
                                    {loading ? 'Authenticating...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
                                    {!loading && <ArrowRight size={16} />}
                                </span>
                            </motion.button>
                        </form>

                        {/* Social / Divider */}
                        <div className="relative my-6">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-800"></div>
                            </div>
                            <div className="relative flex justify-center">
                                <span className="bg-[#0A0A0A] px-3 text-[10px] text-gray-600 uppercase tracking-widest font-bold">Or</span>
                            </div>
                        </div>

                        <button 
                            onClick={handleGoogleLogin}
                            disabled={loading}
                            className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-sm font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-3 hover:border-white/20 active:scale-95 group"
                        >
                            <svg className="w-4 h-4 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            Continue with Google
                        </button>

                        <div className="mt-6 text-center">
                            <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="text-xs text-gray-500 hover:text-gold-400 transition-colors">
                                {mode === 'login' ? "New here? Create a Visionary Account" : "Already have access? Log In"}
                            </button>
                        </div>
                    </div>
                    
                    {/* Bottom Secure Badge */}
                    <div className="bg-gray-950/80 py-3 text-center border-t border-white/5 flex items-center justify-center gap-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
                            <ShieldCheck size={12} className="text-gold-600" />
                            <span>Encrypted by Tarmi Vault Technology</span>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </div>

        {/* --- MODALS --- */}
        <Modal isOpen={showIOSInstruction} onClose={() => setShowIOSInstruction(false)} title="Install on iPhone">
            <div className="p-4 space-y-4 text-gray-300">
                <p className="text-sm">For the full luxury experience, install this app to your home screen.</p>
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-800 rounded"><Share size={20} className="text-blue-400"/></div>
                        <span className="text-sm">1. Tap <b>Share</b> in Safari.</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-800 rounded"><PlusSquare size={20} className="text-gray-400"/></div>
                        <span className="text-sm">2. Select <b>Add to Home Screen</b>.</span>
                    </div>
                </div>
                <button onClick={() => setShowIOSInstruction(false)} className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-xl mt-4 text-sm font-bold">Understood</button>
            </div>
        </Modal>

        <Modal isOpen={showGenericInstruction} onClose={() => setShowGenericInstruction(false)} title="Install App">
                <div className="p-4 space-y-4 text-gray-300">
                <p className="text-sm">Install the app for offline access and better performance.</p>
                <div className="space-y-3">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-gray-800 rounded text-gray-400"><Monitor size={20} /></div>
                        <div>
                            <strong className="text-sm text-white block">Desktop (Chrome/Edge)</strong>
                            <span className="text-xs text-gray-500">Click the install icon <Download size={10} className="inline"/> in the address bar.</span>
                        </div>
                    </div>
                        <div className="flex items-start gap-3">
                        <div className="p-2 bg-gray-800 rounded text-gray-400"><Smartphone size={20} /></div>
                        <div>
                            <strong className="text-sm text-white block">Android (Chrome)</strong>
                            <span className="text-xs text-gray-500">Tap <span className="font-bold">⋮</span> and select <b>Install App</b>.</span>
                        </div>
                    </div>
                </div>
                <button onClick={() => setShowGenericInstruction(false)} className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-xl mt-4 text-sm font-bold">Close</button>
                </div>
        </Modal>
    </div>
  );
};
