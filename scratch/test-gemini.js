const { GoogleGenAI, Type } = require("@google/genai");
require("dotenv").config({ path: ".env.local" });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
  const prompt = `
    You are an expert ghostwriter creating a deeply personal, first-person "Recollection".
    Write a single sentence.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.8,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          description: "The sequential monologue lines of the recollection.",
          items: {
            type: Type.OBJECT,
            properties: {
              speaker: {
                type: Type.STRING,
                description: "Must be exactly 'Narrator'",
                enum: ["Narrator"]
              },
              text: {
                type: Type.STRING,
                description: "The spoken monologue line for the narrator. Plain text."
              }
            },
            required: ["speaker", "text"]
          }
        }
      }
    });

    console.log("SUCCESS:", response.text);
  } catch (error) {
    console.error("FAILED:", error.message || error);
  }
}

test();
