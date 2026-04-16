import { GoogleGenAI } from '@google/genai';

async function test() {
   const ai = new GoogleGenAI({ apiKey: "AIzaSyBlzXBZd0MFYmOss8nWKYRbugEEHPrnuSo" });
   try {
      const response = await ai.models.embedContent({
         model: "text-embedding-004",
         contents: ["Hello world"]
      });
      console.log(JSON.stringify(response, null, 2));
   } catch(e) {
      console.log("Error:", e);
   }
}

test();
