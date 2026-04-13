// @ts-nocheck

import { extractHighFidelityStories } from "./src/lib/rag/index.js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function test() {
    try {
        console.log("Testing extractHighFidelityStories...");
        const result = await extractHighFidelityStories("When I was young, I went fishing with my dad.", "English", "");
        console.log("Result:", result);
    } catch (e) {
        console.error("Test failed:", e);
    }
}
test();
