
import { GoogleGenAI, Type } from "@google/genai";
import { WeldingMachine, Workpiece } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeMachine = async (base64Image: string): Promise<WeldingMachine> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
        { text: "Identifie la marque et le modèle précis de ce poste à souder. Recherche ensuite sur le web sa documentation technique officielle. Retourne les informations au format JSON." }
      ]
    },
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          brand: { type: Type.STRING },
          model: { type: Type.STRING },
          type: { type: Type.STRING, enum: ['MIG', 'TIG', 'Stick', 'Unknown'] },
          specsUrl: { type: Type.STRING, description: "URL de la documentation ou fiche technique trouvée" }
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
        { text: "Analyse ces pièces à souder. Identifie la matière (acier, inox, alu...) et l'épaisseur approximative. Si tu vois du métal d'apport (baguette TIG ou électrode) à côté, essaie de l'identifier aussi. Retourne les infos en JSON." }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          material: { type: Type.STRING },
          thickness: { type: Type.STRING },
          jointType: { type: Type.STRING },
          fillerMetalType: { type: Type.STRING },
          fillerMetalDiameter: { type: Type.STRING }
        },
        required: ["material", "thickness"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const getFinalAdvice = async (machine: WeldingMachine, workpiece: Workpiece) => {
  const prompt = `En tant qu'expert en soudure, donne les réglages optimaux pour :
  Poste : ${machine.brand} ${machine.model}
  PROCÉDÉ SÉLECTIONNÉ : ${machine.type} (STRICTEMENT RESPECTER CE PROCÉDÉ)
  Pièce : ${workpiece.material}, épaisseur ${workpiece.thickness}, type de joint ${workpiece.jointType || 'non spécifié'}.
  ${workpiece.fillerMetalType ? `Consommable déjà choisi : ${workpiece.fillerMetalType} (Diamètre: ${workpiece.fillerMetalDiameter})` : ''}
  
  IMPORTANT POUR MIG/MAG : 
  - Le réglage principal se fait en VOLTS (Tension).
  - SI LE POSTE EST ANCIEN (réglage par commutateur de type A/B/C ou 1/2/3) : Trouve le réglage physique correspondant à la tension demandée sur ce modèle spécifique (${machine.brand} ${machine.model}). Inclus-le dans "machineSetting".
  - Inclus obligatoirement la Tension (Volt) et la vitesse de fil.
  
  POUR TOUS LES PROCÉDÉS :
  - Inclus : Ampérage (sauf MIG où c'est secondaire), Tension, vitesse de fil (si MIG), débit de gaz (ex: '8-10 L/min Argon/CO2').
  
  IMPORTANT - CONSOMMABLES & POLARITÉ :
  - Pour le procédé ${machine.type}, donne les réglages UNIQUEMENT pour ce procédé.
  - Si Stick (ARC/MMA) : Indique le type exact d'électrode et la polarité.
  - Si TIG : Spécifie le type de métal d'apport, le diamètre et la polarité.
  
  SECTION ALTERNATIVE :
  - Suggère 1 ou 2 autres procédés adaptés à ce métal et cette épaisseur.

  Ajoute des conseils de sécurité CRITIQUES.`;

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
          machineSetting: { type: Type.STRING, description: "Réglage physique sur le poste (ex: Commutateur sur 'B' ou '3')" },
          wireSpeed: { type: Type.STRING },
          gasFlow: { type: Type.STRING, description: "Débit et type de gaz (ex: 12 L/min Ar/CO2)" },
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
              },
              required: ["processName", "description", "mainSettings"]
            }
          }
        },
        required: ["safetyPrecautions", "tips"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};
