
import React, { useRef, useState, useEffect } from 'react';

interface PhotoCaptureProps {
  onCapture: (base64: string) => void;
  title: string;
  description: string;
  icon: string;
  isAnalyzing?: boolean;
  loadingMessage?: string;
  labels: {
    change: string;
    capture: string;
    engine: string;
  };
}

// Déclaration pour le bridge natif - Unifiée avec App.tsx pour éviter les conflits de modificateurs
declare global {
  interface Window {
    isPremium: boolean;
    AndroidApp?: {
      takePhoto: () => void;
      launchPurchase: () => void;
    };
    buyPremium: () => void;
    FlutterBridge: any;
  }
}

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({ 
  onCapture, 
  title, 
  description, 
  icon, 
  isAnalyzing = false,
  loadingMessage = "Analyse en cours...",
  labels
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Écouteur pour l'image envoyée par le bridge natif (Flutter/Android/iOS)
  useEffect(() => {
    const handleNativeImage = (event: any) => {
      const base64Full = event.detail; // format attendu: data:image/jpeg;base64,xxxx
      if (base64Full) {
        setPreview(base64Full);
        if (base64Full.includes(',')) {
          onCapture(base64Full.split(',')[1]);
        } else {
          onCapture(base64Full);
        }
      }
    };

    window.addEventListener('flutterImageCaptured' as any, handleNativeImage);
    return () => window.removeEventListener('flutterImageCaptured' as any, handleNativeImage);
  }, [onCapture]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setPreview(base64);
        onCapture(base64.split(',')[1]); 
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerInput = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAnalyzing) return;

    // Tentative d'appel au pont natif si présent
    if (window.AndroidApp && typeof window.AndroidApp.takePhoto === 'function') {
      window.AndroidApp.takePhoto();
    } else {
      // Fallback navigateur standard
      fileInputRef.current?.click();
    }
  };

  return (
    <div 
      className={`flex flex-col items-center justify-center p-8 bg-[#2d3a6d]/30 rounded-3xl border-2 border-dashed transition-all min-h-[340px] w-full text-center relative overflow-hidden ${
        isAnalyzing 
          ? 'border-[#f95a2c]/50 bg-[#f95a2c]/5 cursor-wait' 
          : 'border-slate-700 hover:border-[#f95a2c] cursor-pointer group'
      }`}
      onClick={triggerInput}
    >
      <input 
        type="file" 
        accept="image/*" 
        capture="environment" 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleFileChange}
      />
      
      {isAnalyzing ? (
        <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 border-4 border-[#f95a2c] border-t-transparent rounded-full animate-spin mb-6 shadow-lg shadow-[#f95a2c]/20"></div>
          <p className="text-[#f95a2c] font-black uppercase italic tracking-tighter text-xl drop-shadow-sm">
            {loadingMessage}
          </p>
          <p className="text-slate-500 text-[10px] mt-4 font-bold uppercase tracking-[0.3em]">{labels.engine} Gemini 3.0</p>
        </div>
      ) : (
        <div className="flex flex-col items-center w-full animate-in fade-in slide-in-from-bottom-2">
          {preview ? (
            <div className="relative w-full max-w-[240px] aspect-square rounded-2xl overflow-hidden mb-6 shadow-2xl border border-white/10 group-hover:scale-[1.02] transition-transform">
              <img src={preview} alt="Capture preview" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <i className="fas fa-camera text-2xl text-white mb-2"></i>
                <p className="text-white font-black text-xs uppercase tracking-widest">{labels.change}</p>
              </div>
            </div>
          ) : (
            <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10 group-hover:bg-[#f95a2c]/10 group-hover:border-[#f95a2c]/30 transition-all">
              <i className={`fas ${icon} text-4xl text-slate-500 group-hover:text-[#f95a2c] transition-colors`}></i>
            </div>
          )}
          
          <h3 className="text-xl font-black uppercase italic tracking-tighter mb-2">{title}</h3>
          <p className="text-slate-400 text-sm leading-snug max-w-[240px] mb-6">{description}</p>
          
          {!preview && (
            <button className="px-8 py-3 bg-[#f95a2c] text-white rounded-full font-black text-xs uppercase tracking-widest shadow-lg shadow-[#f95a2c]/20 group-hover:scale-105 active:scale-95 transition-all">
              <i className="fas fa-plus mr-2"></i> {labels.capture}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
