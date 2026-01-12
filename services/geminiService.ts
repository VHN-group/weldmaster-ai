
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

export const handleApiError = (error: any): string => {
  console.error("Gemini API Error:", error);
  const message = error?.message || "";
  if (message.includes("API key not valid")) return "Clé API invalide.";
  if (message.includes("quota") || message.includes("429")) return "Limite atteinte. Réessayez dans 1 min.";
  if (message.includes("network") || !navigator.onLine) return "Problème réseau.";
  return "Erreur de communication avec l'IA.";
};

export const analyzeMachine = async (base64Image: string): Promise<WeldingMachine> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
          { text: "Identifie la marque et le modèle précis de ce poste à souder. Retourne les informations au format JSON." }
        ]
      },
      config: {
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
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

export const analyzeWorkpiece = async (base64Image: string): Promise<Workpiece> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
          { text: "Analyse ces pièces à souder (matière, épaisseur). Retourne en JSON." }
        ]
      },
      config: {
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
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};

export const getFinalAdvice = async (machine: WeldingMachine, workpiece: Workpiece, lang: Language) => {
  try {
    const langName = getLanguageName(lang);
    const prompt = `Act as a welding expert. Provide settings in ${langName}.
    Welder: ${machine.brand} ${machine.model} (${machine.type})
    Material: ${workpiece.material}, Thickness: ${workpiece.thickness}.
    ${workpiece.migWireDiameter ? `MIG Wire Diameter: ${workpiece.migWireDiameter}mm` : ''}
    ${workpiece.fillerMetalType ? `Consumable: ${workpiece.fillerMetalType} (${workpiece.fillerMetalDiameter}mm)` : ''}
    
    Requirements:
    - If MIG/MAG: Provide Voltage, Wire Speed, and Machine Switch setting (A/B/1/2) if the welder is old.
    - If Stick: Electrode type and polarity.
    - Provide 2 alternatives.
    - Safety precautions and tips in ${langName}.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            amperage: { type: Type.STRING },
            voltage: { type: Type.STRING },
            machineSetting: { type: Type.STRING },
            wireSpeed: { type: Type.STRING },
            gasFlow: { type: Type.STRING },
            electrodeType: { type: Type.STRING },
            fillerMetalType: { type: Type.STRING },
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
          }
        }
      }
    });
    return JSON.parse(response.text || '{}');
  } catch (error) {
    throw new Error(handleApiError(error));
  }
};
