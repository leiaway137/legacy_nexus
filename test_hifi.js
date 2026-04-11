import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from '@google/genai';
import { Type } from '@google/genai';

// Initialize directly using process env available since we run via node
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testHifi() {
  const prompt = `
    You are an elite archivist and biographer for Legacy Nexus.
    Your task is to analyze the provided raw transcripts and extract distinct, high-fidelity narrative stories.
    For each extracted story, output the following structured data:
    1. A short, compelling 'title'.
    2. The chronological 'era'. You MUST map the era strictly to one of the following exact strings: "Childhood", "Teens", "Twenties", "Thirties", "Forties", "Fifties+", or "Timeless" (Use "Timeless" for generic life advice, recipes, philosophical beliefs, or non-chronological skills).
    3. A concise 'synopsis' detailing the specific memory.
    4. Exactly 6 'psychometrics'. You MUST output an array containing exactly these 6 labels representing the RIASEC model: "Realistic", "Investigative", "Artistic", "Social", "Enterprising", and "Conventional". Evaluate each between 0 and 100 based on how intensely the theme applies to the story (0 if not applicable).
    5. A completeness 'rubric' containing 4 booleans tracking if the story explicitly contains:
       - 'context': Does it establish the setting and background?
       - 'conflict': Is there a clear challenge, pivot, or escalation?
       - 'resolution': Is the outcome explained?
       - 'extraction': Did the narrator explicitly state the moral, life lesson, or specific takeaway?
    6. If the story has high conflict but 'extraction' is false, generate a 'gapPrompt' (a string prompting the user empathically to explain the moral of the story). Otherwise, provide null.
    7. LINGUISTIC CORRECTIONS: The narrator's cultural heritage/language background is: Unknown. If the English transcript contains phonetically misspelled foreign words, use your linguistic knowledge to intelligently deduce the intended word. Add each correction to the 'linguisticCorrections' array.

    Raw Context:
    "I was 32 when I moved to Hong Kong for my first big coding job. It was terribly hard. I wanted to quit every day but my dad taught me 'Grit'. So I stayed."
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              era: { type: Type.STRING },
              title: { type: Type.STRING },
              synopsis: { type: Type.STRING },
              psychometrics: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    val: { type: Type.INTEGER }
                  },
                  required: ["label", "val"]
                }
              },
              rubric: {
                type: Type.OBJECT,
                properties: {
                  context: { type: Type.BOOLEAN },
                  conflict: { type: Type.BOOLEAN },
                  resolution: { type: Type.BOOLEAN },
                  extraction: { type: Type.BOOLEAN }
                },
                required: ["context", "conflict", "resolution", "extraction"]
              },
              gapPrompt: { type: Type.STRING, nullable: true },
              linguisticCorrections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    original: { type: Type.STRING },
                    guess: { type: Type.STRING },
                    meaning: { type: Type.STRING }
                  },
                  required: ["original", "guess", "meaning"]
                }
              }
            },
            required: ["id", "era", "title", "synopsis", "psychometrics", "rubric"]
          }
        }
      }
    });
    console.log("SUCCESS!", response.text);
  } catch (err) {
    console.error("FAIL!", err);
  }
}

testHifi();
