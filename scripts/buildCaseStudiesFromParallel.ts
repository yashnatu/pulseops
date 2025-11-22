// scripts/buildCaseStudiesFromParallel.ts
// Offline script to build case_studies.json using Parallel FindAll API

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import type { CaseStudy } from "../src/lib/caseStudies";

dotenv.config();

const PARALLEL_API_KEY = process.env.PARALLEL_API_KEY || "";
const PARALLEL_API_BASE_URL =
  process.env.PARALLEL_API_BASE_URL || "https://api.parallel.ai";

if (!PARALLEL_API_KEY) {
  console.error("❌ [buildCaseStudies] PARALLEL_API_KEY is not set in .env");
  console.error("Add your Parallel API key to .env:");
  console.error("  PARALLEL_API_KEY=your_parallel_key_here");
  process.exit(1);
}

type FindAllResult = any; // Parallel API response type

type ThemeConfig = {
  id: string;
  query: string;
  scenario_type: string;
  mode: string;
  corridor_type: string;
};

const THEMES: ThemeConfig[] = [
  {
    id: "weather_bus_trunk",
    query:
      "city bus service disruption snow detour shuttle buses riders stranded transit alert",
    scenario_type: "weather_blockage",
    mode: "bus",
    corridor_type: "urban_trunk",
  },
  {
    id: "signal_subway",
    query:
      "subway signal failure major delays service disruption shuttle buses deployed transit agency",
    scenario_type: "signal_failure",
    mode: "subway",
    corridor_type: "core_subway",
  },
  {
    id: "event_crowding",
    query:
      "transit service crowding after stadium event special trains extra buses riders delayed",
    scenario_type: "event_crowding",
    mode: "rail",
    corridor_type: "event_corridor",
  },
  {
    id: "infrastructure_failure",
    query:
      "rail service disruption track damage infrastructure failure long delays shuttle operation",
    scenario_type: "infrastructure_failure",
    mode: "rail",
    corridor_type: "commuter_corridor",
  },
  {
    id: "vehicle_breakdown",
    query:
      "bus breakdown disabled vehicle blocking lane service delays tow truck transit riders",
    scenario_type: "vehicle_breakdown",
    mode: "bus",
    corridor_type: "urban_trunk",
  },
];

async function callParallelFindAll(theme: ThemeConfig): Promise<FindAllResult> {
  const url = `${PARALLEL_API_BASE_URL}/v1/find-all`;

  const body = {
    query: theme.query,
    extraction_instructions: `
      You are extracting structured data about real public transit disruptions.
      For each relevant incident, extract:
      - city (string)
      - transit_agency (string)
      - mode (string: bus, subway, light_rail, commuter_rail)
      - approximate_peak_delay_minutes (integer if mentioned)
      - approximate_duration_minutes (integer if mentioned)
      - approximate_riders_impacted (integer if mentioned)
      - brief_summary (2-3 sentences describing the incident)
      - actions_taken (array of short phrases like "detours", "shuttle buses", "rider alerts")
      - outcome (string: good, mixed, or poor depending on whether response was effective)
      - time_of_day (string: am_peak, pm_peak, midday, overnight if mentioned)
      - weekday (string: weekday or weekend)
    `,
    max_items: 10,
  };

  console.log(`  → Calling Parallel FindAll API...`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PARALLEL_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `[Parallel FindAll] HTTP ${res.status}: ${res.statusText} – ${text}`,
    );
  }

  const json = await res.json();
  return json;
}

function normalizeToCaseStudies(
  theme: ThemeConfig,
  result: FindAllResult,
): CaseStudy[] {
  // Defensively handle various possible response structures
  const items: any[] =
    result?.items || result?.results || result?.matches || [];

  if (!Array.isArray(items)) {
    console.warn(
      `  ⚠️  Expected array of items, got: ${typeof items}. Skipping.`,
    );
    return [];
  }

  const cases: CaseStudy[] = [];

  for (const item of items) {
    try {
      const extracted = item.extracted || item.fields || item.data || {};

      const city =
        extracted.city || extracted.location || "Unknown city";
      const agency =
        extracted.transit_agency || extracted.agency || "Unknown agency";
      const mode =
        (extracted.mode || theme.mode || "bus").toString().toLowerCase();

      const peakDelay =
        Number(extracted.approximate_peak_delay_minutes) ||
        Number(extracted.peak_delay_minutes) ||
        Number(extracted.delay_minutes) ||
        15; // Default 15 min if not specified

      const duration =
        Number(extracted.approximate_duration_minutes) ||
        Number(extracted.duration_minutes) ||
        60; // Default 1 hour if not specified

      const riders =
        Number(extracted.approximate_riders_impacted) ||
        Number(extracted.riders_impacted) ||
        100; // Default 100 riders if not specified

      const actions_raw =
        extracted.actions_taken || extracted.actions || extracted.measures || [];

      const actions_taken: string[] = Array.isArray(actions_raw)
        ? actions_raw.map((a: any) => String(a))
        : typeof actions_raw === "string"
        ? actions_raw.split(/[;,]/).map((s: string) => s.trim()).filter(Boolean)
        : ["rider alerts"]; // Default action

      const outcome_raw =
        extracted.outcome || extracted.outcome_quality || "";

      let outcome_quality: CaseStudy["outcome_quality"] = "mixed";
      const outcomeLower = String(outcome_raw).toLowerCase();
      if (outcomeLower.includes("good") || outcomeLower.includes("effective")) {
        outcome_quality = "good";
      } else if (
        outcomeLower.includes("poor") ||
        outcomeLower.includes("bad")
      ) {
        outcome_quality = "poor";
      }

      const summary =
        extracted.brief_summary ||
        extracted.summary ||
        extracted.description ||
        item.snippet ||
        item.title ||
        `Transit disruption: ${theme.scenario_type}`;

      const source_url: string | undefined =
        item.url || item.link || item.source_url;

      const time_of_day = extracted.time_of_day || "pm_peak";
      const weekday = extracted.weekday || "weekday";

      const cs: CaseStudy = {
        id: `${theme.id}_${cases.length}`,
        city: String(city),
        agency: String(agency),
        mode,
        scenario_type: theme.scenario_type,
        corridor_type: theme.corridor_type,
        time_of_day: String(time_of_day),
        weekday: String(weekday),
        peak_delay_minutes: Number.isFinite(peakDelay) ? peakDelay : 15,
        duration_minutes: Number.isFinite(duration) ? duration : 60,
        riders_impacted: Number.isFinite(riders) ? riders : 100,
        actions_taken,
        outcome_quality,
        summary: String(summary).substring(0, 500), // Limit length
        source_url,
      };

      cases.push(cs);
    } catch (err) {
      console.warn(`  ⚠️  Error parsing item:`, err);
      continue;
    }
  }

  return cases;
}

async function main() {
  console.log("🚀 Building case studies from Parallel FindAll API...\n");
  console.log(`API Base URL: ${PARALLEL_API_BASE_URL}`);
  console.log(`Themes to process: ${THEMES.length}\n`);

  const allCases: CaseStudy[] = [];

  for (const theme of THEMES) {
    try {
      console.log(`📡 Fetching theme: ${theme.id}`);
      console.log(`   Query: "${theme.query.substring(0, 60)}..."`);
      
      const result = await callParallelFindAll(theme);
      const normalized = normalizeToCaseStudies(theme, result);
      
      console.log(
        `   ✅ Got ${normalized.length} case studies for theme ${theme.id}\n`,
      );
      allCases.push(...normalized);
    } catch (err: any) {
      console.error(
        `   ❌ Error fetching theme ${theme.id}: ${err.message}\n`,
      );
      // Continue with other themes even if one fails
    }
  }

  if (!allCases.length) {
    console.error("\n❌ No case studies generated. Aborting.");
    console.error(
      "Check your PARALLEL_API_KEY and ensure the API is accessible.",
    );
    process.exit(1);
  }

  const outPath = path.join(__dirname, "..", "src", "data", "case_studies.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(allCases, null, 2), "utf8");
  
  console.log("\n✅ SUCCESS!");
  console.log(`📁 Wrote ${allCases.length} case studies to ${outPath}`);
  console.log("\nBreakdown by theme:");
  
  const byTheme = allCases.reduce((acc, cs) => {
    const themeId = cs.id.split("_").slice(0, -1).join("_");
    acc[themeId] = (acc[themeId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  Object.entries(byTheme).forEach(([theme, count]) => {
    console.log(`  - ${theme}: ${count} cases`);
  });
  
  console.log("\n💡 Next steps:");
  console.log("   1. Start your server: npm run dev");
  console.log("   2. Test the endpoint: curl http://localhost:3000/case-studies/recommendations");
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});

