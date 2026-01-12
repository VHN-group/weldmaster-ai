
import React, { useState, useEffect, useRef } from 'react';
import { AppStep, WeldingMachine, Workpiece, WeldingAdvice, HistoryItem, Language } from './types';
import { analyzeMachine, analyzeWorkpiece, getFinalAdvice } from './services/geminiService';
import { StepIndicator } from './components/StepIndicator';
import { PhotoCapture } from './components/PhotoCapture';
import { translations } from './translations';
import html2canvas from 'html2canvas';

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('fr');
  const [step, setStep] = useState<AppStep>(AppStep.WELCOME);
  const [machine, setMachine] = useState<WeldingMachine | null>(null);
  const [workpiece, setWorkpiece] = useState<Workpiece | null>(null);
  const [advice, setAdvice] = useState<WeldingAdvice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMachineErrorModal, setShowMachineErrorModal] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const t = translations[lang];

  const lastMachineImage = useRef<string | null>(null);
  const lastWorkpieceImage = useRef<string | null>(null);

  const isTigOrStick = machine?.type === 'TIG' || machine?.type === 'Stick';
  const isMig = machine?.type === 'MIG';

  useEffect(() => {
    const saved = localStorage.getItem('weldmaster_history');
    const savedLang = localStorage.getItem('weldmaster_lang') as Language;
    if (saved) {
      try { setHistory(JSON.parse(saved)); } catch (e) {}
    }
    if (savedLang) setLang(savedLang);
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
    lastMachineImage.current = base64;
    setIsAnalyzing(true);
    setError(null);
    try {
      const data = await analyzeMachine(base64);
      if (!data.brand || data.brand.toLowerCase() === 'inconnu' || data.type === 'Unknown') {
        setShowMachineErrorModal(true);
        setMachine({ brand: t.unidentifiedPoste, model: '', type: 'Unknown' });
      } else {
        setMachine(data);
        setStep(AppStep.WORKPIECE_PHOTO);
      }
    } catch (err: any) {
      setShowMachineErrorModal(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleWorkpiecePhoto = async (base64: string) => {
    lastWorkpieceImage.current = base64;
    setIsAnalyzing(true);
    setError(null);
    try {
      const data = await analyzeWorkpiece(base64);
      setWorkpiece({
        ...data,
        fillerMetalType: '',
        fillerMetalDiameter: '',
        migWireDiameter: '0.8'
      });
      setStep(AppStep.DETAILS_CONFIRMATION);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const finalizeAdvice = async () => {
    if (!machine || !workpiece) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getFinalAdvice(machine, workpiece, lang);
      setAdvice(data);
      setStep(AppStep.RESULTS);
      saveToHistory(machine, workpiece, data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const retryLastAction = () => {
    setError(null);
    setShowMachineErrorModal(false);
    if (step === AppStep.MACHINE_PHOTO && lastMachineImage.current) {
      handleMachinePhoto(lastMachineImage.current);
    } else if (step === AppStep.WORKPIECE_PHOTO && lastWorkpieceImage.current) {
      handleWorkpiecePhoto(lastWorkpieceImage.current);
    } else if (step === AppStep.DETAILS_CONFIRMATION) {
      finalizeAdvice();
    }
  };

  const continueAnyway = () => {
    setShowMachineErrorModal(false);
    setError(null);
    if (!machine) {
        setMachine({ brand: 'Manual Welder', model: '', type: 'Unknown' });
    }
    setStep(AppStep.WORKPIECE_PHOTO);
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
    setShowMachineErrorModal(false);
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
      default: return type || 'Unknown';
    }
  };

  return (
    <div className="max-w-2xl mx-auto min-h-screen flex flex-col p-4 bg-[#1e284b] relative overflow-x-hidden">
      {showMachineErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#2d3a6d] border border-white/10 rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl space-y-8 text-center animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-orange-500/10 rounded-[2rem] flex items-center justify-center mx-auto border border-orange-500/20 shadow-inner">
              <i className="fas fa-magnifying-glass-minus text-3xl text-orange-500"></i>
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-black uppercase italic tracking-tighter">{t.unidentifiedPoste}</h3>
              <p className="text-slate-300 text-sm font-medium leading-relaxed">{t.unidentifiedDesc}</p>
            </div>
            <div className="space-y-3">
              <button onClick={() => { setShowMachineErrorModal(false); setError(null); }} className="w-full py-4 bg-[#f95a2c] text-white rounded-2xl font-black text-sm uppercase tracking-tighter italic shadow-lg transition-all active:scale-95">{t.retakePhoto}</button>
              <button onClick={continueAnyway} className="w-full py-4 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-2xl font-black text-sm uppercase tracking-tighter italic transition-all active:scale-95">{t.manualCont}</button>
            </div>
          </div>
        </div>
      )}

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
            {step !== AppStep.WELCOME && <StepIndicator currentStep={step} />}
            
            {error && !showMachineErrorModal && (
              <div className="w-full bg-red-900/40 border-2 border-red-500/50 p-6 rounded-3xl mb-8 text-red-100 flex flex-col gap-4 animate-in slide-in-from-top-4 duration-300">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-red-500/20 flex items-center justify-center shrink-0 border border-red-500/30">
                    <i className="fas fa-triangle-exclamation text-red-500 text-xl"></i>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-black uppercase text-red-500 tracking-widest mb-1">{t.errorTitle}</h4>
                    <p className="text-sm font-medium leading-relaxed opacity-90">{error}</p>
                  </div>
                </div>
                <div className="flex gap-2 ml-14">
                  <button onClick={retryLastAction} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95">{t.retry}</button>
                  <button onClick={() => setError(null)} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all">{t.ignore}</button>
                </div>
              </div>
            )}

            {step === AppStep.WELCOME && !showHistory && (
              <div className="text-center space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-sm w-full">
                {/* Language Switcher */}
                <div className="flex justify-center gap-2 p-1 bg-white/5 rounded-2xl w-fit mx-auto border border-white/10">
                  {(['fr', 'en', 'es', 'de'] as Language[]).map(l => (
                    <button
                      key={l}
                      onClick={() => changeLang(l)}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${
                        lang === l ? 'bg-[#f95a2c] text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>

                <div className="space-y-4">
                  <h2 className="text-4xl font-black leading-none uppercase italic tracking-tighter">
                    {t.welcomeTitle.split('POSTE')[0]} <br/>
                    <span className="text-[#f95a2c]">{t.welcomeTitle.includes('POSTE') ? 'VOTRE POSTE' : ''} {t.welcomeTitle.split('POSTE')[1]}</span>
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
                  <button onClick={startAnalysis} className="w-full py-6 bg-[#f95a2c] hover:bg-[#d84a22] text-white rounded-3xl font-black text-xl shadow-2xl transition-all transform active:scale-95 flex items-center justify-center gap-4 uppercase tracking-tighter italic">
                    <i className="fas fa-camera text-2xl"></i>
                    {t.startBtn}
                  </button>
                  {history.length > 0 && (
                    <button onClick={() => setShowHistory(true)} className="w-full py-4 bg-white/5 hover:bg-white/10 text-slate-300 rounded-2xl font-bold text-sm border border-white/10 transition-all flex items-center justify-center gap-3">
                      <i className="fas fa-history text-[#f95a2c]"></i>
                      {t.historyBtn} ({history.length})
                    </button>
                  )}
                </div>

                <div className="bg-orange-500/5 border border-orange-500/10 p-5 rounded-2xl text-left shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="fas fa-shield-halved text-[#f95a2c] text-xs"></i>
                    <p className="text-[10px] text-[#f95a2c] uppercase font-black tracking-widest">{t.warning}</p>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed italic">{t.disclaimer}</p>
                </div>
              </div>
            )}

            {showHistory && (
              <div className="w-full max-w-md animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-black uppercase italic text-white flex items-center gap-3"><i className="fas fa-history text-[#f95a2c]"></i>Historique</h3>
                  <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white uppercase text-[10px] font-bold tracking-widest">Retour</button>
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
                      </div>
                      <button onClick={(e) => deleteHistoryItem(item.id, e)} className="w-8 h-8 rounded-full bg-red-500/10 text-red-500/50 opacity-0 group-hover:opacity-100 transition-all"><i className="fas fa-trash-can text-xs"></i></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === AppStep.MACHINE_PHOTO && (
              <PhotoCapture icon="fa-plug" title={t.stepPoste} description="Scan welder info" onCapture={handleMachinePhoto} isAnalyzing={isAnalyzing} />
            )}
            {step === AppStep.WORKPIECE_PHOTO && (
              <PhotoCapture icon="fa-cubes" title={t.stepPieces} description="Scan your parts" onCapture={handleWorkpiecePhoto} isAnalyzing={isAnalyzing} />
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
                      <input className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={`${machine.brand || ''} ${machine.model || ''}`} readOnly />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">{t.procede}</label>
                      <select className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={machine.type} onChange={(e) => setMachine({...machine, type: e.target.value as any})}>
                        <option value="MIG">MIG / MAG</option>
                        <option value="TIG">TIG</option>
                        <option value="Stick">Stick (ARC / MMA)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">{t.matiere}</label>
                      <input className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={workpiece.material || ''} onChange={(e) => setWorkpiece({...workpiece, material: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">{t.epaisseur}</label>
                      <input className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={workpiece.thickness || ''} onChange={(e) => setWorkpiece({...workpiece, thickness: e.target.value})} />
                    </div>

                    {isMig && (
                      <div className="col-span-2 p-4 bg-orange-500/5 rounded-xl border border-orange-500/10 space-y-2">
                        <label className="text-[10px] uppercase text-[#f95a2c] font-black tracking-widest">{t.migWireDiam}</label>
                        <select 
                          className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#f95a2c] outline-none"
                          value={workpiece.migWireDiameter}
                          onChange={(e) => setWorkpiece({...workpiece, migWireDiameter: e.target.value})}
                        >
                          <option value="0.6">0.6 mm</option>
                          <option value="0.8">0.8 mm</option>
                          <option value="0.9">0.9 mm</option>
                          <option value="1.0">1.0 mm</option>
                          <option value="1.2">1.2 mm</option>
                        </select>
                      </div>
                    )}

                    {isTigOrStick && (
                      <div className="col-span-2 p-4 bg-blue-500/5 rounded-xl border border-blue-500/10 grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">Type</label>
                          <input className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={workpiece.fillerMetalType || ''} onChange={(e) => setWorkpiece({...workpiece, fillerMetalType: e.target.value})} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">Ø mm</label>
                          <input className="w-full bg-[#1e284b] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" value={workpiece.fillerMetalDiameter || ''} onChange={(e) => setWorkpiece({...workpiece, fillerMetalDiameter: e.target.value})} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <button onClick={finalizeAdvice} className="w-full py-5 bg-[#f95a2c] hover:bg-[#d84a22] text-white rounded-2xl font-black text-xl shadow-2xl transition-all transform active:scale-95 uppercase italic tracking-tighter">
                  {t.calculer}
                </button>
              </div>
            )}

            {step === AppStep.RESULTS && advice && (
              <div className="w-full space-y-6 pb-12 animate-in fade-in zoom-in-95 duration-500">
                <div ref={resultsRef} className="bg-[#1e284b] rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                  <div className="bg-gradient-to-r from-[#f95a2c] to-[#ff7e56] p-6">
                    <h3 className="text-2xl font-black uppercase italic leading-none tracking-tighter">{t.paramExperts}</h3>
                    <div className="mt-2 flex gap-2">
                      <span className="px-2 py-1 bg-black/20 rounded-lg text-[9px] font-black uppercase">{getProcessName(machine?.type)}</span>
                      <span className="px-2 py-1 bg-black/20 rounded-lg text-[9px] font-black uppercase">{workpiece?.thickness}mm</span>
                    </div>
                  </div>
                  
                  <div className="p-6 space-y-8">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                        <p className="text-[10px] text-[#f95a2c] font-black uppercase tracking-widest mb-2">{isMig ? t.tension : t.intensite}</p>
                        <p className="text-4xl font-black">{isMig ? advice.voltage : advice.amperage}<span className="text-xl text-slate-500 ml-1">{isMig ? 'V' : 'A'}</span></p>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                        <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-2">{t.polarite}</p>
                        <p className="text-2xl font-black">{advice.polarity || 'DC+'}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {advice.wireSpeed && (
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                          <p className="text-[10px] text-slate-500 font-black uppercase mb-1">{t.vitesseFil}</p>
                          <p className="text-xl font-black">{advice.wireSpeed}</p>
                        </div>
                      )}
                      {advice.gasFlow && (
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                          <p className="text-[10px] text-slate-500 font-black uppercase mb-1">{t.protectionGaz}</p>
                          <p className="text-sm font-bold text-white leading-tight">{advice.gasFlow}</p>
                        </div>
                      )}
                    </div>

                    <div className="bg-red-950/20 border border-red-500/30 p-6 rounded-3xl space-y-4">
                      <h4 className="text-xs font-black uppercase text-red-500 tracking-widest">{t.securite}</h4>
                      <ul className="space-y-2">
                        {advice.safetyPrecautions.map((p, i) => (
                          <li key={i} className="text-[11px] text-slate-300 flex items-start gap-2">
                            <span className="w-1 h-1 rounded-full bg-red-500 mt-1.5 shrink-0"></span>{p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <button onClick={reset} className="w-full py-6 bg-gradient-to-r from-[#f95a2c] to-[#ff7e56] text-white rounded-[2rem] font-black text-2xl shadow-2xl transition-all transform active:scale-95 flex items-center justify-center gap-4 uppercase italic tracking-tighter">
                    <i className="fas fa-plus text-xl"></i>{t.nouvelleAnalyse}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="py-8 text-center border-t border-white/5 opacity-40">
        <p className="text-[9px] text-slate-500 uppercase font-black tracking-[0.5em]">WELDMASTER AI &bull; 2025</p>
      </footer>
    </div>
  );
};

export default App;
