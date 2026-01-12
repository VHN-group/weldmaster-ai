
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
        { text: "Analyse ces pièces à souder (matière, épaisseur). Retourne en JSON." }
      ]
    },
    config: {
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          material: { type: Type.STRING },
          thickness: { type: Type.STRING }
        },
        required: ["material", "thickness"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const getFinalAdvice = async (machine: WeldingMachine, workpiece: Workpiece, lang: Language) => {
  const langName = getLanguageName(lang);
  const prompt = `Act as a professional welding engineer. Provide all response text strictly in ${langName}.
  WELDER: ${machine.brand} ${machine.model} (Type: ${machine.type})
  WORKPIECE: ${workpiece.material}, Thickness: ${workpiece.thickness}
  ${workpiece.migWireDiameter ? `MIG WIRE DIAMETER SELECTED BY USER: ${workpiece.migWireDiameter}mm` : ''}
  
  Please provide optimal welding settings:
  - For Stick (MMA): Electrode type (e.g., Rutile E6013, Basic E7018) and diameter.
  - For MIG/MAG: Wire type (e.g., SG2 Steel, AlMg5) and diameter.
  - For TIG: Tungsten electrode type (e.g., WL20 Blue) and diameter.
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
          electrodeType: { type: Type.STRING, description: "Electrode or wire type name." },
          fillerMetalType: { type: Type.STRING, description: "Filler rod or consumable name." },
          fillerMetalDiameter: { type: Type.STRING, description: "Diameter in mm." },
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
