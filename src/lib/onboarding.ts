import { uploadNotebookSource } from "./mongo/db";

const TRANSCRIPT_1 = `[Interview: The Vision Behind Legacy Nexus]

Interviewer: Today we are speaking with the creator of Legacy Nexus from The Global Fold LLC. Can you tell us about the vision behind this platform?

Founder: Absolutely. We built Legacy Nexus because families lose so much of their raw history with each passing generation. We wanted a secure, digital vault where you can act as the 'Archivist', uploading old diaries, transcriptions, and audio logs to permanently preserve your memories. 

Interviewer: How does the AI fit into this archiving process?

Founder: The system is designed to be highly active. Instead of just storing files, Legacy Nexus maps out the information. If you navigate to the 'AI Interviewer', the system uses the context of what you've already uploaded to ask you interactive, deeply personal questions about your life, pulling out the hidden stories and filling in the gaps of your family's history.

Interviewer: And what about the 'Podcasts' I form?

Founder: Once you've uploaded enough raw memories, you can select the documents and generate a dynamic, NPR-style audio conversation. Two AI hosts will discuss the legacy and history documented in your vault, making it incredibly easy to share those stories with younger generations.

Interviewer: That's incredible. Thank you for sharing.`;

const TRANSCRIPT_2 = `[System Dialogue: Getting Started with your Vault]

User: I've just created my account. How do I actually get started using this?

System Guide: Welcome! The first thing you'll want to do is navigate to your 'Sources' dashboard. You can upload any text file, diary entry, or raw transcript. This acts as the foundational knowledge for your vault.

User: Okay, and once it's uploaded?

System Guide: The system automatically reads it and assesses the intelligence. Next, you can go to the 'Interviewer' tab. The AI will interview you to extract more details about the topics you just uploaded! Your answers are automatically captured and saved as new sources.

User: What if I want to clear these out and add my real family history?

System Guide: You can safely delete these onboarding transcripts directly from your dashboard using the 'Remove Source' trash icon. Once your vault is clear, no residual data is left behind, and you can begin archiving your true legacy!`;

const TRANSCRIPT_3 = `[Recording Timestamp: 14:02:44 - Zoom Archival Session 01]

Interviewer: I appreciate you sitting down with me today. Let's dive deeper into the actual features of Legacy Nexus. People are deeply concerned about privacy these days, especially with AI. How does The Global Fold approach this?

Founder: It's the absolute foundation of the platform. Legacy Nexus isn't a social network or a data-mining operation. It's a closed-circuit vault. When you upload a transcript of your grandfather speaking, the AI utilizes that exclusively within your encrypted session. We purposefully isolated the architecture so your family's narratives never bleed into public foundation models.

Interviewer: You mentioned "Progressive Disclosure" earlier. Can you explain that feature to me like I'm a novice?

Founder: Definitely. Imagine you find a 10-page letter written by your great-grandmother. You upload it. Usually, that's where the journey ends. But our Progressive Disclosure engine "reads" the letter and identifies gaps. It might notice she mentioned moving to Chicago in 1945 but never explained why.

Interviewer: So the AI Interviewer steps in?

Founder: Exactly. The AI Interviewer spins up a session tailored specifically to you. It will say, "I saw your great-grandmother moved to Chicago in '45. Do you know if your grandfather traveled with her?" It turns passive archiving into a living, breathing interview process that actively hunts down missing pieces of your heritage before they are lost forever.

Interviewer: That's fascinating. It's like having a dedicated historian constantly cross-referencing your family tree. 

Founder: Right. And every time you answer one of those generated questions, the system saves your transcript as a brand-new source document, recursively making the overarching family narrative even smarter and more complete.`;

const TRANSCRIPT_4 = `[Raw Audio Transcript - Project genesis tape, uncut]
Speaker 1 (Researcher): Testing levels... okay, we're good. So let's go back to the original reason this platform was conceived. You usually don't build software this complex just for fun.

Speaker 2 (Founder): No, you don't. It started when my father began losing his memory. We had these shoeboxes full of old tapes and scattered letters, but no cohesive thread. We tried writing a book, but it was just too overwhelming. 

Speaker 1: And you wanted an automated way to compile it?

Speaker 2: Yes and no. We didn't want the machine to write it FOR us, we wanted the machine to help us remember. That's why the core of Legacy Nexus is centered around the 'Wisdom Summaries' and 'High-Fidelity Stories'. 

Speaker 1: How do those differ from the podcasts you talked about?

Speaker 2: The podcasts are great for passive consumption—like listening to an audio documentary of your family on a road trip. But the High-Fidelity Stories are different. The system analyzes all the scattered interviews you've conducted over the years and chronologically weaves them together into a professional, third-person biography. 

Speaker 1: That sounds like it preserves the "Raw Truth."

Speaker 2: Precisely. The goal was never just to store data. The goal of The Global Fold with Legacy Nexus is to extract the wisdom of a lived life and package it in a way that your great-great-grandchildren will actually want to engage with. It bridges the generational divide.`;

export async function seedUserOnboarding(userId: string) {
    try {
        await uploadNotebookSource(
            userId, 
            "01_The_Vision_of_Legacy_Nexus.txt", 
            Buffer.byteLength(TRANSCRIPT_1, 'utf8'), 
            TRANSCRIPT_1
        );
        
        await uploadNotebookSource(
            userId, 
            "02_System_Onboarding_Guide.txt", 
            Buffer.byteLength(TRANSCRIPT_2, 'utf8'), 
            TRANSCRIPT_2
        );

        await uploadNotebookSource(
            userId, 
            "03_Interview_Privacy_and_Progressive_Disclosure.txt", 
            Buffer.byteLength(TRANSCRIPT_3, 'utf8'), 
            TRANSCRIPT_3
        );

        await uploadNotebookSource(
            userId, 
            "04_Uncut_Genesis_Tape_The_Why.txt", 
            Buffer.byteLength(TRANSCRIPT_4, 'utf8'), 
            TRANSCRIPT_4
        );
    } catch (e) {
        console.error("Failed to seed onboarding datasets", e);
    }
}
