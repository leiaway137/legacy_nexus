import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testEmbed() {
  try {
    const response = await ai.models.embedContent({
      model: "gemini-embedding-001",
      contents: "Hello world"
    });
    console.log("SUCCESS length:", response.embeddings?.[0]?.values?.length);
  } catch (err) {
    console.error("FAIL!", err);
  }
}

testEmbed();
