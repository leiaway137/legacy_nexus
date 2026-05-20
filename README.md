# Legacy Nexus

Legacy Nexus is a digital ecosystem dedicated to preserving and cross-referencing personal histories, life wisdom, and generational stories.

## The 'Transcript-Only' Philosophy

A core pillar of Legacy Nexus is cost-efficiency through a **Transcript-Only architecture**. 
Rather than hosting and storing expensive multimedia files (heavy audio and high-resolution video), Legacy Nexus relies strictly on optimized text transcripts, curated metadata, and 'Wisdom Tags'. 
This provides several key advantages:

1. **Near-Zero Storage Costs:** Allowing for high scalability without overhead storage bills.
2. **Instant Searchability:** NotebookLM-style RAG models can instantly parse, synthesize, and retrieve insights directly from text.
3. **Simplicity:** Focuses purely on the story and the wisdom generated, distilling long conversations into lightweight insights.

## AI Features (Powered by Local LLMs & Gemini)

Taking inspiration from NotebookLM, Legacy Nexus incorporates:
- **Source-Grounded Insights:** Syntheses and answers generated exclusively from the uploaded legacy transcripts via a robust Retrieval-Augmented Generation (RAG) pipeline.
- **The AI Interviewer:** Dynamic sessions that read past context and formulate deep, customized follow-up questions for the LegacyKeeper to answer.

## Grassroots Growth & Cross-User Referencing

Our most powerful feature is the **NexusLink**—an organic, grassroots expansion strategy.

1. **Extraction:** As a LegacyKeeper tells a story, the AI detects references to other individuals involved in those events.
2. **Cross-Referencing:** The system checks if the referenced person is already a registered user in our global ecosystem.
    - If they are, the system alerts them, prompting them to share *their* perspective of that exact same shared event.
3. **Invitation:** If the person is not registered, the system prepares an email invitation, asking them to create an account and share their viewpoint on a story they were just mentioned in.
4. **Result:** A globally interconnected web of multi-perspective, corroborated histories that naturally grows the user base through the "Seeker-funded" and community-invited mechanism.

## Getting Started (Local Development)

Legacy Nexus has recently been migrated to a fully local environment for cost-efficient prototyping, removing the need for external cloud database connections.

### Prerequisites
- Node.js 20+
- An API Key for Gemini (for fallback/advanced reasoning) or a local LLM setup via LM Studio / vLLM.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/leiaway137/legacy_nexus.git
   cd legacy_nexus
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Copy the environment template and fill in your keys.
   ```bash
   cp .env.template .env.local
   ```
   *Note: Because of the local transition, you do not need MongoDB or Pinecone URIs. The local `better-sqlite3` and `lancedb` will automatically initialize in a `.data/` folder at the root of the project.*

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3333](http://localhost:3333) with your browser to see the application.
