import { HighFidelityStory } from "./rag";

export const LABELS = ["Realistic", "Investigative", "Artistic", "Social", "Enterprising", "Conventional"];

export const RECOGNIZED_ERAS = [
  { key: "All Time", label: "All Time", isGlobal: true },
  { key: "Childhood", label: "Childhood (0-12)", isGlobal: false },
  { key: "Teens", label: "Teens (13-19)", isGlobal: false },
  { key: "Twenties", label: "Twenties", isGlobal: false },
  { key: "Thirties", label: "Thirties", isGlobal: false },
  { key: "Forties", label: "Forties", isGlobal: false },
  { key: "Fifties+", label: "Fifties+", isGlobal: false }
];

export const ARCHETYPE_MATRIX: Record<string, Record<string, string>> = {
  "Realistic": { "Competence": "The Master Craftsman", "Resilience": "The Survivalist", "Achievement": "The Trailblazer", "Physicality": "The Architect" },
  "Investigative": { "Philosophical": "The Sage", "Self-Awareness": "The Alchemist", "Competence": "The Architect" },
  "Artistic": { "Achievement": "The Visionary", "Relational": "The Muse", "Philosophical": "The Existentialist", "Expression": "The Creator" },
  "Social": { "Relational": "The Bridge-Builder", "Achievement": "The Mentor", "Resilience": "The Healer" },
  "Enterprising": { "Achievement": "The Titan", "Regret": "The Reformed Leader", "Impact": "The Catalyst" },
  "Conventional": { "Resilience": "The Anchor", "Competence": "The Custodian", "Philosophical": "The Moralist", "Stewardship": "The Guardian" }
};

export function getArchetypeTitle(topRiasec: string, secondRiasec: string, domExtCat: string) {
  const getBaseNode = (riasec: string) => {
     if (riasec === "Realistic") return "Realist";
     if (riasec === "Investigative") return "Analyst";
     if (riasec === "Artistic") return "Creator";
     if (riasec === "Social") return "Empath";
     if (riasec === "Enterprising") return "Catalyst";
     if (riasec === "Conventional") return "Guardian";
     return "Pragmatist";
  };

  const getBaseModifier = (riasec: string) => {
     if (riasec === "Realistic") return "Grounded";
     if (riasec === "Investigative") return "Seeking";
     if (riasec === "Artistic") return "Expressive";
     if (riasec === "Social") return "Relational";
     if (riasec === "Enterprising") return "Bold";
     if (riasec === "Conventional") return "Loyal";
     return "Seeking";
  };

  let primaryTitle = ARCHETYPE_MATRIX[topRiasec]?.[domExtCat];
  let primeNode = primaryTitle ? primaryTitle.replace(/^The\s+/i, '') : getBaseNode(topRiasec);

  let secondaryTitle = ARCHETYPE_MATRIX[secondRiasec]?.[domExtCat];
  let secNode = secondaryTitle ? secondaryTitle.replace(/^The\s+/i, '') : getBaseModifier(secondRiasec);

  return primeNode === secNode ? `The ${primeNode}` : `The ${secNode} ${primeNode}`;
}

export function computeCentroidMath(eraObj: any, sourceStories: HighFidelityStory[]) {
    let filtered = sourceStories;
    if (!eraObj.isGlobal) {
        filtered = sourceStories.filter(s => s.era === eraObj.key || s.era === eraObj.label);
    }

    let riasecTotals: Record<string, { sum: number, weights: number }> = { 
      "Realistic": { sum: 0, weights: 0 }, "Investigative": { sum: 0, weights: 0 }, 
      "Artistic": { sum: 0, weights: 0 }, "Social": { sum: 0, weights: 0 }, 
      "Enterprising": { sum: 0, weights: 0 }, "Conventional": { sum: 0, weights: 0 } 
    };
    
    const extCounts = new Map<string, number>();
    let highestCatCount = 0;
    let domCat = "None";

    filtered.forEach(s => {
       const impact = (s as any).impact_metadata;
       const we = impact?.emotional_intensity || 2.5;
       const wc = impact?.narrative_complexity || 2.5;
       const wd = impact?.duration_weight || 1.25;
       const totalWeight = ((we + wc) / 2) * wd;

       s.psychometrics?.forEach(metric => {
          if (riasecTotals[metric.label] !== undefined) {
             riasecTotals[metric.label].sum += (metric.val * totalWeight);
             riasecTotals[metric.label].weights += totalWeight;
          }
       });

       if (s.extraction?.present && s.extraction.primaryCategory && s.extraction.primaryCategory !== "None") {
          const count = (extCounts.get(s.extraction.primaryCategory) || 0) + 1;
          extCounts.set(s.extraction.primaryCategory, count);
          if (count > highestCatCount) {
              highestCatCount = count;
              domCat = s.extraction.primaryCategory;
          }
       }
    });

    // We output numerical percentages to build points downstream.
    const newRiasec = LABELS.map(label => {
       const agg = riasecTotals[label];
       if (agg.weights === 0) return 0.1;
       const weightedAvg = agg.sum / agg.weights;
       return Math.max(0.1, weightedAvg / 100);
    });
    
    const sortedRiasec = [...LABELS].sort((a, b) => {
       const scoreA = riasecTotals[a].weights > 0 ? (riasecTotals[a].sum / riasecTotals[a].weights) : 0;
       const scoreB = riasecTotals[b].weights > 0 ? (riasecTotals[b].sum / riasecTotals[b].weights) : 0;
       return scoreB - scoreA;
    });

    const topRiasecStr = sortedRiasec[0] || "Realistic";
    const secondRiasecStr = sortedRiasec[1] || "Investigative";
    const lowestCat = sortedRiasec[5] || "Realistic";
    const title = getArchetypeTitle(topRiasecStr, secondRiasecStr, domCat);

    return {
       numericalArray: newRiasec,
       lowestCat,
       archetype: {
          primaryRiasec: topRiasecStr,
          secondaryRiasec: secondRiasecStr,
          extraction: domCat,
          count: highestCatCount,
          title: title,
          rawStories: filtered
       }
    };
}

export function analyzeCrossMetricPattern(stories: HighFidelityStory[]) {
    const counts = new Map<string, number>();
    stories.forEach(s => {
       if (!s.psychometrics || s.psychometrics.length === 0) return;
       const highest = [...s.psychometrics].sort((a,b)=>b.val-a.val)[0].label;
       counts.set(highest, (counts.get(highest) || 0) + 1);
    });

    let domLabel = "Realistic";
    let max = 0;
    counts.forEach((v, k) => { if (v > max) { max = v; domLabel = k; } });

    const domStories = stories.filter(s => {
       if (!s.psychometrics || s.psychometrics.length === 0) return false;
       return [...s.psychometrics].sort((a,b)=>b.val-a.val)[0].label === domLabel;
    });

    if (domStories.length === 0) return null;

    const resolutionRate = domStories.filter(s => s.rubric?.resolution).length / domStories.length;
    let depthAvg = 0;
    domStories.forEach(s => { depthAvg += (s.extraction?.depthLevel || 0); });
    const maxPossibleDepth = domStories.length * 3;
    const extractionRate = maxPossibleDepth > 0 ? depthAvg / maxPossibleDepth : 0;

    let structuralIssue = "Extraction";
    let score = extractionRate;

    if (resolutionRate < extractionRate) {
        structuralIssue = "Resolution";
        score = resolutionRate;
    }

    const sortedImpact = [...domStories].sort((a,b) => (b.impact_metadata?.emotional_intensity || 0) - (a.impact_metadata?.emotional_intensity || 0));
    const representativeStory = sortedImpact[0];

    return {
       dominantTrait: domLabel,
       flaw: structuralIssue,
       flawScore: score,
       exampleStoryTitle: representativeStory?.title || "a specific memory",
       exampleStoryContext: representativeStory?.synopsis || "No narrative available"
    };
}
