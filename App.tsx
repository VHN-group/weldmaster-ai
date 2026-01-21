import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppStep, WeldingMachine, Workpiece, WeldingAdvice, HistoryItem, Language, SafetyPoint, SavedMachine } from './types';
import { identifyEverything, getFinalAdvice } from './services/geminiService';
import { StepIndicator } from './components/StepIndicator';
import { PhotoCapture } from './components/PhotoCapture';
import { translations } from './translations';

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

// Utilitaire de compression d'image pour éviter le dépassement de quota localStorage
const compressImage = (base64Str: string, maxWidth = 800, maxHeight = 800, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str.startsWith('data:') ? base64Str : `data:image/jpeg;base64,${base64Str}`;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(base64Str); // Fallback si erreur
  });
};

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('fr');
  const [step, setStep] = useState<AppStep>(AppStep.WELCOME);
  const [machine, setMachine] = useState<WeldingMachine | null>(null);
  const [workpiece, setWorkpiece] = useState<Workpiece | null>(null);
  const [advice, setAdvice] = useState<WeldingAdvice | null>(null);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [machineImage, setMachineImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [savedPosts, setSavedPosts] = useState<SavedMachine[]>([]);
  // Statut Initial : On lit window.isPremium injecté ou false par défaut
  const [isPremium, setIsPremium] = useState<boolean>(window.isPremium || true);
  const [isFromHistory, setIsFromHistory] = useState<boolean>(false);
  const [showManualMachineEntry, setShowManualMachineEntry] = useState(false);
  const [manualMachineName, setManualMachineName] = useState("");
  
  const resultsRef = useRef<HTMLDivElement>(null);
  const analysisTimeoutRef = useRef<number | null>(null);

  const t = translations[lang];

  useEffect(() => {
    // Synchronisation : Mise à jour si window.isPremium change au chargement
    if (window.isPremium !== undefined) {
      setIsPremium(window.isPremium);
    }
    
    const savedHist = localStorage.getItem('weldmaster_history_v2');
    const savedWeldHistory = localStorage.getItem('weld_history');
    const savedLang = localStorage.getItem('weldmaster_lang');
    
    if (savedHist) {
      try { setHistory(JSON.parse(savedHist)); } catch (e) { console.error("Parse history error", e); }
    }
    if (savedWeldHistory) {
      try { setSavedPosts(JSON.parse(savedWeldHistory)); } catch (e) { console.error("Parse posts error", e); }
    }
    if (savedLang) setLang(savedLang as Language);

    // Écouteur d'événements : Réaction aux changements de statut (achats In-App)
    const handlePremiumChange = (e: any) => {
      setIsPremium(e.detail);
    };
    window.addEventListener('premium-status-changed', handlePremiumChange);

    return () => {
        window.removeEventListener('premium-status-changed', handlePremiumChange);
        if (analysisTimeoutRef.current) clearTimeout(analysisTimeoutRef.current);
    };
  }, []);

  const changeLang = (l: Language) => {
    setLang(l);
    try {
      localStorage.setItem('weldmaster_lang', l);
    } catch (e) { 
      console.warn("Storage full: lang not saved"); 
    }
  };

  const clearAllData = () => {
    if (window.confirm(t.resetConfirm)) {
      localStorage.clear();
      setHistory([]);
      setSavedPosts([]);
      reset();
      window.location.reload();
    }
  };

  const startAnalysis = () => {
    setError(null);
    setIsFromHistory(false);
    setMachineImage(null);
    setShowManualMachineEntry(false);
    setStep(AppStep.MACHINE_PHOTO);
  };

  const handlePremiumClick = () => {
    if (window.AndroidApp && window.AndroidApp.launchPurchase) {
      window.AndroidApp.launchPurchase();
    } else if (typeof window.buyPremium === "function") {
      window.buyPremium();
    }
  };

  const safeStorageSave = (key: string, data: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error(`Quota exceeded for ${key}, attempting cleanup...`, e);
      if (key === 'weld_history') {
        const reduced = data.slice(0, 1);
        localStorage.setItem(key, JSON.stringify(reduced));
        setSavedPosts(reduced);
      } else if (key === 'weldmaster_history_v2') {
        const reduced = data.slice(0, 1);
        localStorage.setItem(key, JSON.stringify(reduced));
        setHistory(reduced);
      }
    }
  };

  const savePost = useCallback((m: WeldingMachine, img: string) => {
    const newPost: SavedMachine = {
      id: Date.now().toString(),
      date: Date.now(),
      image: img,
      machineData: m
    };
    setSavedPosts(prev => {
      const updated = [newPost, ...prev].slice(0, 3);
      safeStorageSave('weld_history', updated);
      return updated;
    });
  }, []);

  const updateLastSavedPost = useCallback((m: WeldingMachine) => {
    setSavedPosts(prev => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      updated[0] = { ...updated[0], machineData: m };
      safeStorageSave('weld_history', updated);
      return updated;
    });
  }, []);

  const handleMachinePhoto = useCallback(async (base64: string) => {
    setIsAnalyzing(true);
    setLoadingMessage(t.loadingCapture);
    try {
      const compressed = await compressImage(base64);
      setMachineImage(compressed);
      const placeholderMachine: WeldingMachine = { 
        brand: 'Identification...', 
        model: '', 
        type: 'MIG' 
      };
      setMachine(placeholderMachine);
      savePost(placeholderMachine, compressed);
      setStep(AppStep.WORKPIECE_PHOTO);
    } catch (err) {
      console.error("Capture error", err);
      setError(t.errorCapture);
    } finally {
      setIsAnalyzing(false);
    }
  }, [savePost, t.loadingCapture, t.errorCapture]);

  const handleWorkpiecePhoto = useCallback(async (base64: string) => {
    if (!machineImage) {
      setStep(AppStep.MACHINE_PHOTO);
      return;
    }

    setIsAnalyzing(true);
    setShowManualMachineEntry(false);
    setLoadingMessage(t.loadingVision);
    setError(null);

    analysisTimeoutRef.current = window.setTimeout(() => {
      setShowManualMachineEntry(true);
    }, 10000);

    try {
      const compressed = await compressImage(base64);
      setCurrentImage(compressed);
      
      const mImgDataOnly = machineImage.includes(',') ? machineImage.split(',')[1] : machineImage;
      const wImgDataOnly = compressed.includes(',') ? compressed.split(',')[1] : compressed;
      
      const result = await identifyEverything(mImgDataOnly, wImgDataOnly);
      
      if (analysisTimeoutRef.current) clearTimeout(analysisTimeoutRef.current);
      
      setMachine(result.machine);
      setWorkpiece({...result.workpiece, migWireDiameter: '0.8', isAnalog: false}); 
      if (!isFromHistory) updateLastSavedPost(result.machine);
      setStep(AppStep.DETAILS_CONFIRMATION);
    } catch (err) {
      console.error(err);
      if (analysisTimeoutRef.current) clearTimeout(analysisTimeoutRef.current);
      setError(t.resultError);
      setShowManualMachineEntry(true);
      setMachine(prev => prev || { brand: 'Inconnu', model: '', type: 'MIG' });
      setWorkpiece({ material: 'Acier', thicknessA: '2', migWireDiameter: '0.8', isAnalog: false });
      setStep(AppStep.DETAILS_CONFIRMATION);
    } finally {
      setIsAnalyzing(false);
    }
  }, [machineImage, isFromHistory, t.resultError, t.loadingVision, updateLastSavedPost]);

  const finalizeAdvice = async (m: WeldingMachine, w: Workpiece, l: Language) => {
    if (!m || !w) return;
    setIsLoading(true);
    setError(null);
    setLoadingMessage(t.loadingAdvice);

    try {
      // Si non premium, on ignore l'épaisseur 2 et la position pour le calcul
      const sanitizedWorkpiece = isPremium ? w : {
        ...w,
        thicknessB: undefined,
        weldingPosition: undefined
      };

      const data = await getFinalAdvice(m, sanitizedWorkpiece, l, isPremium, isFromHistory);
      setAdvice(data);
      setStep(AppStep.RESULTS);
      
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        image: currentImage || undefined,
        machine: m,
        workpiece: w,
        advice: data
      };
      
      setHistory(prev => {
        const updated = [newItem, ...prev].slice(0, 3);
        safeStorageSave('weldmaster_history_v2', updated);
        return updated;
      });
    } catch (err) {
      console.error("Finalize Error:", err);
      setError(t.resultError || "Erreur lors du calcul");
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualEntrySubmit = () => {
    if (manualMachineName.trim()) {
      setMachine({ brand: manualMachineName, model: '', type: 'MIG' });
      setStep(AppStep.DETAILS_CONFIRMATION);
    }
  };

  const reset = () => {
    if (analysisTimeoutRef.current) clearTimeout(analysisTimeoutRef.current);
    setStep(AppStep.WELCOME);
    setMachine(null);
    setWorkpiece(null);
    setAdvice(null);
    setCurrentImage(null);
    setMachineImage(null);
    setError(null);
    setIsFromHistory(false);
    setIsAnalyzing(false);
    setIsLoading(false);
    setShowManualMachineEntry(false);
    setManualMachineName("");
  };

  const loadFromHistory = (item: HistoryItem) => {
    if (!isPremium) return;
    setMachine(item.machine);
    setWorkpiece(item.workpiece);
    setAdvice(item.advice);
    setCurrentImage(item.image || null);
    setStep(AppStep.RESULTS);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => {
      const updated = prev.filter(h => h.id !== id);
      safeStorageSave('weldmaster_history_v2', updated);
      return updated;
    });
  };

  const getProcessName = (type?: string) => {
    switch(type) {
      case 'MIG': return 'MIG / MAG';
      case 'TIG': return 'TIG';
      case 'Stick': return 'Stick (MMA)';
      default: return type || 'Procédé inconnu';
    }
  };

  const cleanUnit = (val?: any, unit?: string) => {
    if (val === undefined || val === null) return '';
    const strVal = String(val).trim();
    if (!unit) return strVal;
    const escapedUnit = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\s*${escapedUnit}`, 'gi');
    return strVal.replace(regex, '').trim();
  };

  const isMig = machine?.type === 'MIG';
  const isTig = machine?.type === 'TIG';
  const isStick = machine?.type === 'Stick';

  const getSafetyIcon = (category: any) => {
    const cat = String(category || '').toUpperCase();
    switch(cat) {
      case 'EPI': return 'fa-user-shield';
      case 'GAS': return 'fa-mask-ventilator';
      case 'FIRE': return 'fa-fire-extinguisher';
      case 'BURN': return 'fa-temperature-high';
      case 'AI': return 'fa-microchip';
      default: return 'fa-circle-exclamation';
    }
  };

  const getSafetyColor = (category: any) => {
    const cat = String(category || '').toUpperCase();
    switch(cat) {
      case 'AI': return 'text-amber-400';
      default: return 'text-red-500';
    }
  };

  const handleSelectSavedMachine = (post: SavedMachine) => {
    if (!isPremium) return;
    setMachine(post.machineData);
    setMachineImage(post.image);
    setIsFromHistory(true);
    setStep(AppStep.WORKPIECE_PHOTO);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="max-w-2xl mx-auto min-h-screen flex flex-col p-4 bg-[#1e284b] relative">
      <header className="flex items-center justify-between py-4 border-b border-white/10">
        <div className="flex items-center gap-2" onClick={reset} style={{cursor: 'pointer'}}>
          <div className="w-8 h-8 bg-[#f95a2c] rounded flex items-center justify-center rotate-3 shadow-lg shadow-[#f95a2c]/20">
            <i className="fas fa-bolt text-white text-lg"></i>
          </div>
          <h1 className="text-xl font-black tracking-tighter uppercase italic">Weld<span className="text-[#f95a2c]">Master</span> AI</h1>
        </div>
        <div className="flex items-center gap-3">
          {isPremium && (
            <span className="bg-amber-400 text-[#1e284b] text-[10px] font-black px-2 py-1 rounded flex items-center gap-1 shadow-lg shadow-amber-400/20">
              <i className="fas fa-crown text-[8px]"></i> premium
            </span>
          )}
          {step !== AppStep.WELCOME && (
            <button onClick={reset} className="text-slate-400 hover:text-white transition-colors p-2 bg-white/5 rounded-full">
              <i className="fas fa-rotate-left"></i>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center py-6 w-full">
        {error && !showManualMachineEntry && (
          <div className="w-full mb-4 p-4 bg-red-500/10 border border-red-500/50 rounded-2xl text-red-500 text-sm font-bold flex items-center gap-3 animate-in fade-in">
            <i className="fas fa-triangle-exclamation"></i>
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-[#f95a2c] border-t-transparent rounded-full animate-spin mb-6 shadow-lg shadow-[#f95a2c]/20"></div>
            <p className="text-[#f95a2c] font-black text-lg italic uppercase text-center px-6 tracking-tighter animate-pulse">
              {loadingMessage}
            </p>
            <p className="mt-2 text-slate-500 text-[10px] uppercase font-bold tracking-widest">{t.engine} Gemini 3.0</p>
          </div>
        ) : (
          <>
            {step !== AppStep.WELCOME && <StepIndicator currentStep={step} lang={lang} />}
            
            {step === AppStep.WELCOME && (
              <div className="text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-sm w-full">
                <div className="flex justify-center gap-2 p-1 bg-white/5 rounded-2xl w-fit mx-auto border border-white/10">
                  {(['fr', 'en', 'es', 'de'] as Language[]).map((l) => (
                    <button key={l} onClick={() => changeLang(l)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${lang === l ? 'bg-[#f95a2c] text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                      {translations[l].langName}
                    </button>
                  ))}
                </div>

                <div className="space-y-4">
                  <h2 className="text-4xl font-black leading-none uppercase italic tracking-tighter">
                    {isPremium ? t.expertMode.split(' ').slice(0, -1).join(' ') : t.welcomeTitle.split(' ').slice(0, -2).join(' ')} <br/>
                    <span className="text-[#f95a2c]">{isPremium ? t.expertMode.split(' ').slice(-1).join(' ') : t.welcomeTitle.split(' ').slice(-2).join(' ')}</span>
                  </h2>
                  <p className={`font-medium text-sm leading-snug px-6 ${isPremium ? 'text-slate-400' : 'text-slate-300'}`}>
                    {isPremium ? (lang === 'fr' ? "Analyse technique de précision par intelligence artificielle." : t.loadingAdvice) : t.welcomeSub}
                  </p>
                </div>

                {isPremium && savedPosts.length > 0 && (
                  <div className="w-full space-y-4 animate-in fade-in slide-in-from-left-4">
                    <div className="flex items-center justify-between px-2">
                      <h3 className="text-[10px] font-black uppercase italic text-white flex items-center gap-2 tracking-widest">
                        <i className="fas fa-plug text-[#f95a2c]"></i> {t.savedMachines}
                      </h3>
                      <button onClick={() => { setSavedPosts([]); try { localStorage.removeItem('weld_history'); } catch(e){} }} className="text-[9px] text-red-500/70 hover:text-red-500 uppercase font-black tracking-widest transition-colors">{t.clearBtn}</button>
                    </div>
                    <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide px-2">
                      {savedPosts.map((post) => (
                        <div key={post.id} onClick={() => handleSelectSavedMachine(post)} className="flex-shrink-0 flex flex-col items-center gap-2 group cursor-pointer">
                          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 overflow-hidden group-hover:border-[#f95a2c] transition-all relative">
                            <img src={post.image} alt="Machine" className="w-full h-full object-cover opacity-70 group-hover:opacity-100" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-center pb-1">
                              <span className="text-[7px] text-white font-black uppercase truncate px-1">{post.machineData.brand}</span>
                            </div>
                          </div>
                          <span className="text-[8px] text-slate-500 font-black uppercase tracking-tighter group-hover:text-white transition-colors">{post.machineData.model || 'Standard'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <button onClick={startAnalysis} className="w-full py-6 bg-[#f95a2c] hover:bg-[#d84a22] text-white rounded-3xl font-black text-xl shadow-2xl active:scale-95 flex items-center justify-center gap-4 uppercase italic tracking-tighter transition-all">
                    <i className="fas fa-camera text-2xl"></i>{t.startBtn}
                  </button>
                  {!isPremium && (
                    <button onClick={handlePremiumClick} className="w-full py-4 bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-600 text-white rounded-2xl font-black text-sm shadow-xl active:scale-95 flex items-center justify-center gap-3 uppercase italic tracking-tighter transition-all border border-amber-300/30">
                      <i className="fas fa-crown"></i> {t.premiumBtn}
                    </button>
                  )}
                </div>
              </div>
            )}

            {step === AppStep.MACHINE_PHOTO && (
              <PhotoCapture icon="fa-plug" title={t.stepPoste} description={t.machinePhotoDesc} onCapture={handleMachinePhoto} isAnalyzing={isAnalyzing} loadingMessage={t.loadingCapture} labels={{change: t.change, capture: t.capture, engine: t.engine}} />
            )}
            
            {step === AppStep.WORKPIECE_PHOTO && (
              <div className="w-full flex flex-col items-center gap-6 animate-in fade-in">
                {machineImage && (
                  <div className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center gap-4 shadow-xl text-left">
                    <div className="w-12 h-12 rounded-xl overflow-hidden border border-[#f95a2c]/50 bg-black">
                      <img src={machineImage} alt="Poste" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <p className="text-[10px] text-[#f95a2c] font-black uppercase tracking-widest">{t.selectedHardware}</p>
                      <p className="text-xs font-bold text-white uppercase italic">{machine?.brand || t.loading}</p>
                    </div>
                  </div>
                )}
                <div className="w-full relative">
                  <PhotoCapture icon="fa-cubes" title={t.stepPieces} description={t.workpiecePhotoDesc} onCapture={handleWorkpiecePhoto} isAnalyzing={isAnalyzing} loadingMessage={t.loadingVision} labels={{change: t.change, capture: t.capture, engine: t.engine}} />
                </div>
              </div>
            )}

            {step === AppStep.DETAILS_CONFIRMATION && machine && workpiece && (
              <div className="w-full space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10 space-y-6">
                  <h3 className="text-xl font-bold flex items-center gap-3 text-left">
                    <div className="w-8 h-8 bg-green-500/20 text-green-500 rounded flex items-center justify-center"><i className="fas fa-check"></i></div>
                    {t.stepValidation}
                  </h3>
                  
                  {showManualMachineEntry && (
                    <div className="bg-[#f95a2c]/10 border border-[#f95a2c]/30 p-4 rounded-xl mb-4 animate-in slide-in-from-top-2">
                       <label className="text-[10px] uppercase text-[#f95a2c] font-black tracking-widest mb-1 block">{t.manualEntryTitle}</label>
                       <input 
                         className="w-full bg-black/20 border border-[#f95a2c]/30 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#f95a2c]" 
                         placeholder={t.manualEntryPlaceholder}
                         value={manualMachineName}
                         onChange={(e) => { setManualMachineName(e.target.value); setMachine({...machine, brand: e.target.value}); }}
                       />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-x-4 gap-y-6 text-left">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">{t.posteDetecte}</label>
                      <input className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none" value={`${machine?.brand || ''} ${machine?.model || ''}`} onChange={(e) => setMachine({...machine, brand: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">{t.procede}</label>
                      <select className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none" value={machine?.type} onChange={(e) => setMachine({...machine, type: e.target.value as any})}>
                        <option value="MIG">MIG / MAG</option><option value="TIG">TIG</option><option value="Stick">Stick (ARC / MMA)</option>
                      </select>
                    </div>

                    {/* Option Poste à commutateurs */}
                    <div className="col-span-2 flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl">
                      <div className="flex items-center gap-3">
                        <i className="fas fa-sliders text-[#f95a2c]"></i>
                        <div>
                          <p className="text-xs font-bold text-white uppercase italic">{t.analogMachine}</p>
                          <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest">{t.analogDesc}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setWorkpiece({...workpiece, isAnalog: !workpiece.isAnalog})}
                        className={`w-12 h-6 rounded-full transition-all relative ${workpiece.isAnalog ? 'bg-[#f95a2c]' : 'bg-slate-700'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${workpiece.isAnalog ? 'right-1' : 'left-1'}`}></div>
                      </button>
                    </div>
                    
                    {/* Sélecteur de diamètre de fil si MIG - Accessible à tous */}
                    {isMig && (
                      <div className="space-y-1 col-span-2">
                        <label className="text-[10px] uppercase text-indigo-400 font-bold tracking-widest">{t.migWireDiam}</label>
                        <select 
                          className="w-full bg-[#1e284b] border border-indigo-500/30 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none"
                          value={workpiece?.migWireDiameter || '0.8'}
                          onChange={(e) => setWorkpiece({...workpiece, migWireDiameter: e.target.value})}
                        >
                          <option value="0.6">0.6 mm</option>
                          <option value="0.8">0.8 mm</option>
                          <option value="1.0">1.0 mm</option>
                          <option value="1.2">1.2 mm</option>
                          <option value="1.6">1.6 mm</option>
                        </select>
                      </div>
                    )}

                    {/* Bloc Matière et Épaisseur 1 */}
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">{t.matiere}</label>
                      <input className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none" value={workpiece?.material || ''} onChange={(e) => setWorkpiece({...workpiece, material: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">{t.epaisseurA}</label>
                      <input className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none" value={workpiece?.thicknessA || ''} onChange={(e) => setWorkpiece({...workpiece, thicknessA: e.target.value})} />
                    </div>

                    {/* Séparateur Premium Élégant */}
                    {!isPremium && (
                      <div className="col-span-2 py-2 px-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center gap-3 animate-in fade-in slide-in-from-top-2">
                        <i className="fas fa-crown text-amber-500 text-xs"></i>
                        <p className="text-[10px] text-amber-500 font-black uppercase tracking-widest italic">{t.warning.toUpperCase()} : PREMIUM REQUIS POUR CES OPTIONS</p>
                      </div>
                    )}

                    {/* Bloc Épaisseur 2 et Position - Restrictions Premium */}
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">{t.epaisseurB}</label>
                      <input 
                        type="number" 
                        className={`w-full bg-[#1e284b] border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none ${!isPremium ? 'opacity-50 cursor-not-allowed' : ''}`}
                        value={workpiece?.thicknessB || ''} 
                        placeholder={!isPremium ? 'PREMIUM' : 'Ex: 5'}
                        disabled={!isPremium}
                        onChange={(e) => setWorkpiece({...workpiece, thicknessB: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">{t.position}</label>
                      <select 
                        className={`w-full bg-[#1e284b] border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none ${!isPremium ? 'opacity-50 cursor-not-allowed' : ''}`}
                        value={workpiece?.weldingPosition || ''} 
                        disabled={!isPremium}
                        onChange={(e) => setWorkpiece({...workpiece, weldingPosition: e.target.value})}
                      >
                        <option value="">{!isPremium ? 'BASIC : Non spécifié' : t.notSpecified}</option>
                        <option value="PA / 1G">{t.posPA}</option>
                        <option value="PB / 2F">{t.posPB}</option>
                        <option value="PC / 2G">{t.posPC}</option>
                        <option value="PF / 3G">{t.posPF}</option>
                        <option value="PG / 3G">{t.posPG}</option>
                        <option value="PE / 4G">{t.posPE}</option>
                      </select>
                    </div>
                  </div>
                </div>
                <button onClick={() => finalizeAdvice(machine!, workpiece!, lang)} className="w-full py-5 bg-[#f95a2c] hover:bg-[#d84a22] text-white rounded-2xl font-black text-xl shadow-2xl active:scale-95 uppercase italic tracking-tighter transition-all">{t.calculer}</button>
              </div>
            )}

            {step === AppStep.RESULTS && advice && (
              <div className="w-full space-y-6 pb-12 animate-in fade-in zoom-in-95 duration-500 text-left">
                <div ref={resultsRef} className="bg-[#1e284b] rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                  <div className="bg-gradient-to-r from-[#f95a2c] to-[#ff7e56] p-6 flex justify-between items-center">
                    <div>
                      <h3 className="text-2xl font-black uppercase italic leading-none tracking-tighter drop-shadow-md">{isPremium ? t.paramExperts : t.stepReglages}</h3>
                      <p className="mt-1 text-white/80 text-[10px] font-bold uppercase tracking-[0.2em]">{machine?.brand} {machine?.model}</p>
                    </div>
                    <div className="bg-black/20 px-4 py-2 rounded-2xl border border-white/10 backdrop-blur-sm text-center">
                      <span className="text-[10px] text-white/60 font-black uppercase block tracking-widest">{t.procede}</span>
                      <span className="text-sm font-black text-white italic uppercase tracking-tighter">{getProcessName(machine?.type)}</span>
                    </div>
                  </div>
                  
                  <div className="p-6 space-y-6">
                    {/* Réglages de base Amperage / Tension */}
                    <div className="bg-white/5 p-5 rounded-3xl border border-white/10 flex flex-col gap-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="text-[10px] text-[#f95a2c] font-black uppercase mb-1">{isMig ? t.tension : t.intensite}</p>
                          <p className={`font-black ${advice?.voltage?.length > 8 ? 'text-2xl' : 'text-5xl'}`}>
                            {isMig ? cleanUnit(advice?.voltage, 'V') : cleanUnit(advice?.amperage, 'A')}
                            <span className="text-2xl text-slate-500 ml-1">{isMig && !workpiece.isAnalog ? 'V' : (!isMig ? 'A' : '')}</span>
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {isMig && advice?.wireSpeed && (
                               <span className="text-[10px] bg-indigo-500/20 text-indigo-400 font-black px-2 py-1 rounded-lg uppercase border border-indigo-500/30">{t.vitesseFil}: {advice.wireSpeed}</span>
                            )}
                            <span className="text-[10px] bg-blue-500/20 text-blue-400 font-black px-2 py-1 rounded-lg uppercase border border-blue-500/30">{t.polarite}: {advice.polarity}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bloc GAZ & DÉBIT */}
                    {(advice.gasType || advice.gasFlow) && (
                      <div className="bg-indigo-900/10 border border-indigo-500/30 p-5 rounded-3xl space-y-4">
                        <h4 className="text-xs font-black uppercase text-indigo-400 tracking-widest flex items-center gap-2">
                          <i className="fas fa-gas-pump"></i> {t.protectionGaz}
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-black/20 p-3 rounded-2xl border border-white/5">
                            <p className="text-[8px] text-slate-500 uppercase font-black">{t.gasType}</p>
                            <p className="text-sm font-bold text-white">{advice.gasType || 'N/A'}</p>
                          </div>
                          <div className="bg-black/20 p-3 rounded-2xl border border-white/5">
                            <p className="text-[8px] text-slate-500 uppercase font-black">{t.gasFlow}</p>
                            <p className="text-sm font-bold text-indigo-400">{advice.gasFlow || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Bloc CONSOMMABLES (FIL, ELECTRODE, APPORT) */}
                    <div className="bg-slate-800/40 border border-slate-700 p-5 rounded-3xl space-y-4">
                      <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                        <i className="fas fa-tools"></i> {t.consommablesLabel}
                      </h4>
                      <div className="space-y-3">
                        {isMig && (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-black/20 p-3 rounded-2xl border border-white/5">
                              <p className="text-[8px] text-slate-500 uppercase font-black">{t.filLabel}</p>
                              <p className="text-xs font-bold text-white">{advice.wireType || t.matiere}</p>
                            </div>
                            <div className="bg-black/20 p-3 rounded-2xl border border-white/5">
                              <p className="text-[8px] text-slate-500 uppercase font-black">{t.diametreLabel}</p>
                              <p className="text-xs font-bold text-white">Ø {cleanUnit(advice.wireDiameter || workpiece.migWireDiameter || '0.8', 'mm')} mm</p>
                            </div>
                          </div>
                        )}
                        {isTig && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-black/20 p-3 rounded-2xl border border-white/5">
                                <p className="text-[8px] text-slate-500 uppercase font-black">{t.tungstenLabel}</p>
                                <p className="text-xs font-bold text-white">{advice.electrodeType || 'Cerié'}</p>
                              </div>
                              <div className="bg-black/20 p-3 rounded-2xl border border-white/5">
                                <p className="text-[8px] text-slate-500 uppercase font-black">{t.diametreLabel}</p>
                                <p className="text-xs font-bold text-white">Ø {cleanUnit(advice.electrodeDiameter || '1.6', 'mm')} mm</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-black/20 p-3 rounded-2xl border border-white/5">
                                <p className="text-[8px] text-slate-500 uppercase font-black">{t.fillerRodLabel}</p>
                                <p className="text-xs font-bold text-white">{advice.fillerMetalType || 'N/A'}</p>
                              </div>
                              <div className="bg-black/20 p-3 rounded-2xl border border-white/5">
                                <p className="text-[8px] text-slate-500 uppercase font-black">{t.diametreLabel}</p>
                                <p className="text-xs font-bold text-white">Ø {cleanUnit(advice.fillerMetalDiameter || '1.6', 'mm')} mm</p>
                              </div>
                            </div>
                          </div>
                        )}
                        {isStick && (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-black/20 p-3 rounded-2xl border border-white/5">
                              <p className="text-[8px] text-slate-500 uppercase font-black">{t.electrodeLabel}</p>
                              <p className="text-xs font-bold text-white">{advice.electrodeType || 'Rutile'}</p>
                            </div>
                            <div className="bg-black/20 p-3 rounded-2xl border border-white/5">
                              <p className="text-[8px] text-slate-500 uppercase font-black">{t.diametreLabel}</p>
                              <p className="text-xs font-bold text-white">Ø {cleanUnit(advice.electrodeDiameter || '2.5', 'mm')} mm</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bloc ASTUCES & CONSEILS */}
                    {advice.tips && advice.tips.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-black uppercase text-[#f95a2c] tracking-widest flex items-center gap-2">
                          <i className="fas fa-lightbulb"></i> {t.conseilsLabel}
                        </h4>
                        
                        {isPremium ? (
                          <div className="space-y-2">
                            {advice.tips.map((tip, i) => (
                              <div key={i} className="bg-white/5 p-3 rounded-2xl border border-white/5 flex gap-3 items-start">
                                <span className="text-[#f95a2c] font-black text-lg">#</span>
                                <p className="text-xs text-slate-300 leading-snug">{tip}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="bg-white/5 p-6 rounded-3xl border border-white/10 flex flex-col items-center justify-center gap-4 text-center backdrop-blur-sm relative overflow-hidden">
                            {/* Effet visuel de flou pour suggérer du contenu caché */}
                            <div className="absolute inset-0 bg-slate-900/40 pointer-events-none"></div>
                            <p className="text-xs font-black text-amber-400 uppercase tracking-widest z-10 drop-shadow-lg">
                              👑 PREMIUM REQUIS POUR VOIR LES ASTUCES
                            </p>
                            <button 
                              onClick={handlePremiumClick}
                              className="z-10 px-6 py-2 bg-gradient-to-r from-amber-400 to-yellow-600 text-white text-[10px] font-black rounded-xl uppercase tracking-widest shadow-lg shadow-amber-400/20 active:scale-95 transition-all"
                            >
                              {t.premiumBtn}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bloc PROCÉDÉS ALTERNATIFS - Réservé Premium */}
                    {isPremium && advice.alternatives && advice.alternatives.length > 0 && (
                      <div className="bg-white/5 p-4 rounded-3xl border border-white/5 space-y-2">
                         <p className="text-[10px] uppercase font-black text-slate-500">{t.alternativesLabel}</p>
                         {advice.alternatives.map((alt, i) => (
                           <div key={i} className="flex flex-col">
                             <span className="text-xs font-bold text-white uppercase italic">{alt.processName}</span>
                             <p className="text-[10px] text-slate-400 italic">{alt.description}</p>
                           </div>
                         ))}
                      </div>
                    )}

                    {/* Bloc SÉCURITÉ & DISCLAIMER */}
                    <div className="bg-red-950/20 border border-red-500/40 p-5 rounded-3xl space-y-4">
                      <div className="flex items-center gap-2 text-red-500">
                        <i className="fas fa-triangle-exclamation"></i>
                        <h4 className="text-xs font-black uppercase tracking-widest">{t.securite}</h4>
                      </div>
                      
                      {/* Disclaimer IA */}
                      <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 mb-4">
                        <p className="text-[10px] font-black text-red-400 uppercase leading-tight italic">
                          {t.aiWarning}
                        </p>
                      </div>

                      <div className="space-y-3">
                        {Array.isArray(advice?.detailedSafetyPoints) && advice.detailedSafetyPoints.slice(0, 3).map((point, idx) => (
                          <div key={idx} className="flex gap-3">
                            <div className="w-7 h-7 bg-black/20 rounded-lg flex items-center justify-center shrink-0 border border-white/5">
                              <i className={`fas ${getSafetyIcon(point?.category)} ${getSafetyColor(point?.category)} text-xs`}></i>
                            </div>
                            <div className="flex-1">
                              <p className="text-[10px] font-black uppercase tracking-tight text-white mb-0.5">{String(point?.title || t.warning)}</p>
                              <p className="text-[10px] text-slate-300 leading-tight italic">{String(point?.content || '')}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <button onClick={reset} className="w-full py-6 bg-gradient-to-r from-[#f95a2c] to-[#ff7e56] text-white rounded-[2rem] font-black text-2xl shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-4 uppercase italic tracking-tighter"><i className="fas fa-plus" />{t.nouvelleAnalyse}</button>
              </div>
            )}

            {isPremium && history.length > 0 && (
              <div className="w-full mt-12 mb-12 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center justify-between mb-4 px-2">
                  <h3 className="text-sm font-black uppercase italic text-white flex items-center gap-2"><i className="fas fa-history text-[#f95a2c]"></i> {t.historyTitle}</h3>
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">{history.length} / 3</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {history.map((item) => (
                    <div key={item.id} onClick={() => loadFromHistory(item)} className="aspect-square bg-white/5 border border-white/10 rounded-xl overflow-hidden cursor-pointer hover:border-[#f95a2c] transition-all relative group">
                      {item.image ? <img src={item.image} alt="Weld" className="w-full h-full object-cover opacity-60 group-hover:opacity-100" /> : <div className="w-full h-full flex items-center justify-center text-slate-700"><i className="fas fa-image text-lg"></i></div>}
                      <button onClick={(e) => deleteHistoryItem(item.id, e)} className="absolute top-1 right-1 w-5 h-5 bg-red-500/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><i className="fas fa-times text-[8px] text-white"></i></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
      <footer className="py-8 flex flex-col items-center gap-4 border-t border-white/5 opacity-60 w-full">
        <p className="text-[9px] text-slate-500 uppercase font-black tracking-[0.5em]">WELDMASTER AI • {isPremium ? "EXPERT EDITION" : "BASIC EDITION"}</p>
      </footer>
    </div>
  );
};

export default App;