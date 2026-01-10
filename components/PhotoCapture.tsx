
import React, { useRef, useState } from 'react';

interface PhotoCaptureProps {
  onCapture: (base64: string) => void;
  title: string;
  description: string;
  icon: string;
  isAnalyzing?: boolean;
  loadingMessage?: string;
}

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({ 
  onCapture, 
  title, 
  description, 
  icon, 
  isAnalyzing = false,
  loadingMessage = "Analyse en cours..."
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setPreview(base64);
        onCapture(base64.split(',')[1]); // Send only the data part
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerInput = () => {
    if (isAnalyzing) return;
    fileInputRef.current?.click();
  };

  return (
    <div 
      className={`flex flex-col items-center justify-center p-8 bg-[#2d3a6d]/30 rounded-3xl border-2 border-dashed transition-all min-h-[300px] ${
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
          <p className="text-[#f95a2c] font-black uppercase italic tracking-tighter text-lg text-center drop-shadow-sm">
            {loadingMessage}
          </p>
          <p className="text-slate-500 text-[10px] mt-4 font-bold uppercase tracking-[0.3em]">Moteur Gemini 3.0</p>
        </div>
      ) : (
        <>
          {preview ? (
            <div className="relative w-full max-w-[200px] aspect-square rounded-2xl overflow-hidden mb-6 shadow-2xl border border-white/10">
              <img src={preview} alt="Capture preview" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-white font-bold text-sm uppercase tracking-widest">Changer</p>
              </div>
            </div>
          ) : (
            <div className="w-24 h-24 rounded-[2rem] bg-slate-800/50 flex items-center justify-center mb-6 group-hover:bg-[#f95a2c] group-hover:rotate-6 transition-all duration-300 shadow-xl border border-white/5">
              <i className={`fas ${icon} text-4xl text-slate-400 group-hover:text-white transition-colors`}></i>
            </div>
          )}
          
          <h3 className="text-2xl font-black mb-2 text-center uppercase italic tracking-tighter">{title}</h3>
          <p className="text-slate-400 text-sm text-center max-w-[250px] leading-snug font-medium">{description}</p>
          
          {!preview && (
            <div className="mt-8 px-8 py-3 bg-[#f95a2c] group-hover:bg-[#ff7e56] text-white rounded-2xl font-black transition-all transform group-hover:scale-105 shadow-xl shadow-[#f95a2c]/20 uppercase italic tracking-tighter">
              <i className="fas fa-camera mr-2"></i>
              Capturer
            </div>
          )}
        </>
      )}
    </div>
  );
};
