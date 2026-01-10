
import React, { useState, useEffect, useRef } from 'react';
import { AppStep, WeldingMachine, Workpiece, WeldingAdvice, HistoryItem } from './types';
import { analyzeMachine, analyzeWorkpiece, getFinalAdvice } from './services/geminiService';
import { StepIndicator } from './components/StepIndicator';
import { PhotoCapture } from './components/PhotoCapture';
import html2canvas from 'html2canvas';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.WELCOME);
  const [machine, setMachine] = useState<WeldingMachine | null>(null);
  const [workpiece, setWorkpiece] = useState<Workpiece | null>(null);
  const [advice, setAdvice] = useState<WeldingAdvice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Define isTigOrStick to check if the current welding process requires extra user input
  const isTigOrStick = machine?.type === 'TIG' || machine?.type === 'Stick';
  const isMig = machine?.type === 'MIG';

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem('weldmaster_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  const startAnalysis = () => {
    setShowHistory(false);
    setStep(AppStep.MACHINE_PHOTO);
  };

  const saveToHistory = (m: WeldingMachine, w: Workpiece, a: WeldingAdvice) => {
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      machine: m,
      workpiece: w,
      advice: a
    };
    const updatedHistory = [newItem, ...history].slice(0, 10); // Keep last 10
    setHistory(updatedHistory);
    localStorage.setItem('weldmaster_history', JSON.stringify(updatedHistory));
  };

  const handleMachinePhoto = async (base64: string) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const data = await analyzeMachine(base64);
      setMachine(data);
      setStep(AppStep.WORKPIECE_PHOTO);
    } catch (err) {
      setError("Erreur lors de l'analyse du poste. Réessayez.");
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
        fillerMetalType: '',
        fillerMetalDiameter: ''
      });
      setStep(AppStep.DETAILS_CONFIRMATION);
    } catch (err) {
      setError("Erreur lors de l'analyse des pièces. Réessayez.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const finalizeAdvice = async () => {
    if (!machine || !workpiece) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const data = await getFinalAdvice(machine, workpiece);
      setAdvice(data);
      setStep(AppStep.RESULTS);
      saveToHistory(machine, workpiece, data);
    } catch (err) {
      setError("Erreur lors du calcul des réglages.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveScreenshot = async () => {
    if (!resultsRef.current) return;
    try {
      const canvas = await html2canvas(resultsRef.current, {
        backgroundColor: '#1e284b',
        scale: 2,
        logging: false,
        useCORS: true
      });
      const image = canvas.toDataURL("image/png");
      const link = document.createElement('a');
      link.href = image;
      link.download = `WeldMaster-Advice-${new Date().getTime()}.png`;
      link.click();
    } catch (err) {
      console.error("Failed to capture screenshot", err);
      alert("Erreur lors de l'enregistrement de l'image.");
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

  const disclaimerText = "Attention : Pour toute soudure sur équipement sous pression ou supportant de fortes charges, la conformité doit être impérativement validée par un organisme compétent. L'IA peut commettre des erreurs techniques.";

  return (
    <div className="max-w-2xl mx-auto min-h-screen flex flex-col p-4 bg-[#1e284b]">
      {/* Header */}
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

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center py-6">
        {isLoading ? (
          <div className="flex flex-col items-center animate-pulse">
            <div className="w-16 h-16 border-4 border-[#f95a2c] border-t-transparent rounded-full animate-spin mb-6"></div>
            <p className="text-[#f95a2c] font-bold text-lg italic uppercase text-center px-6">Optimisation des paramètres...</p>
            <p className="text-slate-400 text-[10px] mt-2 font-bold uppercase tracking-widest">GEMINI 3 PRO ENGINE</p>
          </div>
        ) : (
          <>
            {step !== AppStep.WELCOME && <StepIndicator currentStep={step} />}
            
            {error && (
              <div className="w-full bg-red-900/30 border border-red-500/50 p-4 rounded-xl mb-6 text-red-100 text-sm flex items-start gap-3 animate-in slide-in-from-top-2">
                <i className="fas fa-triangle-exclamation mt-1"></i>
                <p>{error}</p>
              </div>
            )}

            {step === AppStep.WELCOME && !showHistory && (
              <div className="text-center space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-sm w-full">
                <div className="space-y-4">
                  <h2 className="text-4xl font-black leading-none uppercase italic tracking-tighter">
                    RÉGLEZ VOTRE POSTE <br/>
                    <span className="text-[#f95a2c]">EN 2 PHOTOS</span>
                  </h2>
                  <p className="text-slate-300 font-medium text-sm leading-snug px-6">
                    L'IA détecte votre matériel et analyse vos pièces pour des réglages parfaits.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-[#f95a2c] border border-white/5 shadow-inner">
                      <i className="fas fa-plug text-xl"></i>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Scan Poste</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-blue-400 border border-white/5 shadow-inner">
                      <i className="fas fa-cubes text-xl"></i>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Scan Métal</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-green-500 border border-white/5 shadow-inner">
                      <i className="fas fa-check-double text-xl"></i>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Soudage OK</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={startAnalysis}
                    className="w-full py-6 bg-[#f95a2c] hover:bg-[#d84a22] text-white rounded-3xl font-black text-xl shadow-2xl shadow-[#f95a2c]/40 transition-all transform active:scale-95 flex items-center justify-center gap-4 uppercase tracking-tighter italic"
                  >
                    <i className="fas fa-camera text-2xl"></i>
                    Démarrer maintenant
                  </button>

                  {history.length > 0 && (
                    <button 
                      onClick={() => setShowHistory(true)}
                      className="w-full py-4 bg-white/5 hover:bg-white/10 text-slate-300 rounded-2xl font-bold text-sm border border-white/10 transition-all flex items-center justify-center gap-3"
                    >
                      <i className="fas fa-history text-[#f95a2c]"></i>
                      Consulter l'historique ({history.length})
                    </button>
                  )}
                </div>

                <div className="bg-orange-500/5 border border-orange-500/10 p-5 rounded-2xl text-left shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="fas fa-shield-halved text-[#f95a2c] text-xs"></i>
                    <p className="text-[10px] text-[#f95a2c] uppercase font-black tracking-widest">Avertissement</p>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed italic">
                    {disclaimerText}
                  </p>
                </div>
              </div>
            )}

            {showHistory && (
              <div className="w-full max-w-md animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-black uppercase italic text-white flex items-center gap-3">
                    <i className="fas fa-history text-[#f95a2c]"></i>
                    Historique
                  </h3>
                  <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white uppercase text-[10px] font-bold tracking-widest">Retour</button>
                </div>
                <div className="space-y-3">
                  {history.map(item => (
                    <div 
                      key={item.id} 
                      onClick={() => loadFromHistory(item)}
                      className="bg-white/5 border border-white/10 p-4 rounded-2xl hover:bg-white/10 transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase text-[#f95a2c] tracking-widest">{getProcessName(item.machine.type)}</span>
                          <span className="text-[9px] text-slate-500">{new Date(item.timestamp).toLocaleDateString()}</span>
                        </div>
                        <h4 className="text-sm font-bold text-white uppercase tracking-tight">{item.machine.brand} {item.machine.model}</h4>
                        <p className="text-xs text-slate-400">{item.workpiece.material} • {item.workpiece.thickness}mm</p>
                      </div>
                      <button 
                        onClick={(e) => deleteHistoryItem(item.id, e)}
                        className="w-8 h-8 rounded-full bg-red-500/10 text-red-500/50 hover:text-red-500 hover:bg-red-500/20 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <i className="fas fa-trash-can text-xs"></i>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === AppStep.MACHINE_PHOTO && (
              <div className="w-full animate-in fade-in slide-in-from-right-4">
                <PhotoCapture 
                  icon="fa-plug"
                  title="Étape 1 : Votre Poste"
                  description="Prenez une photo de la face avant ou de l'étiquette modèle."
                  onCapture={handleMachinePhoto}
                  isAnalyzing={isAnalyzing}
                  loadingMessage="Analyse du poste en cours..."
                />
              </div>
            )}

            {step === AppStep.WORKPIECE_PHOTO && (
              <div className="w-full animate-in fade-in slide-in-from-right-4">
                <PhotoCapture 
                  icon="fa-cubes"
                  title="Étape 2 : Vos Pièces"
                  description="Prenez une photo du métal et de l'assemblage souhaité."
                  onCapture={handleWorkpiecePhoto}
                  isAnalyzing={isAnalyzing}
                  loadingMessage="Analyse des pièces en cours..."
                />
              </div>
            )}

            {step === AppStep.DETAILS_CONFIRMATION && machine && workpiece && (
              <div className="w-full space-y-6 animate-in fade-in slide-in-from-right-4">
                <div className="bg-white/5 rounded-2xl p-6 border border-white/10 space-y-6">
                  <h3 className="text-xl font-bold flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-500/20 text-green-500 rounded flex items-center justify-center">
                      <i className="fas fa-check"></i>
                    </div>
                    Confirmation
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">Poste détecté</label>
                      <input 
                        className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none transition-colors font-medium"
                        value={`${machine.brand || ''} ${machine.model || ''}`}
                        onChange={(e) => {
                          const val = e.target.value.split(' ');
                          setMachine({...machine, brand: val[0], model: val.slice(1).join(' ')});
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">Procédé</label>
                      <select 
                        className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none transition-colors font-medium"
                        value={machine.type}
                        onChange={(e) => setMachine({...machine, type: e.target.value as any})}
                      >
                        <option value="MIG">MIG / MAG</option>
                        <option value="TIG">TIG</option>
                        <option value="Stick">Stick (ARC / MMA)</option>
                        <option value="Unknown">Inconnu</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">Matière</label>
                      <input 
                        className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none transition-colors"
                        value={workpiece.material || ''}
                        onChange={(e) => setWorkpiece({...workpiece, material: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">Épaisseur</label>
                      <input 
                        className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none transition-colors"
                        value={workpiece.thickness || ''}
                        onChange={(e) => setWorkpiece({...workpiece, thickness: e.target.value})}
                      />
                    </div>

                    {isTigOrStick && (
                      <div className="col-span-2 p-4 bg-[#f95a2c]/5 rounded-xl border border-[#f95a2c]/20 space-y-4">
                        <p className="text-[10px] font-black text-[#f95a2c] uppercase tracking-widest flex items-center gap-2">
                          <i className="fas fa-info-circle"></i>
                          DÉTAILS {machine.type}
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">Type {machine.type === 'Stick' ? 'Électrode' : 'Apport'}</label>
                            <input 
                              placeholder={machine.type === 'Stick' ? "ex: Rutile E6013" : "ex: ER308L"}
                              className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none transition-colors"
                              value={workpiece.fillerMetalType || ''}
                              onChange={(e) => setWorkpiece({...workpiece, fillerMetalType: e.target.value})}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">Diamètre (mm)</label>
                            <input 
                              placeholder="ex: 2.5"
                              className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none transition-colors"
                              value={workpiece.fillerMetalDiameter || ''}
                              onChange={(e) => setWorkpiece({...workpiece, fillerMetalDiameter: e.target.value})}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  onClick={finalizeAdvice}
                  className="w-full py-5 bg-[#f95a2c] hover:bg-[#d84a22] text-white rounded-2xl font-black text-xl shadow-2xl shadow-[#f95a2c]/30 transition-all transform active:scale-95 uppercase italic tracking-tighter"
                >
                  Calculer les réglages
                </button>
              </div>
            )}

            {step === AppStep.RESULTS && advice && (
              <div className="w-full space-y-6 pb-12 animate-in fade-in zoom-in-95 duration-500">
                <div ref={resultsRef} className="bg-[#1e284b] rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                  {/* Header optimized for visibility */}
                  <div className="bg-gradient-to-r from-[#f95a2c] to-[#ff7e56] p-6 shadow-lg">
                    <div className="w-full flex items-center justify-between">
                      <div className="text-white">
                        <h3 className="text-2xl font-black uppercase italic leading-none tracking-tighter drop-shadow-md">Paramètres Experts</h3>
                        <p className="text-white/80 text-[10px] mt-1 font-bold uppercase tracking-[0.2em]">Optimisé par Gemini AI</p>
                      </div>
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                        <i className="fas fa-bolt text-lg text-white"></i>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="px-3 py-1 bg-black/30 rounded-full text-[10px] text-white font-black uppercase tracking-widest border border-white/20">
                        {getProcessName(machine?.type)}
                      </span>
                      <span className="px-3 py-1 bg-white/20 rounded-full text-[10px] text-white font-black uppercase tracking-widest border border-white/20">
                        {workpiece?.thickness}mm {workpiece?.material}
                      </span>
                    </div>
                  </div>
                  
                  <div className="p-6 space-y-10">
                    {/* Main Parameters Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1 h-4 bg-[#f95a2c] rounded-full"></div>
                        <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-[0.3em]">Réglages Machine</h4>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Primary Parameter (Voltage or Amperage) */}
                        <div className="bg-white/[0.05] p-6 rounded-2xl border border-white/10 shadow-lg flex flex-col justify-center min-h-[120px] relative overflow-hidden group hover:border-[#f95a2c]/50 transition-all">
                          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-25 transition-opacity pointer-events-none">
                            <i className="fas fa-bolt-lightning text-5xl"></i>
                          </div>
                          <p className="text-[11px] text-[#f95a2c] font-black uppercase tracking-widest mb-3 flex items-center gap-2">
                            <i className="fas fa-power-off text-xs"></i>
                            {isMig ? 'Tension de Soudage' : 'Intensité de Courant'}
                          </p>
                          <div className="flex flex-col">
                            <div className="flex items-baseline gap-1">
                              <p className="text-5xl font-black text-white tracking-tighter drop-shadow-md">
                                {isMig ? (advice.voltage || advice.amperage) : advice.amperage}
                              </p>
                              <p className="text-2xl font-black text-slate-500">{isMig ? 'V' : 'A'}</p>
                            </div>
                            {advice.machineSetting && (
                               <div className="mt-2 px-3 py-1 bg-[#f95a2c]/20 border border-[#f95a2c]/40 rounded-lg inline-block self-start">
                                  <p className="text-[10px] text-[#f95a2c] font-black uppercase tracking-widest">Réglage Physique</p>
                                  <p className="text-lg font-black text-white italic">{advice.machineSetting}</p>
                               </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Secondary Parameter (Polarity) */}
                        <div className="bg-white/[0.05] p-6 rounded-2xl border border-white/10 shadow-lg flex flex-col justify-center min-h-[120px] relative overflow-hidden group hover:border-blue-500/50 transition-all">
                          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-25 transition-opacity pointer-events-none">
                            <i className="fas fa-magnet text-5xl"></i>
                          </div>
                          <p className="text-[11px] text-blue-400 font-black uppercase tracking-widest mb-3 flex items-center gap-2">
                            <i className="fas fa-plus-minus text-xs"></i>
                            Polarité / Branchement
                          </p>
                          <p className="text-4xl font-black text-white tracking-tighter drop-shadow-md">
                            {advice.polarity || 'DC+'}
                          </p>
                        </div>
                      </div>

                      {/* Additional Details Grid */}
                      <div className="grid grid-cols-1 gap-4">
                        {isMig && advice.amperage && (
                           <div className="bg-white/[0.03] p-5 rounded-2xl border border-white/5 flex items-center justify-between group hover:bg-white/[0.06] transition-all">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20">
                                  <i className="fas fa-bolt text-orange-500"></i>
                                </div>
                                <div>
                                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Intensité (Secondaire)</p>
                                  <p className="text-xl font-black text-white">{advice.amperage} Ampères</p>
                                </div>
                              </div>
                           </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {advice.wireSpeed && (
                            <div className="bg-white/[0.03] p-5 rounded-2xl border border-white/5 flex items-center gap-4 group hover:bg-white/[0.06] transition-all">
                              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0 border border-green-500/20">
                                <i className="fas fa-gauge-high text-green-500"></i>
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Vitesse du Fil</p>
                                <p className="text-xl font-black text-white truncate">{advice.wireSpeed}</p>
                              </div>
                            </div>
                          )}

                          {advice.gasFlow && (
                            <div className="bg-white/[0.03] p-5 rounded-2xl border border-white/10 flex items-start gap-4 group hover:bg-white/[0.06] transition-all h-full">
                              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20 mt-1">
                                <i className="fas fa-wind text-blue-400"></i>
                              </div>
                              <div className="flex-1">
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Protection Gazeuse</p>
                                <p className="text-lg font-black text-white leading-tight break-words">
                                  {advice.gasFlow}
                                </p>
                                <p className="text-[9px] text-blue-400/60 font-bold mt-1 uppercase tracking-tighter">Débit recommandé</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Alternatives Section */}
                    {advice.alternatives && advice.alternatives.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-1 h-4 bg-purple-400 rounded-full"></div>
                          <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-[0.3em]">Procédés Alternatifs</h4>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          {advice.alternatives.map((alt, i) => (
                            <div key={i} className="bg-white/[0.04] p-5 rounded-2xl border border-white/10 relative overflow-hidden group hover:bg-white/[0.07] transition-all">
                              <div className="absolute -right-2 -bottom-2 opacity-[0.05] group-hover:opacity-10 transition-opacity">
                                <i className="fas fa-shuffle text-6xl"></i>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <p className="text-sm font-black text-purple-400 uppercase tracking-widest italic">{alt.processName}</p>
                                <div className="px-3 py-1 bg-purple-500/10 rounded-lg border border-purple-500/20">
                                  <p className="text-[10px] text-white font-bold">{alt.mainSettings}</p>
                                </div>
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed font-medium">{alt.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Consumables Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1 h-4 bg-blue-400 rounded-full"></div>
                        <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-[0.3em]">Consommables Recommandés</h4>
                      </div>
                      <div className="bg-gradient-to-br from-white/[0.06] to-white/[0.01] p-6 rounded-3xl border border-white/10 shadow-xl group relative overflow-hidden">
                         <div className="absolute -right-6 -bottom-6 opacity-[0.05] group-hover:opacity-15 transition-all pointer-events-none rotate-12 group-hover:rotate-0">
                            <i className="fas fa-boxes-stacked text-9xl"></i>
                         </div>
                        <p className="text-[11px] text-blue-400 font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                          <i className="fas fa-screwdriver-wrench text-xs"></i>
                          Configuration de l'Apport
                        </p>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
                          <div className="flex-1 min-w-0">
                            <p className="text-2xl font-black text-white uppercase italic leading-tight drop-shadow-lg">
                              {advice.fillerMetalType || advice.electrodeType || 'Standard'}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase tracking-widest">Référence / Norme suggérée</p>
                          </div>
                          <div className="bg-[#1e284b]/80 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10 shadow-2xl shrink-0 text-center sm:text-right">
                            <p className="text-[10px] text-blue-400/80 font-black uppercase tracking-widest mb-1">Diamètre</p>
                            <p className="text-3xl font-black text-white">Ø {advice.fillerMetalDiameter}<span className="text-sm text-slate-500 ml-1">mm</span></p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Pro Tips Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1 h-4 bg-yellow-400 rounded-full"></div>
                        <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-[0.3em]">Conseils Pratiques</h4>
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        {advice.tips.map((tip, i) => (
                          <div key={i} className="flex items-start gap-4 bg-white/[0.02] p-5 rounded-2xl border border-white/5 hover:bg-white/[0.05] hover:border-yellow-400/20 transition-all">
                            <div className="w-8 h-8 rounded-xl bg-yellow-400/10 flex items-center justify-center shrink-0 mt-0.5 border border-yellow-400/20">
                              <i className="fas fa-lightbulb text-yellow-500 text-sm"></i>
                            </div>
                            <p className="text-sm text-slate-300 leading-relaxed font-medium">{tip}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Safety Section */}
                    <div className="bg-red-950/20 border-2 border-red-500/30 p-8 rounded-[2rem] space-y-6 shadow-2xl shadow-red-500/10 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                        <i className="fas fa-triangle-exclamation text-8xl"></i>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-red-500/20 flex items-center justify-center border border-red-500/30">
                          <i className="fas fa-shield-halved text-red-500 text-xl"></i>
                        </div>
                        <div>
                          <h4 className="text-sm font-black uppercase text-red-500 tracking-[0.3em] leading-none">SÉCURITÉ CRITIQUE</h4>
                          <p className="text-[10px] text-red-400/60 uppercase font-bold mt-1 tracking-widest">Strictement Obligatoire</p>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="bg-red-500/10 p-5 rounded-2xl border border-red-500/20">
                          <p className="text-[12px] text-red-100 font-bold leading-tight flex items-start gap-3 italic">
                             <i className="fas fa-circle-exclamation mt-1 shrink-0 text-red-500"></i>
                             {disclaimerText}
                          </p>
                        </div>
                        <ul className="space-y-3 pl-2">
                          {advice.safetyPrecautions.map((p, i) => (
                            <li key={i} className="text-xs text-slate-300 leading-relaxed flex items-start gap-4">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span>
                              <span className="font-medium">{p}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions Section */}
                <div className="flex flex-col gap-4">
                  <button 
                    onClick={handleSaveScreenshot}
                    className="w-full py-5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-2xl font-black flex items-center justify-center gap-3 transition-all transform active:scale-95 uppercase tracking-tighter shadow-lg"
                  >
                    <i className="fas fa-file-export text-slate-400"></i>
                    Exporter les réglages (PNG)
                  </button>

                  <button 
                    onClick={reset}
                    className="w-full py-7 bg-gradient-to-r from-[#f95a2c] to-[#ff7e56] hover:brightness-110 text-white rounded-[2rem] font-black text-2xl shadow-2xl shadow-[#f95a2c]/30 transition-all transform active:scale-95 flex items-center justify-center gap-4 uppercase tracking-tighter italic"
                  >
                    <i className="fas fa-plus text-xl drop-shadow-md"></i>
                    Nouvelle Analyse
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="py-8 text-center border-t border-white/5 opacity-40">
        <p className="text-[9px] text-slate-500 uppercase font-black tracking-[0.5em]">
          WELDMASTER AI &bull; INTELLIGENT WELDING ASSISTANT &bull; 2025
        </p>
      </footer>
    </div>
  );
};

export default App;
