// src/lib/caseStudies.ts
// Case study data models and helpers for historical incident analysis

import fs from "fs";
import path from "path";

export type CaseStudy = {
  id: string;
  city: string;
  agency: string;
  mode: string; // "bus", "subway", "light_rail", "commuter_rail", etc.
  scenario_type: string; // "weather_blockage", "signal_failure", "event_crowding", etc.
  corridor_type: string; // "urban_trunk", "core_subway", "event_corridor", etc.
  time_of_day: string; // "am_peak", "pm_peak", "midday", "overnight"
  weekday: string; // "weekday", "weekend"
  peak_delay_minutes: number;
  duration_minutes: number;
  riders_impacted: number;
  actions_taken: string[]; // ["detours", "shuttle buses", "rider alerts", etc.]
  outcome_quality: "good" | "mixed" | "poor";
  summary: string; // 2–3 sentence description
  source_url?: string; // Optional link to source article/report
};

let CASE_STUDIES: CaseStudy[] = [];

function loadCaseStudies(): CaseStudy[] {
  if (CASE_STUDIES.length > 0) return CASE_STUDIES;

  const filePath = path.join(__dirname, "..", "data", "case_studies.json");
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as CaseStudy[];
    CASE_STUDIES = parsed;
    console.log(`[caseStudies] Loaded ${CASE_STUDIES.length} case studies`);
  } catch (err) {
    console.error("[caseStudies] Failed to load case_studies.json", err);
    CASE_STUDIES = [];
  }

  return CASE_STUDIES;
}

export function getAllCaseStudies(): CaseStudy[] {
  return loadCaseStudies();
}

export type CaseStudyQuery = {
  mode?: string;
  scenario_type?: string;
  time_of_day?: string;
  weekday?: string;
  corridor_type?: string;
};

export function findRelevantCaseStudies(query: CaseStudyQuery): CaseStudy[] {
  const all = loadCaseStudies();
  if (all.length === 0) return [];

  const scored = all.map((cs) => {
    let score = 0;

    if (query.mode && cs.mode === query.mode) score += 2;
    if (query.scenario_type && cs.scenario_type === query.scenario_type)
      score += 3;
    if (query.corridor_type && cs.corridor_type === query.corridor_type)
      score += 1;
    if (query.time_of_day && cs.time_of_day === query.time_of_day) score += 1;
    if (query.weekday && cs.weekday === query.weekday) score += 1;
    if (cs.outcome_quality === "good") score += 0.5;

    return { cs, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const nonZero = scored.filter((s) => s.score > 0).map((s) => s.cs);
  if (nonZero.length >= 3) return nonZero.slice(0, 5);

  return scored.map((s) => s.cs).slice(0, 5);
}


