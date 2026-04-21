import { generatePodcastTranscript } from "./src/lib/rag/index";

async function test() {
  try {
     const t = await generatePodcastTranscript("This is a test context about a childhood trip to Oakland.", "Oakland Trip", "Short (~3-5 mins)");
     console.log(t);
  } catch (e) {
     console.error(e);
  }
}
test();
