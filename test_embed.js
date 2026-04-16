const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const response = await ai.models.embedContent({
    model: "gemini-embedding-2-preview",
    contents: "Hello world"
  });
  console.log("Dims:", response.embeddings[0].values.length);
}
run();
