
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
  machineImage?: string; 
}

export interface Workpiece {
  material?: string;
  thicknessA?: string;
  thicknessB?: string;
  weldingPosition?: string;
  jointType?: string;
  fillerMetalType?: string;
  fillerMetalDiameter?: string;
  migWireDiameter?: string;
  isAnalog?: boolean;
}

export interface AlternativeProcess {
  processName: string;
  description: string;
  mainSettings: string;
}

export interface SafetyPoint {
  category: 'EPI' | 'GAS' | 'FIRE' | 'BURN' | 'AI';
  title: string;
  content: string;
}

// Added wireType, wireDiameter, and electrodeDiameter to resolve property access errors
export interface WeldingAdvice {
  amperage: string;
  voltage: string;
  machineSetting?: string;
  machineProcedure?: string;
  wireSpeed?: string;
  travelSpeed?: string;
  gasType?: string;
  gasFlow?: string;
  electrodeType?: string;
  electrodeDiameter?: string;
  wireType?: string;
  wireDiameter?: string;
  fillerMetalType?: string;
  fillerMetalDiameter?: string;
  polarity?: string;
  inductance?: string;
  preGas?: string;
  postGas?: string;
  startCurrent?: string;
  endCurrent?: string;
  pulseFrequency?: string;
  pulseBalance?: string;
  transferMode?: string;
  visualInspectionTips?: string;
  detailedSafetyPoints: SafetyPoint[];
  safetyPrecautions: string;
  tips: string[];
  alternatives?: AlternativeProcess[];
}

export interface SavedMachine {
  id: string;
  date: number;
  image: string;
  machineData: WeldingMachine;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  image?: string; 
  machine: WeldingMachine;
  workpiece: Workpiece;
  advice: WeldingAdvice;
}
