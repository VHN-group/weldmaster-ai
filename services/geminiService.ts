
import { GoogleGenAI, Type } from "@google/genai";
import { WeldingMachine, Workpiece, Language, WeldingAdvice } from "../types";

const getLanguageName = (lang: Language) => {
  switch(lang) {
    case 'en': return 'English';
    case 'es': return 'Spanish';
    case 'de': return 'German';
    default: return 'French';
  }
};

/**
 * Nettoie la réponse texte de l'IA pour extraire uniquement le bloc JSON.
 */
const cleanJsonResponse = (text: string | undefined): string => {
  if (!text) return '{}';
  let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned.startsWith('{') ? cleaned : '{}';
};

/**
 * Analyse du poste et de la pièce via vision avec Gemini 3 Pro (Haute Qualité).
 * L'IA est instruite pour identifier le modèle exact ou déduire la gamme technique.
 */
export const identifyEverything = async (
  machineBase64: string, 
  workpieceBase64: string
): Promise<{ machine: WeldingMachine, workpiece: Workpiece }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          { inlineData: { data: machineBase64, mimeType: 'image/jpeg' } },
          { text: "IMAGE 1: Welding machine. Identify the EXACT brand and model. If labels are blurry, use visual cues (button layout, screen type, chassis color) to deduce the specific series or technical range. Identify the process (MIG, TIG, Stick)." },
          { inlineData: { data: workpieceBase64, mimeType: 'image/jpeg' } },
          { text: "IMAGE 2: Metal parts. Identify material type, thickness, and joint configuration." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            machine: {
              type: Type.OBJECT,
              properties: {
                brand: { type: Type.STRING },
                model: { type: Type.STRING },
                type: { type: Type.STRING, enum: ["MIG", "TIG", "Stick", "Unknown"] }
              },
              required: ["brand", "type"]
            },
            workpiece: {
              type: Type.OBJECT,
              properties: {
                material: { type: Type.STRING },
                thicknessA: { type: Type.STRING }
              },
              required: ["material", "thicknessA"]
            }
          },
          required: ["machine", "workpiece"]
        },
        thinkingConfig: { thinkingBudget: 2048 }
      }
    });

    const data = JSON.parse(cleanJsonResponse(response.text));
    return {
      machine: data.machine || { brand: 'Inconnu', model: '', type: 'MIG' },
      workpiece: data.workpiece || { material: 'Acier', thicknessA: '2' }
    };
  } catch (e) {
    console.error("Gemini Pro Vision Failure:", e);
    return {
      machine: { brand: 'Inconnu', model: '', type: 'MIG' },
      workpiece: { material: 'Acier', thicknessA: '2' }
    };
  }
};

/**
 * Génère les conseils de soudage finaux avec Gemini 3 Flash.
 * L'IA simule la consultation d'une fiche technique et adapte les réglages au matériel spécifique.
 */
export const getFinalAdvice = async (machine: WeldingMachine, workpiece: Workpiece, lang: Language, isPremium: boolean, isFromHistory: boolean = false): Promise<WeldingAdvice> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const langName = getLanguageName(lang);
  
  const systemInstruction = `Act as a World-Class Industrial Welding Expert with deep knowledge of equipment datasheets.
  
  STRICT EXPERT RULES:
  1. IDENTIFICATION & DATASHEET: Simulate consulting the technical datasheet for ${machine.brand} ${machine.model}. Use the specific power curves and Duty Cycle of this model.
  2. PERFORMANCE CHECK: Verify if thickness ${workpiece.thicknessA}mm is compatible with this welder's maximum output. If it exceeds capacity or requires extreme duty cycle, add a critical warning in the tips.
  3. ANALOG MACHINES (SWITCHES): ${workpiece.isAnalog ? "IMPORTANT: This machine has mechanical switches. DO NOT provide abstract voltage/amperage numbers alone. YOU MUST identify the switch labels from the image (e.g., A-B range, 1-10 fine) and provide instructions like 'Switch 1: B, Switch 2: 4'. If you must give a value, use format: 'Pos B-4 (~18.5V)'." : ""}
  4. LINCOLN POWERTEC SERIES: Use the specific Range (Sélecteur de gamme) + Fine selector logic if identified.
  5. SYNERGIC MACHINES: If digital, specify the exact synergic program (e.g., Fe Ar+CO2 0.8mm) to select in the menu.
  6. MIG/MAG: Exact wire type (e.g. SG2 / ER70S-6). Use the selected wire diameter: ${workpiece.migWireDiameter || 'suggested'}mm.
  7. TIG: Specific Tungsten alloy (color code), diameter, and exact filler rod specification.
  8. MMA: Electrode type (Rutile, Basic, Cellulosic) and precise amperage/polarity.
  9. GAS: Precise mixture (e.g., Ar 82% + CO2 18%) and exact Flow Rate in L/min.
  10. SAFETY: Highlight specific risks (AI technical limitations, UV, high voltage, specialized fumes for stainless).

  Output language: ${langName}. The result must be an IMMEDIATE ACTIONABLE INSTRUCTION for the welder on THEIR machine. Return ONLY JSON.`;

  const prompt = `CONTEXT:
  - Welder: ${machine.brand} ${machine.model} (${machine.type})
  - Material: ${workpiece.material}
  - Thickness: ${workpiece.thicknessA}mm ${workpiece.thicknessB ? `to ${workpiece.thicknessB}mm` : ''}
  - Position: ${workpiece.weldingPosition || 'PA / 1G'}
  - Wire Diameter Input: ${workpiece.migWireDiameter || '0.8'}mm
  - Machine Control Type: ${workpiece.isAnalog ? 'ANALOG (SWITCHES)' : 'DIGITAL/SYNERGIC'}

  Generate professional welding settings based on the datasheet of this specific machine.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            amperage: { type: Type.STRING },
            voltage: { type: Type.STRING },
            wireSpeed: { type: Type.STRING },
            gasType: { type: Type.STRING },
            gasFlow: { type: Type.STRING },
            wireType: { type: Type.STRING },
            wireDiameter: { type: Type.STRING },
            electrodeType: { type: Type.STRING },
            electrodeDiameter: { type: Type.STRING },
            fillerMetalType: { type: Type.STRING },
            fillerMetalDiameter: { type: Type.STRING },
            polarity: { type: Type.STRING },
            preGas: { type: Type.STRING },
            postGas: { type: Type.STRING },
            transferMode: { type: Type.STRING },
            detailedSafetyPoints: { 
              type: Type.ARRAY, 
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  title: { type: Type.STRING },
                  content: { type: Type.STRING }
                },
                required: ["category", "title", "content"]
              }
            },
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
          required: ["amperage", "voltage", "detailedSafetyPoints", "tips"]
        }
      }
    });

    const data = JSON.parse(cleanJsonResponse(response.text));
    
    return {
      amperage: String(data.amperage || 'N/A'),
      voltage: String(data.voltage || 'N/A'),
      wireSpeed: data.wireSpeed || '',
      gasType: data.gasType || '',
      gasFlow: data.gasFlow || '',
      wireType: data.wireType || '',
      wireDiameter: data.wireDiameter || workpiece.migWireDiameter || '',
      electrodeType: data.electrodeType || '',
      electrodeDiameter: data.electrodeDiameter || '',
      fillerMetalType: data.fillerMetalType || '',
      fillerMetalDiameter: data.fillerMetalDiameter || '',
      polarity: String(data.polarity || 'DC+'),
      preGas: data.preGas || '',
      postGas: data.postGas || '',
      transferMode: data.transferMode || '',
      safetyPrecautions: "",
      tips: Array.isArray(data.tips) ? data.tips.map(String) : [],
      detailedSafetyPoints: Array.isArray(data.detailedSafetyPoints) ? data.detailedSafetyPoints : [],
      alternatives: isPremium && Array.isArray(data.alternatives) ? data.alternatives : []
    };
  } catch (err) {
    console.error("Gemini Flash Advice Error:", err);
    throw err;
  }
};
