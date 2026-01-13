
import { GoogleGenAI, Type } from "@google/genai";
import { WeldingMachine, Workpiece, Language } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const getLanguageName = (lang: Language) => {
  switch(lang) {
    case 'en': return 'English';
    case 'es': return 'Spanish';
    case 'de': return 'German';
    default: return 'French';
  }
};

export const analyzeMachine = async (base64Image: string): Promise<WeldingMachine> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
        { text: "Identifie la marque et le modèle précis de ce poste à souder. Retourne les informations au format JSON." }
      ]
    },
    config: {
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          brand: { type: Type.STRING },
          model: { type: Type.STRING },
          type: { type: Type.STRING, enum: ['MIG', 'TIG', 'Stick', 'Unknown'] }
        },
        required: ["brand", "model", "type"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const analyzeWorkpiece = async (base64Image: string): Promise<Workpiece> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
        { text: "Analyse ces pièces à souder (matière, épaisseurs). Si les deux pièces ont des épaisseurs différentes, identifie-les. Retourne en JSON." }
      ]
    },
    config: {
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          material: { type: Type.STRING },
          thicknessA: { type: Type.STRING },
          thicknessB: { type: Type.STRING }
        },
        required: ["material", "thicknessA"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const getFinalAdvice = async (machine: WeldingMachine, workpiece: Workpiece, lang: Language) => {
  const langName = getLanguageName(lang);
  const thicknessStr = workpiece.thicknessB && workpiece.thicknessB !== workpiece.thicknessA 
    ? `Dissimilar thicknesses: ${workpiece.thicknessA}mm and ${workpiece.thicknessB}mm`
    : `Thickness: ${workpiece.thicknessA}mm`;

  const prompt = `Act as a professional welding engineer. Provide all response text strictly in ${langName}.
  WELDER: ${machine.brand} ${machine.model} (Type: ${machine.type})
  WORKPIECE: ${workpiece.material}, ${thicknessStr}
  ${workpiece.migWireDiameter ? `MIG WIRE DIAMETER SELECTED BY USER: ${workpiece.migWireDiameter}mm` : ''}
  
  Please provide optimal welding settings with extreme technical precision:
  - DO NOT MENTION 2T OR 4T TRIGGER MODES.
  - DO NOT MENTION BURNBACK SETTINGS.
  - If thicknesses are different, provide specific technique tips (e.g., arc direction, heat management for the thicker part).
  - For Stick (MMA): Electrode type and diameter.
  - For MIG/MAG: Wire type and diameter. REQUIREMENT: Specify Inductance setting.
  - For TIG: Specify BOTH Tungsten electrode type AND Filler metal rod type. Include diameters for both.
  - Voltage, Amperage, Wire Speed as applicable.
  - machineProcedure: Provide a very brief step-by-step physical instruction on HOW to set these values on THIS specific welder model.
  - Safety advice and 2 alternative welding processes.
  Strictly return JSON in ${langName}.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          amperage: { type: Type.STRING },
          voltage: { type: Type.STRING },
          machineSetting: { type: Type.STRING },
          machineProcedure: { type: Type.STRING, description: "Detailed physical steps to set the machine buttons/dials." },
          wireSpeed: { type: Type.STRING },
          gasFlow: { type: Type.STRING },
          inductance: { type: Type.STRING },
          electrodeType: { type: Type.STRING, description: "Tungsten type for TIG or Electrode for Stick" },
          fillerMetalType: { type: Type.STRING, description: "Filler rod for TIG or Wire for MIG" },
          fillerMetalDiameter: { type: Type.STRING },
          polarity: { type: Type.STRING },
          safetyPrecautions: { type: Type.ARRAY, items: { type: Type.STRING } },
          tips: { type: Type.ARRAY, items: { type: Type.STRING } },
          alternatives: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                processName: { type: Type.STRING },
                description: { type: Type.STRING },
                mainSettings: { type: Type.STRING }
              }
            }
          }
        },
        required: ["safetyPrecautions", "tips"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};
