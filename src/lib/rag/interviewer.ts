import { ai } from "./client";

export async function conductActiveInterview(
  history: { role: string; text: string }[],
  imageBase64?: string,
  persona?: string
): Promise<string> {
  const formattedHistory = history.map(m => `${m.role === 'user' ? 'LegacyKeeper' : 'AI Interviewer'}: ${m.text}`).join("\n");

  let personaInstruction = "Prioritize building trust. Use soft language, heavy empathy, and prioritize allowing the user to vent or explore without aggressive steering.";
  if (persona === "Analytical & Probing") {
    personaInstruction = "Focus on getting the facts. Use concrete questions to clarify timelines and relationships. Challenge inconsistencies gently to get the true story.";
  } else if (persona === "Playful & Creative") {
    personaInstruction = "Use quirky, imaginative phrasing. Ask 'what if' questions to invoke strong sensory memories (e.g. 'If your childhood home was a color, what would it be?').";
  }
  
  const prompt = `
    You are the "AI Interviewer" for Narrative Nexus, a platform engineered to solve the "fragmentation of memory" by transforming unorganized assets into a synthesized narrative.
    You are currently interviewing a "LegacyKeeper" to extract generational wisdom.
    
    PERSONA / DIAL SETTING INSTRUCTION:
    ${personaInstruction}
    
    CRITICAL NARRATIVE NEXUS ARCHITECTURE INSTRUCTIONS:
    1. Active Conversational Capture: Use "echo details"—repeating subject phrases back to them to encourage elaboration. NEVER ask leading questions. Ensure an authentic voice.
    2. Narrative Structure: Guide the conversation naturally through the "Three-Act Standard". You don't need to explicitly state the acts, but naturally probe for:
       - The Setup (Context)
       - The Road of Trials/Conflict (The struggle or challenge)
       - The Resolution (The growth or outcome)
    3. Psychometric Categorization (RIASEC & MBTI): Actively listen for themes matching Realistic, Investigative, Artistic, Social, Enterprising, and Conventional traits. If you detect a gap or hallucination risk, ask targeted follow-up questions to secure a conclusive profile.
    4. Redemption Sequences: Specifically listen for and encourage "Redemption Sequences"—moments where they describe a negative event leading to a positive outcome (growth or learning).
    
    RESPONSE FORMAT:
    - Keep your responses short, conversational, and spoken-word friendly (1-3 sentences maximum). This will be spoken via Text-to-Speech.
    - Ask ONLY ONE follow up question at a time.
    - Be deeply empathetic and genuinely curious.
    
    Chat History:
    ${formattedHistory}
    
    Respond as the AI Interviewer with your next conversational turn. Do not prefix your response with "AI Interviewer:". Just output the raw text.
  `;

  try {
    const contents: any[] = [{ text: prompt }];

    // Inject multimodal image if provided (the inciteful incident cue)
    if (imageBase64) {
      let mimeType = "image/jpeg";
      if (imageBase64.startsWith("data:image/png")) mimeType = "image/png";
      else if (imageBase64.startsWith("data:image/webp")) mimeType = "image/webp";
      
      const base64Data = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
      
      contents.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents
    });
    return response.text || "I'm sorry, I couldn't process that.";
  } catch (error) {
    console.error("AI Interviewer failed:", error);
    return "I encountered an error trying to process your response. Could you say that again?";
  }
}
