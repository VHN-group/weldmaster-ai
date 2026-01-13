
export enum AppStep {
  WELCOME,
  MACHINE_PHOTO,
  WORKPIECE_PHOTO,
  DETAILS_CONFIRMATION,
  RESULTS
}

export type Language = 'fr' | 'en' | 'es' | 'de';

export interface WeldingMachine {
  brand?: string;
  model?: string;
  type?: 'MIG' | 'TIG' | 'Stick' | 'Unknown';
  specsUrl?: string;
}

export interface Workpiece {
  material?: string;
  thicknessA?: string;
  thicknessB?: string;
  jointType?: string;
  fillerMetalType?: string;
  fillerMetalDiameter?: string;
  migWireDiameter?: string;
}

export interface AlternativeProcess {
  processName: string;
  description: string;
  mainSettings: string;
}

export interface WeldingAdvice {
  amperage: string;
  voltage: string;
  machineSetting?: string;
  machineProcedure?: string;
  wireSpeed?: string;
  gasFlow?: string;
  electrodeType?: string;
  fillerMetalType?: string;
  fillerMetalDiameter?: string;
  polarity?: string;
  inductance?: string;
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
