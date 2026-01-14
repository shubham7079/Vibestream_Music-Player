
import React from 'react';
import { Play } from 'lucide-react';

interface InteractionShieldProps {
  onUnlock: () => void;
}

export const InteractionShield: React.FC<InteractionShieldProps> = ({ onUnlock }) => {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center">
      <div className="w-32 h-32 bg-indigo-500/20 rounded-full flex items-center justify-center animate-pulse mb-8 border border-indigo-500/50">
        <Play size={48} className="text-indigo-400 fill-indigo-400" />
      </div>
      <h1 className="text-4xl font-black mb-4 tracking-tighter">VIBESTREAM <span className="text-indigo-500">PRO</span></h1>
      <p className="text-slate-400 max-w-md mb-8">
        Welcome to the AI-powered deep space ecosystem. We need a handshake to initialize the high-fidelity audio cluster.
      </p>
      <button 
        onClick={onUnlock}
        className="px-12 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-full text-lg font-bold transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(79,70,229,0.4)]"
      >
        ENGAGE ENGINE
      </button>
    </div>
  );
};
