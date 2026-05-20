import { generateBatchTextMappings } from "../src/lib/rag/index";
import fs from "fs";

const DUMMY_STORIES = [
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

async function main() {
  const stories = DUMMY_STORIES;
  const batchTexts = stories.map(story => {
     let baseText = `[Legacy Entry]\nTitle: ${story.title}\nEra: ${story.era}\nSynopsis: ${story.synopsis}\nNarrative: ${story.detailedNarrative || "N/A"}\nLegacy Lesson: ${story.extraction?.legacyLesson || "N/A"}\nThemes: ${story.psychometrics?.map(p => `${p.label} (${p.val})`).join(', ')}\nPeople Mentioned: ${(story.peopleMentioned || []).join(', ')}`;
     return baseText;
  });
  
  const embeddedBatches = await generateBatchTextMappings(batchTexts);
  
  const vectors = [];
  for (let j = 0; j < embeddedBatches.length; j++) {
      const embeddingData = embeddedBatches[j];
      if (embeddingData && embeddingData.length > 0) {
         vectors.push({
            storyId: stories[j].id,
            era: stories[j].era,
            text: batchTexts[j],
            values: embeddingData,
         });
      }
  }
  fs.writeFileSync("src/lib/onboarding-vectors.json", JSON.stringify(vectors, null, 2));
  console.log("Saved onboarding vectors!");
}

main().catch(console.error);
