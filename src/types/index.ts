// Core Schema Designs for Legacy Nexus

export type RiasecCode = "Realistic" | "Investigative" | "Artistic" | "Social" | "Enterprising" | "Conventional";

export type MbtiIdentity = 
  | "ISTJ" | "ISFJ" | "INFJ" | "INTJ"
  | "ISTP" | "ISFP" | "INFP" | "INTP"
  | "ESTP" | "ESFP" | "ENFP" | "ENTP"
  | "ESTJ" | "ESFJ" | "ENFJ" | "ENTJ";

export interface LegacyKeeper {
  id: string;
  name: string;
  email: string;
  riasecStoryCodes: RiasecCode[];
  mbtiIdentity?: MbtiIdentity;
  createdAt: Date;
}

export interface Seeker {
  id: string;
  name: string;
  email: string;
  riasecStoryCodes: RiasecCode[];
  mbtiIdentity?: MbtiIdentity;
  createdAt: Date;
}

export interface Transcript {
  id: string;
  legacyKeeperId: string;
  title: string;
  text: string;
  metadata: {
    recordedAt?: Date;
    duration?: number;
    sourceOrigin?: string; // Information on where this comes from (e.g. initial upload vs AI Interview)
  };
  wisdomTags: string[]; // e.g., ["#Resilience", "#CareerPivot"]
  ragMetadata: {
    chunkReferences: string[]; // IDs/refs for vector retrieval
  };
}

export interface InterviewSession {
  id: string;
  legacyKeeperId: string;
  seekerId: string; // The Seeker orchestrating the interview
  topicContext: string;
  promptRules: string;
  generatedQuestions: string[];
  status: "active" | "completed";
}

/**
 * NexusLink represents the grassroots expansion system based on cross-user references.
 * When a LegacyKeeper references a person in their story, the AI creates a NexusLink.
 */
export interface NexusLink {
  id: string;
  sourceKeeperId: string;              // The LegacyKeeper who told the story
  sourceTranscriptId: string;          // The transcript containing the story
  referencedPersonName: string;        // Name of the person mentioned
  referencedPersonEmail?: string;      // Used for email invitation
  linkedKeeperId?: string;             // If/when they register, their ID goes here
  sharedEventContext: string;          // AI summary of the event they shared
  status: "identified" | "invite_sent" | "perspective_shared";
}
