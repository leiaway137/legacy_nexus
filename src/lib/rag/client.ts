import { GoogleGenAI } from "@google/genai";

// Initialize Gemini SDK instance
// It will automatically use the GEMINI_API_KEY from environment variables (.env.local)
export const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY 
});
