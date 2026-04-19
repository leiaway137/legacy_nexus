import { uploadNotebookSource } from "./mongo/db";

const TRANSCRIPT_1 = `[Interview: The Vision Behind Legacy Nexus]

Interviewer: Today we are speaking with the creator of Legacy Nexus from The Global Fold LLC. Can you tell us about the vision behind this platform?

Founder: Absolutely. We built Legacy Nexus because families lose so much of their raw history with each passing generation. We wanted a secure, digital vault where you can act as the 'Archivist', uploading old diaries, transcriptions, and audio logs to permanently preserve your memories. 

Interviewer: How does the AI fit into this archiving process?

Founder: The system is designed to be highly active. Instead of just storing files, Legacy Nexus maps out the information. If you navigate to the 'AI Interviewer', the system uses the context of what you've already uploaded to ask you interactive, deeply personal questions about your life, pulling out the hidden stories and filling in the gaps of your family's history.

Interviewer: And what about the 'Podcasts' I form?

Founder: Once you've uploaded enough raw memories, you can select the documents and generate a dynamic, NPR-style audio conversation. Two AI hosts will discuss the legacy and history documented in your vault, making it incredibly easy to share those stories with younger generations.

Interviewer: That's incredible. Thank you for sharing.`;

const TRANSCRIPT_2 = `[Interview: Getting Started with your Vault]

User: I've just created my account. How do I actually get started using this?

System Guide: Welcome! The first thing you'll want to do is navigate to your 'Sources' dashboard. You can upload any text file, diary entry, or raw transcript. This acts as the foundational knowledge for your vault.

User: Okay, and once it's uploaded?

System Guide: The system automatically reads it and assesses the intelligence. Next, you can go to the 'Interviewer' tab. The AI will interview you to extract more details about the topics you just uploaded! Your answers are automatically captured and saved as new sources.

User: What if I want to clear these out and add my real family history?

System Guide: You can safely delete these onboarding transcripts directly from your dashboard using the 'Remove Source' trash icon. Once your vault is clear, no residual data is left behind, and you can begin archiving your true legacy!`;

export async function seedUserOnboarding(userId: string) {
    try {
        await uploadNotebookSource(
            userId, 
            "The_Vision_of_Legacy_Nexus.txt", 
            Buffer.byteLength(TRANSCRIPT_1, 'utf8'), 
            TRANSCRIPT_1
        );
        
        await uploadNotebookSource(
            userId, 
            "System_Onboarding_Guide.txt", 
            Buffer.byteLength(TRANSCRIPT_2, 'utf8'), 
            TRANSCRIPT_2
        );
    } catch (e) {
        console.error("Failed to seed onboarding datasets", e);
    }
}
