import OpenAI from 'openai';

// Primary high-capacity Local LLM (e.g. Qwen 122B via vLLM)
export const openai = new OpenAI({
  baseURL: 'http://192.168.1.151:8000/v1',
  apiKey: 'not-needed',
});

// Fast local LM (e.g. LM Studio / Ollama)
export const fastAi = new OpenAI({
  baseURL: 'http://127.0.0.1:1234/v1',
  apiKey: 'not-needed',
});

// Mock the GoogleGenAI interface to avoid breaking existing RAG logic
export const ai = {
  models: {
    embedContent: async (args: any) => {
      const input = Array.isArray(args.contents) ? args.contents : [args.contents];
      const res = await fastAi.embeddings.create({
        model: "text-embedding-nomic-embed-text-v1.5", // Route to LM Studio embedding model
        input: input
      });
      return {
        embeddings: res.data.map((d: any) => ({ values: d.embedding }))
      };
    },
    generateContent: async (args: any) => {
      let systemPrompt = "You are a helpful assistant.";
      if (args.config?.responseSchema) {
         systemPrompt = "Respond ONLY in valid JSON matching this schema:\n" + JSON.stringify(args.config.responseSchema);
      }
      
      const res = await openai.chat.completions.create({
        model: "hf/Sehyo-Qwen3.5-122B-A10B-NVFP4", // vLLM routes to active model
        messages: [
           { role: "system", content: systemPrompt },
           { role: "user", content: args.contents }
        ],
        temperature: args.config?.temperature ?? 0.7,
        response_format: args.config?.responseMimeType === "application/json" ? { type: "json_object" } : undefined
      });
      
      return {
        text: res.choices[0].message.content
      };
    },
    generateContentStream: async (args: any) => {
      const res = await openai.chat.completions.create({
        model: "hf/Sehyo-Qwen3.5-122B-A10B-NVFP4",
        messages: [
           { role: "user", content: args.contents }
        ],
        stream: true
      });
      
      return (async function* () {
         for await (const chunk of res) {
            yield { text: chunk.choices[0]?.delta?.content || "" };
         }
      })();
    }
  }
};
