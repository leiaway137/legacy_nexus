import { uploadNotebookSource, saveDashboardState, saveHighFidelityStories, updateNotebookSourceIntelligence, updateSourceSyncStatus } from "./mongo/db";
import type { HighFidelityStory, DocumentIntelligence } from "./rag/index";
import { embedStoriesToPineconeAction } from "@/app/actions";

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

const DUMMY_DASHBOARD_STATE = {
    synopsis: "The user stands as the esteemed creator of Legacy Nexus, a revolutionary platform meticulously crafted to safeguard personal and family histories. Fueled by a profound understanding of memory loss and fragmented records, they innovated a system that actively helps individuals remember and reconstruct their past. A core tenet of their work is unwavering privacy, implemented through a closed-circuit vault architecture where AI utilizes data exclusively within encrypted user sessions. Through the ingenious integration of advanced AI, including the Progressive Disclosure engine, raw diaries and audio logs are transformed into permanently preserved High-Fidelity Stories. This living, recursive process ensures the 'Raw Truth' of a lived life is skillfully unearthed, chronologically woven, and packaged for future generations.",
    wisdom: [
        { tag: "Preserving The Raw Truth", summary: "Legacy preservation is not about summarizing data; it's about extracting the wisdom of a lived life and bridging the generational divide so future descendants actively engage with their heritage." },
        { tag: "Progressive Disclosure", summary: "Passive archiving is fundamentally flawed. Active archiving utilizes AI to hunt down missing historical gaps and interactively query the archivist before memories are lost forever." },
        { tag: "Encrypted Sequestration", summary: "Family histories must be defended. True legacy tools must isolate architecture to guarantee personal narratives never bleed into public foundation models." }
    ],
    questions: [
        "What specific gaps in your own family's history originally inspired the creation of the Progressive Disclosure engine?",
        "Could you share a concrete example of a fragile memory that would have been completely lost without the interactive questioning of the AI?"
    ]
};

const DUMMY_STORIES: HighFidelityStory[] = [
    {
        id: "onboarding-story-1",
        era: "Project Genesis (Early Phase)",
        title: "The Fragmented Shoebox and the Origin of Narrative Capture",
        synopsis: "Confronted by the accelerating memory loss of his father, the founder realizes that passive historical archiving—hoarding old letters and unorganized tapes in literal shoeboxes—is fundamentally flawed. The realization sparks the core architectural design for the Progressive Disclosure engine.",
        detailedNarrative: "It began not with a technological breakthrough, but with a deeply personal crisis. The founder's father was losing his memory, taking generations of oral history with him. In a desperate attempt to capture the legacy, the family had collected scattered letters, disjointed diary entries, and endless hours of raw cassette tapes. They threw them into literal shoeboxes, hoping to write a book. But the sheer volume of unstructured data was insurmountable. 'We didn't want the machine to write it for us,' the founder noted during the uncut Genesis audio tape. 'We wanted the machine to help us remember.' This exact frustration became the crucible for Legacy Nexus. The founder identified that passive storage was useless without chronological structuring. This led directly to the conceptualization of the Progressive Disclosure engine—an active AI system that wouldn't just hold files, but would actively read them, identify the gaps in the timeline, and proactively interview the user to connect the dots before those memories vanished entirely.",
        psychometrics: [{ label: "Grief", val: 0.6 }, { label: "Innovation", val: 0.9 }, { label: "Frustration", val: 0.7 }],
        rubric: { context: true, conflict: true, resolution: true },
        extraction: {
            present: true,
            depthLevel: 4,
            primaryCategory: "Resilience",
            secondaryCategory: "Impact",
            insightSummary: "Pain and potential loss act as explosive catalysts for systemic innovation.",
            legacyLesson: "Information is entirely useless without structure and an overarching narrative thread. Actively pursue history; do not just passively collect it.",
            rawQuote: "We didn't want the machine to write it FOR us, we wanted the machine to help us remember."
        },
        peopleMentioned: ["The Founder", "The Father"]
    },
    {
        id: "onboarding-story-2",
        era: "Architectural Synthesis (Mid Phase)",
        title: "Defending the Narrative: Building the Encrypted Sequestration Protocol",
        synopsis: "As the platform transitions from an organizational tool to an interactive AI interviewer, the founder institutes a strict closed-circuit security model. Legacy Nexus commits to ensuring pure narrative privacy, successfully isolating family histories from public foundation models.",
        detailedNarrative: "During the mid-phase development of Legacy Nexus, the integration of advanced Large Language Models transformed the system. It moved from being an intelligent timeline to an active interrogator capable of producing NPR-style audio documentaries. But with this incredible power came an equally catastrophic risk: data mining. According to the original architect logs, the founders recognized that family history is inherently comprised of highly sensitive, unvarnished truths and emotional vulnerabilities. The mandate was cemented: 'Family histories must be defended.' The engineering team completely isolated the cloud architecture, implementing what they deemed 'Encrypted Sequestration.' When a user uploads a personal diary, the AI operates efficiently in a closed-circuit vault. Absolutely no user data is fed back into public foundation models. This strict compartmentalization ensured that the rawest, most truthful records of a lineage could be permanently archived without the fear of systemic exposure.",
        psychometrics: [{ label: "Protectiveness", val: 0.9 }, { label: "Ethics", val: 0.8 }],
        rubric: { context: true, conflict: true, resolution: true },
        extraction: {
            present: true,
            depthLevel: 5,
            primaryCategory: "Stewardship",
            secondaryCategory: "Philosophical",
            insightSummary: "True legacy preservation requires uncompromised ethical boundaries regarding data sovereignty.",
            legacyLesson: "Never trade the sanctity of your private history for the convenience of public platforms. Always safeguard the vulnerable memories.",
            rawQuote: "We purposefully isolated the architecture so your family's narratives never bleed into public foundation models."
        },
        peopleMentioned: ["The Founder", "Engineering Team"]
    }
];

const DUMMY_INTELLIGENCE: DocumentIntelligence = {
    documentType: "balanced_conversation",
    speakerProfiles: [
        { label: "Speaker 1", role: "Interviewer", name: "Researcher", toneDescription: "Analytical and inquisitive", keyTopics: ["Platform Architecture", "Privacy", "Motivation"], relationshipToSubject: "Information Gatherer" },
        { label: "Speaker 2", role: "Subject", name: "The Founder", toneDescription: "Reflective, technical, and passionate", keyTopics: ["Memory loss", "Data privacy", "Progressive Disclosure"], relationshipToSubject: "Creator and Visionary" }
    ],
    anchorPoints: [
        { type: "direct_identification", quote: "We didn't want the machine to write it FOR us", speaker: "Speaker 2", insight: "Demonstrates clear vision against pure autonomous generation in favor of augmented collaboration." },
        { type: "relationship_marker", quote: "When my father began losing his memory", speaker: "Speaker 2", insight: "Catalytic emotional center for the development of the tool." }
    ],
    mainSubject: { name: "The Founder", summary: "The visionary architect behind Legacy Nexus." },
    powerAsymmetry: false,
    recommendedFormat: "DIALOGUE",
    confidence: 97
};

export async function seedUserOnboarding(userId: string) {
    try {
        const doc1 = await uploadNotebookSource(
            userId, 
            "01_The_Vision_of_Legacy_Nexus.txt", 
            Buffer.byteLength(TRANSCRIPT_1, 'utf8'), 
            TRANSCRIPT_1
        );
        
        const doc2 = await uploadNotebookSource(
            userId, 
            "02_System_Onboarding_Guide.txt", 
            Buffer.byteLength(TRANSCRIPT_2, 'utf8'), 
            TRANSCRIPT_2
        );

        const doc3 = await uploadNotebookSource(
            userId, 
            "03_Interview_Privacy_and_Progressive_Disclosure.txt", 
            Buffer.byteLength(TRANSCRIPT_3, 'utf8'), 
            TRANSCRIPT_3
        );

        const doc4 = await uploadNotebookSource(
            userId, 
            "04_Uncut_Genesis_Tape_The_Why.txt", 
            Buffer.byteLength(TRANSCRIPT_4, 'utf8'), 
            TRANSCRIPT_4
        );
        
        // Lock these files off from the AI Token Sync worker by preemptively injecting a completed dashboard state
        const processedDocs = [doc1, doc2, doc3, doc4].filter(d => d);
        const processedIds = processedDocs.map(d => d!.id);
        
        // Force the DB to pretend these have been thoroughly analyzed by the RAG Step 0 Intelligence processor
        for (const doc of processedDocs) {
            await updateSourceSyncStatus(doc!.id, true);
            await updateNotebookSourceIntelligence(doc!.id, DUMMY_INTELLIGENCE);
        }
        
        const vaultState = {
            id: "", // Will be auto-assigned by MongoDB
            userId: userId,
            ...DUMMY_DASHBOARD_STATE,
            processedSourceIds: processedIds
        };
        
        await saveDashboardState(userId, vaultState);
        await saveHighFidelityStories(userId, DUMMY_STORIES);
        
        // Critically, we must push the pre-populated stories into the vector database 
        // to establish the baseline RAG context for the Legacy Overview Chat engine!
        try {
            const { upsertVectors } = require("@/lib/local-vector/client");
            const vectorsData = require("./onboarding-vectors.json");
            const vectors = vectorsData.map((v: any) => ({
                id: `story-${v.storyId}`,
                values: v.values,
                metadata: {
                    text: v.text,
                    sourceId: "onboarding-seed",
                    era: v.era,
                    perspective: "Synthesized Legacy Content"
                }
            }));
            await upsertVectors(userId, vectors);
        } catch (embedError) {
            console.error("Failed to push onboarding seed to Pinecone", embedError);
        }
        
    } catch (e) {
        console.error("Failed to seed onboarding datasets", e);
    }
}
