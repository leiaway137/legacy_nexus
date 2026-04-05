import { GoogleGenAI } from "@google/genai";

process.env.GEMINI_API_KEY = "AIzaSyBlzXBZd0MFYmOss8nWKYRbugEEHPrnuSo";

const ai = new GoogleGenAI({});
(async () => {
try {
  console.log("Calling genAI...");
  const res = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: "Hello" });
  console.log("Success:", res.text);
} catch (err) {
  console.error("Error:", err);
}
})();
