import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Person, StructuredPlace } from "../types";

/**
 * Executes an AI task with exponential backoff retry logic to handle transient API errors.
 */
const withRetry = async <T>(fn: () => Promise<T>, retries = 3): Promise<T> => {
  let delay = 1000;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (i === retries - 1) throw error;
      // Graceful exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error("API call failed after retries");
};

export const generateBio = async (person: Person): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const birthLoc = typeof person.birthPlace === 'string' ? person.birthPlace : person.birthPlace?.fullText;
  const deathLoc = typeof person.deathPlace === 'string' ? person.deathPlace : person.deathPlace?.fullText;
  const residenceDeath = typeof person.residenceAtDeath === 'string' ? person.residenceAtDeath : person.residenceAtDeath?.fullText;

  const prompt = `
    Write a warm, professional, and slightly narrative biography for a family tree record.
    Name: ${person.firstName} ${person.lastName} ${person.maidenName ? `(née ${person.maidenName})` : ''}
    Born: ${person.birthDate} in ${birthLoc || 'Unknown'}
    Died: ${person.deathDate || 'Present'} ${deathLoc ? `in ${deathLoc}` : ''}
    ${person.deathCause ? `Cause of Death: ${person.deathCause}` : ''}
    ${person.deathCauseCategory ? `Death Category: ${person.deathCauseCategory}` : ''}
    ${residenceDeath ? `Residence at time of death: ${residenceDeath}` : ''}
    Occupations: ${person.occupations?.join(', ') || 'Unknown'}
    Current Snippet: ${person.bio || ''}
    
    Please provide a concise 3-paragraph story including historical context of the era they lived in.
  `;

  try {
    // Correctly typing the response from withRetry to GenerateContentResponse to fix 'unknown' error
    const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    }));
    return response.text || "Could not generate biography.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error generating AI biography. Please try again later.";
  }
};

export const parsePlaceString = async (input: string): Promise<Partial<StructuredPlace>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    Take this genealogical location string and parse it into structured components.
    Identify: 
    - Street (street)
    - House Number (houseNumber)
    - Floor (floor)
    - Apartment/Suite/Flat (apartment)
    - Neighborhood/Landmark (placeName)
    - Town/City/Parish (city)
    - Region/Region (county)
    - Province/State (state)
    - Country (country)
    - Historical Note/Context (notes)
    Input: "${input}"
  `;

  try {
    // Correctly typing the response from withRetry to GenerateContentResponse to fix 'unknown' error
    const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            street: { type: Type.STRING },
            houseNumber: { type: Type.STRING },
            floor: { type: Type.STRING },
            apartment: { type: Type.STRING },
            placeName: { type: Type.STRING },
            city: { type: Type.STRING },
            county: { type: Type.STRING },
            state: { type: Type.STRING },
            country: { type: Type.STRING },
            notes: { type: Type.STRING },
            fullText: { type: Type.STRING }
          }
        }
      }
    }));
    return JSON.parse(response.text?.trim() || "{}");
  } catch (error) {
    console.error("Gemini Parse Error:", error);
    return { fullText: input };
  }
};

export const analyzeHistoricalEra = async (year: string, location: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Tell me about life in ${location} around the year ${year}. Focus on family life, common occupations, and major events that would have affected a local family.`;

  try {
    // Correctly typing the response from withRetry to GenerateContentResponse to fix 'unknown' error
    const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    }));
    return response.text || "No historical context found.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Failed to fetch historical context.";
  }
};