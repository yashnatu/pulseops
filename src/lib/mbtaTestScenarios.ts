// src/lib/mbtaTestScenarios.ts
// MBTA test scenario loader and helpers

import fs from "fs";
import path from "path";

export type MbtaTestScenario = {
  id: string;
  label: string;
  short_description: string;
  mode: string;
  route_id: string;
  segment_start_stop_id: string;
  segment_end_stop_id: string;
  severity: "minor" | "moderate" | "major";
  reason: string;
  expected_delay_minutes: number;
  riders_estimated: number;
  default_actions: string[];
};

let SCENARIOS: MbtaTestScenario[] = [];

function loadScenarios(): MbtaTestScenario[] {
  if (SCENARIOS.length > 0) return SCENARIOS;
  
  const filePath = path.join(__dirname, "..", "data", "mbta_test_scenarios.json");
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as MbtaTestScenario[];
    SCENARIOS = parsed;
    console.log(`✅ Loaded ${SCENARIOS.length} MBTA test scenarios`);
  } catch (err) {
    console.error("[mbtaTestScenarios] Failed to load mbta_test_scenarios.json", err);
    SCENARIOS = [];
  }
  
  return SCENARIOS;
}

export function getAllMbtaTestScenarios(): MbtaTestScenario[] {
  return loadScenarios();
}

export function getMbtaTestScenarioById(id: string): MbtaTestScenario | undefined {
  return loadScenarios().find((s) => s.id === id);
}

