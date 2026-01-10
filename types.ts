
export enum AppStep {
  WELCOME,
  MACHINE_PHOTO,
  WORKPIECE_PHOTO,
  DETAILS_CONFIRMATION,
  RESULTS
}

export interface WeldingMachine {
  brand?: string;
  model?: string;
  type?: 'MIG' | 'TIG' | 'Stick' | 'Unknown';
  specsUrl?: string;
}

export interface Workpiece {
  material?: string;
  thickness?: string;
  jointType?: string;
  fillerMetalType?: string;
  fillerMetalDiameter?: string;
}

export interface AlternativeProcess {
  processName: string;
  description: string;
  mainSettings: string;
}

export interface WeldingAdvice {
  amperage: string;
  voltage: string;
  machineSetting?: string; // Pour les lettres A, B, C ou chiffres 1, 2, 3 sur les anciens postes
  wireSpeed?: string;
  gasFlow?: string;
  electrodeType?: string;
  fillerMetalType?: string;
  fillerMetalDiameter?: string;
  polarity?: string;
  safetyPrecautions: string[];
  tips: string[];
  alternatives?: AlternativeProcess[];
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  machine: WeldingMachine;
  workpiece: Workpiece;
  advice: WeldingAdvice;
}
