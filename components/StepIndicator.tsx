
import React from 'react';
import { AppStep, Language } from '../types';
import { translations } from '../translations';

interface StepIndicatorProps {
  currentStep: AppStep;
  lang: Language;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep, lang }) => {
  const t = translations[lang];
  const steps = [
    { id: AppStep.MACHINE_PHOTO, label: t.stepPoste },
    { id: AppStep.WORKPIECE_PHOTO, label: t.stepPieces },
    { id: AppStep.DETAILS_CONFIRMATION, label: t.stepValidation },
    { id: AppStep.RESULTS, label: t.stepReglages }
  ];

  return (
    <div className="flex items-center justify-between w-full max-w-md mx-auto mb-8 px-4">
      {steps.map((step, index) => {
        const isActive = currentStep === step.id;
        const isCompleted = currentStep > step.id;

        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                isActive ? 'bg-[#f95a2c] text-white ring-4 ring-[#f95a2c]/20' : 
                isCompleted ? 'bg-green-500 text-white' : 'bg-slate-700/50 text-slate-400'
              }`}>
                {isCompleted ? <i className="fas fa-check"></i> : index + 1}
              </div>
              <span className={`text-[10px] mt-1 uppercase tracking-wider font-semibold ${
                isActive ? 'text-[#f95a2c]' : 'text-slate-500'
              }`}>
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={`flex-1 h-[2px] mx-2 mb-4 transition-colors ${
                currentStep > step.id ? 'bg-green-500' : 'bg-slate-700/50'
              }`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
