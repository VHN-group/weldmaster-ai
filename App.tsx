
import React, { useState, useEffect, useRef } from 'react';
import { AppStep, WeldingMachine, Workpiece, WeldingAdvice, HistoryItem, Language } from './types';
import { analyzeMachine, analyzeWorkpiece, getFinalAdvice } from './services/geminiService';
import { StepIndicator } from './components/StepIndicator';
import { PhotoCapture } from './components/PhotoCapture';
import { translations } from './translations';

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('fr');
  const [step, setStep] = useState<AppStep>(AppStep.WELCOME);
  const [machine, setMachine] = useState<WeldingMachine | null>(null);
  const [workpiece, setWorkpiece] = useState<Workpiece | null>(null);
  const [advice, setAdvice] = useState<WeldingAdvice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const t = translations[lang];

  useEffect(() => {
    const saved = localStorage.getItem('weldmaster_history');
    const savedLang = localStorage.getItem('weldmaster_lang');
    if (saved) {
      try { setHistory(JSON.parse(saved)); } catch (e) {}
    }
    if (savedLang) setLang(savedLang as Language);

    // Écouteur pour le changement de statut premium venant du script global index.html
    const handlePremiumChange = (e: any) => {
      setIsPremium(e.detail);
    };
    window.addEventListener('premium-status-changed', handlePremiumChange);
    
    return () => window.removeEventListener('premium-status-changed', handlePremiumChange);
  }, []);

  const changeLang = (l: Language) => {
    setLang(l);
    localStorage.setItem('weldmaster_lang', l);
  };

  const startAnalysis = () => {
    setShowHistory(false);
    setError(null);
    setStep(AppStep.MACHINE_PHOTO);
  };

  // Fonction pour appeler la méthode native demandée
  const handleLaunchPurchase = () => {
    if ((window as any).AndroidApp && (window as any).AndroidApp.launchPurchase) {
      (window as any).AndroidApp.launchPurchase();
    } else {
      console.warn("AndroidApp.launchPurchase() non détecté dans cet environnement.");
      // Pour debug web uniquement :
      // (window as any).setPremiumStatus(true);
    }
  };

  const saveToHistory = (m: WeldingMachine, w: Workpiece, a: WeldingAdvice) => {
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      machine: m,
      workpiece: w,
      advice: a
    };
    const updatedHistory = [newItem, ...history].slice(0, 10);
    setHistory(updatedHistory);
    localStorage.setItem('weldmaster_history', JSON.stringify(updatedHistory));
  };

  const handleMachinePhoto = async (base64: string) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const data = await analyzeMachine(base64);
      setMachine({
        brand: data.brand || 'Poste Manuel',
        model: data.model || '',
        type: data.type === 'Unknown' ? 'MIG' : data.type
      });
      setStep(AppStep.WORKPIECE_PHOTO);
    } catch (err) {
      setMachine({ brand: 'Poste Manuel', model: '', type: 'MIG' });
      setStep(AppStep.WORKPIECE_PHOTO);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleWorkpiecePhoto = async (base64: string) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const data = await analyzeWorkpiece(base64);
      setWorkpiece({
        ...data,
        thicknessB: data.thicknessB || data.thicknessA,
        fillerMetalType: '',
        fillerMetalDiameter: '',
        migWireDiameter: '0.8'
      });
      setStep(AppStep.DETAILS_CONFIRMATION);
    } catch (err) {
      setError(t.resultError);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const finalizeAdvice = async (m: WeldingMachine, w: Workpiece, l: Language) => {
    if (!m || !w) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getFinalAdvice(m, w, l);
      setAdvice(data);
      setStep(AppStep.RESULTS);
      saveToHistory(m, w, data);
    } catch (err) {
      setError(t.resultError);
      setStep(AppStep.RESULTS);
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setStep(AppStep.WELCOME);
    setMachine(null);
    setWorkpiece(null);
    setAdvice(null);
    setError(null);
    setShowHistory(false);
    setIsAnalyzing(false);
    setIsLoading(false);
  };

  const loadFromHistory = (item: HistoryItem) => {
    setMachine(item.machine);
    setWorkpiece(item.workpiece);
    setAdvice(item.advice);
    setStep(AppStep.RESULTS);
    setShowHistory(false);
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    localStorage.setItem('weldmaster_history', JSON.stringify(updated));
  };

  const getProcessName = (type?: string) => {
    switch(type) {
      case 'MIG': return 'MIG / MAG';
      case 'TIG': return 'TIG';
      case 'Stick': return 'Stick (ARC / MMA)';
      default: return type || 'Inconnu';
    }
  };

  const cleanUnit = (val?: string, unit?: string) => {
    if (!val || !unit) return val || '';
    const trimmed = val.trim();
    const u = unit.toLowerCase();
    const t = trimmed.toLowerCase();
    if (t.endsWith(u)) {
      return trimmed.substring(0, trimmed.length - unit.length).trim();
    }
    return trimmed;
  };

  const formatDim = (val?: string) => {
    if (!val || val === 'N/A') return 'N/A';
    return `${cleanUnit(val, 'mm')} mm`;
  };

  const isMig = machine?.type === 'MIG';
  const isStick = machine?.type === 'Stick';
  const isTig = machine?.type === 'TIG';

  const photoLabels = {
    change: t.change,
    capture: t.capture,
    engine: t.engine
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
        {step !== AppStep.WELCOME && (
          <button onClick={reset} className="text-slate-400 hover:text-white transition-colors p-2 bg-white/5 rounded-full">
            <i className="fas fa-rotate-left"></i>
          </button>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center py-6">
        {isLoading ? (
          <div className="flex flex-col items-center animate-pulse">
            <div className="w-16 h-16 border-4 border-[#f95a2c] border-t-transparent rounded-full animate-spin mb-6"></div>
            <p className="text-[#f95a2c] font-bold text-lg italic uppercase text-center px-6">Gemini 3 Engine...</p>
          </div>
        ) : (
          <>
            {step !== AppStep.WELCOME && <StepIndicator currentStep={step} lang={lang} />}
            
            {error && step !== AppStep.RESULTS && (
              <div className="w-full bg-red-900/30 border border-red-500/50 p-4 rounded-xl mb-6 text-red-100 text-sm flex items-start gap-3 animate-in slide-in-from-top-2">
                <i className="fas fa-triangle-exclamation mt-1"></i>
                <p>{error}</p>
              </div>
            )}

            {step === AppStep.WELCOME && !showHistory && (
              <div className="text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-sm w-full">
                <div className="flex justify-center gap-2 p-1 bg-white/5 rounded-2xl w-fit mx-auto border border-white/10">
                  {(['fr', 'en', 'es', 'de'] as Language[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => changeLang(l)}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${
                        lang === l ? 'bg-[#f95a2c] text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>

                <div className="space-y-4">
                  <h2 className="text-4xl font-black leading-none uppercase italic tracking-tighter">
                    {t.welcomeTitle.split(' ').slice(0, -2).join(' ')} <br/>
                    <span className="text-[#f95a2c]">{t.welcomeTitle.split(' ').slice(-2).join(' ')}</span>
                  </h2>
                  <p className="text-slate-300 font-medium text-sm leading-snug px-6">{t.welcomeSub}</p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-[#f95a2c] border border-white/5"><i className="fas fa-plug text-xl"></i></div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t.scanPoste}</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-blue-400 border border-white/5"><i className="fas fa-cubes text-xl"></i></div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t.scanMetal}</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-green-500 border border-white/5"><i className="fas fa-check-double text-xl"></i></div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t.scanOk}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <button onClick={startAnalysis} className="w-full py-6 bg-[#f95a2c] hover:bg-[#d84a22] text-white rounded-3xl font-black text-xl shadow-2xl active:scale-95 flex items-center justify-center gap-4 uppercase italic tracking-tighter transition-all">
                    <i className="fas fa-camera text-2xl"></i>{t.startBtn}
                  </button>

                  {!isPremium && (
                    <button 
                      onClick={handleLaunchPurchase} 
                      className="w-full py-4 bg-gradient-to-r from-amber-400 to-yellow-600 text-white rounded-2xl font-black text-sm shadow-xl active:scale-95 flex items-center justify-center gap-3 uppercase italic tracking-tighter transition-all border border-amber-300/30"
                    >
                      <i className="fas fa-crown"></i>
                      {t.premiumBtn}
                    </button>
                  )}

                  {history.length > 0 && (
                    <button onClick={() => setShowHistory(true)} className="w-full py-4 bg-white/5 hover:bg-white/10 text-slate-300 rounded-2xl font-bold text-sm border border-white/10 transition-all flex items-center justify-center gap-3">
                      <i className="fas fa-history text-[#f95a2c]"></i>{t.historyBtn} ({history.length})
                    </button>
                  )}
                </div>

                <div className="bg-orange-500/5 border border-orange-500/10 p-5 rounded-2xl text-left">
                  <div className="flex items-center gap-2 mb-2"><i className="fas fa-shield-halved text-[#f95a2c] text-xs"></i><p className="text-[10px] text-[#f95a2c] uppercase font-black tracking-widest">{t.warning}</p></div>
                  <p className="text-[10px] text-slate-400 leading-relaxed italic">{t.disclaimer}</p>
                </div>
              </div>
            )}

            {showHistory && (
              <div className="w-full max-w-md animate-in fade-in slide-in-from-right-4 px-2">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-black uppercase italic text-white flex items-center gap-3"><i className="fas fa-history text-[#f95a2c]"></i>{t.historyBtn}</h3>
                  <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white uppercase text-[10px] font-bold tracking-widest">{t.back}</button>
                </div>
                <div className="space-y-3">
                  {history.map(item => (
                    <div key={item.id} onClick={() => loadFromHistory(item)} className="bg-white/5 border border-white/10 p-4 rounded-2xl hover:bg-white/10 transition-all cursor-pointer flex items-center justify-between group">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase text-[#f95a2c] tracking-widest">{getProcessName(item.machine.type)}</span>
                          <span className="text-[9px] text-slate-500">{new Date(item.timestamp).toLocaleDateString()}</span>
                        </div>
                        <h4 className="text-sm font-bold text-white uppercase tracking-tight">{item.machine.brand} {item.machine.model}</h4>
                        <div className="flex gap-2 mt-2">
                          <span className="text-[9px] bg-white/5 border border-white/10 px-2 py-1 rounded-lg text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                            <i className="fas fa-layer-group opacity-50 text-blue-400"></i>{item.workpiece.material}
                          </span>
                          <span className="text-[9px] bg-white/5 border border-white/10 px-2 py-1 rounded-lg text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                            <i className="fas fa-ruler-vertical opacity-50 text-orange-400"></i>{formatDim(item.workpiece.thicknessA)}
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => deleteHistoryItem(item.id, e)} 
                        className="w-10 h-10 rounded-full bg-red-500/10 text-red-500/60 hover:text-red-500 active:bg-red-500/20 transition-all flex items-center justify-center shrink-0 ml-2"
                        aria-label="Delete history item"
                      >
                        <i className="fas fa-trash-can text-sm"></i>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === AppStep.MACHINE_PHOTO && (
              <PhotoCapture 
                icon="fa-plug" 
                title={t.stepPoste} 
                description={t.machinePhotoDesc} 
                onCapture={handleMachinePhoto} 
                isAnalyzing={isAnalyzing} 
                loadingMessage={t.analyzingWelder} 
                labels={photoLabels}
              />
            )}
            {step === AppStep.WORKPIECE_PHOTO && (
              <PhotoCapture 
                icon="fa-cubes" 
                title={t.stepPieces} 
                description={t.workpiecePhotoDesc} 
                onCapture={handleWorkpiecePhoto} 
                isAnalyzing={isAnalyzing} 
                loadingMessage={t.analyzingWork} 
                labels={photoLabels}
              />
            )}

            {step === AppStep.DETAILS_CONFIRMATION && machine && workpiece && (
              <div className="w-full space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10 space-y-6">
                  <h3 className="text-xl font-bold flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-500/20 text-green-500 rounded flex items-center justify-center"><i className="fas fa-check"></i></div>
                    {t.stepValidation}
                  </h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">{t.posteDetecte}</label>
                      <input className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none transition-colors" value={`${machine.brand || ''} ${machine.model || ''}`} onChange={(e) => setMachine({...machine, brand: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">{t.procede}</label>
                      <select className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none" value={machine.type} onChange={(e) => setMachine({...machine, type: e.target.value as any})}>
                        <option value="MIG">MIG / MAG</option>
                        <option value="TIG">TIG</option>
                        <option value="Stick">Stick (ARC / MMA)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">{t.matiere}</label>
                      <input className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none" value={workpiece.material || ''} onChange={(e) => setWorkpiece({...workpiece, material: e.target.value})} />
                    </div>
                    <div></div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">{t.epaisseurA}</label>
                      <input className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none" value={workpiece.thicknessA || ''} onChange={(e) => setWorkpiece({...workpiece, thicknessA: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">{t.epaisseurB}</label>
                      <input className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none" value={workpiece.thicknessB || ''} placeholder="Optionnel" onChange={(e) => setWorkpiece({...workpiece, thicknessB: e.target.value})} />
                    </div>

                    {machine.type === 'MIG' && (
                       <div className="col-span-2 p-4 bg-orange-500/5 rounded-xl border border-orange-500/10 space-y-3">
                        <label className="text-[10px] uppercase text-[#f95a2c] font-black tracking-widest flex items-center gap-2">
                           <i className="fas fa-circle-nodes"></i>{t.migWireDiam}
                        </label>
                        <div className="grid grid-cols-5 gap-2">
                          {['0.6', '0.8', '0.9', '1.0', '1.2'].map(dia => (
                            <button
                              key={dia}
                              onClick={() => setWorkpiece({...workpiece, migWireDiameter: dia})}
                              className={`py-2 rounded-lg text-[10px] font-black border transition-all ${
                                workpiece.migWireDiameter === dia 
                                ? 'bg-[#f95a2c] border-[#f95a2c] text-white shadow-lg' 
                                : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                              }`}
                            >
                              {dia}
                            </button>
                          ))}
                        </div>
                       </div>
                    )}
                  </div>
                </div>
                <button onClick={() => finalizeAdvice(machine!, workpiece!, lang)} className="w-full py-5 bg-[#f95a2c] hover:bg-[#d84a22] text-white rounded-2xl font-black text-xl shadow-2xl active:scale-95 uppercase italic tracking-tighter transition-all">{t.calculer}</button>
              </div>
            )}

            {step === AppStep.RESULTS && (
              advice ? (
                <div className="w-full space-y-6 pb-12 animate-in fade-in zoom-in-95 duration-500">
                  <div ref={resultsRef} className="bg-[#1e284b] rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                    <div className="bg-gradient-to-r from-[#f95a2c] to-[#ff7e56] p-6 shadow-lg">
                      <h3 className="text-2xl font-black uppercase italic leading-none tracking-tighter drop-shadow-md">{t.paramExperts}</h3>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="px-2 py-1 bg-black/20 rounded-lg text-[10px] font-black uppercase tracking-widest border border-white/10 text-white flex items-center gap-2">
                           <i className="fas fa-gear text-white/50"></i> {getProcessName(machine?.type)}
                        </span>
                        <p className="text-white/80 text-[10px] font-bold uppercase tracking-[0.2em]">AI Powered</p>
                      </div>
                    </div>
                    <div className="p-6 space-y-8">
                      <div className="grid grid-cols-1 gap-4">
                        <div className="bg-white/5 p-5 rounded-3xl border border-white/10 flex flex-col gap-4">
                          <div className="flex justify-between items-start">
                             <div>
                                <p className="text-[10px] text-[#f95a2c] font-black uppercase mb-1">{isMig ? t.tension : t.intensite}</p>
                                <p className="text-5xl font-black">
                                  {isMig ? cleanUnit(advice.voltage, 'V') : cleanUnit(advice.amperage, 'A')}
                                  <span className="text-2xl text-slate-500 ml-1">{isMig ? 'V' : 'A'}</span>
                                </p>
                             </div>
                             <div className="bg-white/5 p-3 rounded-2xl border border-white/10">
                                <p className="text-[10px] text-blue-400 font-black uppercase mb-1">{t.polarite}</p>
                                <p className="text-xl font-black">{advice.polarity || 'DC+'}</p>
                             </div>
                          </div>
                          
                          {advice.wireSpeed && (
                            <div className="flex items-center justify-between pt-4 border-t border-white/5">
                              <span className="text-[10px] text-slate-400 uppercase font-black">{t.vitesseFil}</span>
                              <span className="text-2xl font-black italic">{advice.wireSpeed}</span>
                            </div>
                          )}

                          {advice.machineProcedure && (
                            <div className="mt-2 p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex gap-3">
                               <div className="w-8 h-8 bg-[#f95a2c] rounded-lg flex items-center justify-center shrink-0">
                                  <i className="fas fa-hand text-white text-sm"></i>
                               </div>
                               <div className="flex-1">
                                  <p className="text-[9px] font-black text-[#f95a2c] uppercase tracking-widest mb-1">{t.manualCont}</p>
                                  <p className="text-xs text-slate-200 leading-snug font-medium italic">{advice.machineProcedure}</p>
                               </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {isMig && advice.inductance && (
                        <div className="bg-slate-800/40 p-5 rounded-3xl border border-white/10 space-y-4">
                          <h4 className="text-[10px] font-black uppercase text-blue-400 tracking-widest flex items-center gap-2">
                             <i className="fas fa-sliders"></i> Paramètres Avancés MIG/MAG
                          </h4>
                          <div className="grid grid-cols-1 gap-3 text-center">
                            <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                              <p className="text-[9px] text-slate-500 uppercase font-black mb-1">{t.inductance}</p>
                              <p className="text-xs font-bold text-white">{advice.inductance}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="bg-slate-800/40 p-5 rounded-3xl border border-white/10 space-y-4">
                        <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                           <i className="fas fa-box-open"></i>{t.consommablesLabel}
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          {isStick && (
                            <>
                              <div className="space-y-1">
                                 <p className="text-[10px] text-slate-500 uppercase font-black">{t.electrodeLabel}</p>
                                 <p className="text-sm font-bold text-white leading-tight">{advice.electrodeType || 'N/A'}</p>
                              </div>
                              <div className="space-y-1">
                                 <p className="text-[10px] text-slate-500 uppercase font-black">{t.diametreLabel}</p>
                                 <p className="text-sm font-bold text-white">{formatDim(advice.fillerMetalDiameter)}</p>
                              </div>
                            </>
                          )}
                          {isMig && (
                            <>
                              <div className="space-y-1">
                                 <p className="text-[10px] text-slate-500 uppercase font-black">{t.filLabel}</p>
                                 <p className="text-sm font-bold text-white leading-tight">{advice.fillerMetalType || 'N/A'}</p>
                              </div>
                              <div className="space-y-1">
                                 <p className="text-[10px] text-slate-500 uppercase font-black">{t.diametreLabel}</p>
                                 <p className="text-sm font-bold text-white">{formatDim(advice.fillerMetalDiameter)}</p>
                              </div>
                            </>
                          )}
                          {isTig && (
                            <>
                              <div className="space-y-1">
                                 <p className="text-[10px] text-slate-500 uppercase font-black">{t.tungstenLabel}</p>
                                 <p className="text-sm font-bold text-white leading-tight">{advice.electrodeType || 'N/A'}</p>
                              </div>
                              <div className="space-y-1">
                                 <p className="text-[10px] text-slate-500 uppercase font-black">{t.fillerRodLabel}</p>
                                 <p className="text-sm font-bold text-white leading-tight">{advice.fillerMetalType || 'N/A'}</p>
                              </div>
                              <div className="space-y-1 col-span-2 pt-2 border-t border-white/5">
                                 <p className="text-[10px] text-slate-500 uppercase font-black">{t.diametreLabel}</p>
                                 <p className="text-sm font-bold text-white">{formatDim(advice.fillerMetalDiameter)}</p>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {advice.gasFlow && (
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <i className="fas fa-wind text-blue-400"></i>
                            <span className="text-[10px] text-slate-500 uppercase font-black">{t.protectionGaz}</span>
                          </div>
                          <span className="text-sm font-bold text-white">{advice.gasFlow}</span>
                        </div>
                      )}

                      {advice.tips && advice.tips.length > 0 && (
                        <div className="bg-blue-950/20 border border-blue-500/30 p-6 rounded-3xl space-y-4">
                          <h4 className="text-xs font-black uppercase text-blue-400 tracking-widest flex items-center gap-2">
                             <i className="fas fa-lightbulb text-amber-400"></i>{t.conseilsLabel}
                          </h4>
                          <ul className="space-y-2">
                            {advice.tips.map((tip, i) => (
                              <li key={i} className="text-[11px] text-slate-300 flex items-start gap-2 leading-relaxed">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></span>{tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {advice.alternatives && advice.alternatives.length > 0 && (
                        <div className="bg-purple-950/20 border border-purple-500/30 p-6 rounded-3xl space-y-4">
                          <h4 className="text-xs font-black uppercase text-purple-400 tracking-widest flex items-center gap-2">
                             <i className="fas fa-shuffle"></i>{t.alternativesLabel}
                          </h4>
                          <div className="space-y-4">
                            {advice.alternatives.map((alt, i) => (
                              <div key={i} className="space-y-1">
                                <p className="text-[11px] font-black uppercase text-purple-300">{alt.processName}</p>
                                <p className="text-[10px] text-slate-400 leading-tight italic">{alt.description}</p>
                                <p className="text-[10px] text-slate-300 font-bold bg-white/5 p-2 rounded-lg mt-1">{alt.mainSettings}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="bg-red-950/20 border border-red-500/30 p-6 rounded-3xl space-y-4">
                        <h4 className="text-xs font-black uppercase text-red-500 tracking-widest flex items-center gap-2">
                           <i className="fas fa-triangle-exclamation"></i>{t.securite}
                        </h4>
                        <ul className="space-y-2">
                          <li className="text-[11px] text-red-400 flex items-start gap-2 leading-relaxed font-bold italic">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0"></span>{t.aiWarning}
                          </li>
                          {advice.safetyPrecautions.map((p, i) => (
                            <li key={i} className="text-[11px] text-slate-300 flex items-start gap-2 leading-relaxed">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0"></span>{p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <button onClick={reset} className="w-full py-6 bg-gradient-to-r from-[#f95a2c] to-[#ff7e56] text-white rounded-[2rem] font-black text-2xl shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-4 uppercase italic tracking-tighter">
                      <i className="fas fa-plus"></i>{t.nouvelleAnalyse}
                    </button>
                    {/* Mention de sauvegarde demandée */}
                    <p className="text-center text-slate-500 text-[11px] font-medium leading-relaxed italic animate-in fade-in slide-in-from-top-2 duration-700">
                      <i className="fas fa-history mr-2 opacity-50"></i>{t.historySavedNote}
                    </p>
                  </div>
                </div>
              ) : error ? (
                <div className="w-full max-sm flex flex-col items-center gap-8 animate-in fade-in zoom-in-95 duration-500 text-center mx-auto">
                   <div className="w-24 h-24 rounded-[2rem] bg-red-500/10 flex items-center justify-center border border-red-500/20">
                      <i className="fas fa-triangle-exclamation text-4xl text-red-500"></i>
                   </div>
                   <div className="space-y-3">
                      <h3 className="text-2xl font-black uppercase italic tracking-tighter text-white">{t.resultError}</h3>
                      <p className="text-slate-400 text-sm font-medium leading-relaxed">{error}</p>
                   </div>
                   <div className="w-full space-y-3">
                      <button onClick={() => machine && workpiece && finalizeAdvice(machine, workpiece, lang)} className="w-full py-5 bg-[#f95a2c] text-white rounded-2xl font-black text-lg uppercase italic tracking-tighter shadow-lg active:scale-95 transition-all">
                        {t.retry}
                      </button>
                      <button onClick={reset} className="w-full py-5 bg-white/5 border border-white/10 text-slate-300 rounded-2xl font-black text-lg uppercase italic tracking-tighter active:scale-95 transition-all">
                        {t.backHome}
                      </button>
                   </div>
                </div>
              ) : null
            )}
          </>
        )}
      </main>
      <footer className="py-8 flex flex-col items-center gap-4 border-t border-white/5 opacity-60">
        <p className="text-[9px] text-slate-500 uppercase font-black tracking-[0.5em]">WELDMASTER AI &bull; 2025</p>
      </footer>
    </div>
  );
};

export default App;
