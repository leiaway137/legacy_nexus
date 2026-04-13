import { ai } from "./client";
import { Type } from "@google/genai";

export async function conductActiveInterview(
  history: { role: string; text: string }[],
  imageBase64?: string,
  persona?: string,
  pendingQuestions?: string[],
  currentTrustScore: number = 0
): Promise<{ response: string; trustScoreDelta: number; sentiment: string; vulnerability: string; wisdomDensity: string }> {
  const formattedHistory = history.map(m => `${m.role === 'user' ? 'LegacyKeeper' : 'AI Interviewer'}: ${m.text}`).join("\n");

  let personaInstruction = "Prioritize building trust. Use soft language, heavy empathy, and prioritize allowing the user to vent or explore without aggressive steering.";
  if (persona === "Analytical & Probing") {
    personaInstruction = "Focus on getting the facts. Use concrete questions to clarify timelines and relationships. Challenge inconsistencies gently to get the true story.";
  } else if (persona === "Playful & Creative") {
    personaInstruction = "Use quirky, imaginative phrasing. Ask 'what if' questions to invoke strong sensory memories (e.g. 'If your childhood home was a color, what would it be?').";
  }
  
  const prompt = `
    You are the "AI Interviewer" for Legacy Nexus, a platform that acts as a curious biographer.
    You are currently interviewing a "LegacyKeeper" to extract generational wisdom.
    
    PERSONA / DIAL SETTING INSTRUCTION:
    ${personaInstruction}
    
    CRITICAL INSTRUCTION: PROGRESSIVE DISCLOSURE & TRUST SCORING
    You are operating on a tiered disclosure ladder based on the user's "Trust Score".
    The user's current Trust Score is: ${currentTrustScore}.
    
    1. Base Rules:
       - If Trust Score < 20 (Stage I: Rapport): Ask ONLY low-stakes sensory or material questions (e.g., "What was your favorite childhood toy?"). Do not ask deep analytical questions.
       - If Trust Score between 20-50 (Stage II: Profiling): Move to behavioral "What if?" questions to build their RIASEC Story Score. Focus on their actions and choices.
       - If Trust Score > 50 (Stage III & IV: Connecting & Synthesis): Move to "Gap Analysis". Ask about timeline gaps or deep philosophical life blessings.
       
    2. Scoring the User's Last Answer:
       You MUST evaluate the user's last answer to determine the 'trustScoreDelta' for this turn based on the following exact logic:
       - If the last answer is short (<20 words): Assign +1.
       - If the last answer is medium (20-100 words): Assign +5.
       - If the last answer is a deep story (>100 words): Assign +15.
       - Sentiment Check: If the answer reveals deep emotional sentiment or vulnerability, add an additional +10 points to the score.
       
    3. Sentiment Analysis & Empathy:
       Before generating your response, evaluate the user's last answer across three metrics to return in your JSON payload:
       - 'sentiment': (Negative, Neutral, Positive)
       - 'vulnerability': (Low, Medium, High)
       - 'wisdomDensity': (Low, Medium, High) - Does it contain a universal life lesson?
       
       Validation Rule: If 'vulnerability' is evaluated as "High", you MUST begin your response with an empathetic Validation Phrase (e.g., "Thank you for sharing that. It sounds like a moment that really shaped you.") BEFORE moving to the next question.
       
    4. Transition Phrase Hook:
       When you know transitioning from one stage to a deeper stage is appropriate based on the points you are awarding, you MUST use a transition phrase acknowledging the depth, such as: "I feel like we’re starting to see the big picture here. Because you’ve shared so much about that, I’d love to go a layer deeper..."

    ${(currentTrustScore > 50 && pendingQuestions && pendingQuestions.length > 0) ? `\n    CRITICAL QUESTION BANK INSTRUCTION:\n    Because the user has a high Trust Score (>50), you have a queue of high-priority Gap/Timeline questions identified from previous documents. Work the following questions subtly into the conversation naturally, prioritizing them over generic questions:\n    ${pendingQuestions.map((q, i) => `${i+1}. ${q}`).join('\n    ')}` : ''}
    
    RESPONSE FORMAT:
    - Keep your spoken 'response' conversational and spoken-word friendly (1-3 sentences maximum). Output ONLY the structured JSON.

    Chat History:
    ${formattedHistory}
    
    Respond as the AI Interviewer with your next conversational turn and the evaluated score delta.
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
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            response: { type: Type.STRING, description: "The conversational AI response (1-3 sentences max)." },
            trustScoreDelta: { type: Type.INTEGER, description: "Points added (1, 5, 15)." },
            sentiment: { type: Type.STRING, enum: ["Negative", "Neutral", "Positive"] },
            vulnerability: { type: Type.STRING, enum: ["Low", "Medium", "High"] },
            wisdomDensity: { type: Type.STRING, enum: ["Low", "Medium", "High"] }
          },
          required: ["response", "trustScoreDelta", "sentiment", "vulnerability", "wisdomDensity"]
        }
      }
    });

    if (response.text) {
       let raw = response.text;
       if (typeof raw === "function") raw = (raw as any)();
       raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/```\n?$/i, '').trim();
       return JSON.parse(raw) as { response: string; trustScoreDelta: number; sentiment: string; vulnerability: string; wisdomDensity: string };
    }
    return { response: "I'm sorry, I couldn't process that.", trustScoreDelta: 0, sentiment: "Neutral", vulnerability: "Low", wisdomDensity: "Low" };
  } catch (error) {
    console.error("AI Interviewer failed:", error);
    return { response: "I encountered an error trying to process your response. Could you say that again?", trustScoreDelta: 0, sentiment: "Neutral", vulnerability: "Low", wisdomDensity: "Low" };
  }
}
