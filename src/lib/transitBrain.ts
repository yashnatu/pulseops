// src/lib/transitBrain.ts
// Simple knowledge graph abstraction for PulseOps

import fs from "fs";
import path from "path";
import type { TimedWorldStatus } from "./world";
import type { ExternalContext } from "./externalData";

export type Corridor = {
  id: string;
  name: string;
  modes: string[];
  routes: string[];
  transfer_hubs: string[];
  vulnerabilities: string[];
  notes?: string;
};

export type BrainRule = {
  id: string;
  description: string;
  conditions: string[];
  suggested_actions: string[];
};

type TransitBrainData = {
  corridors: Corridor[];
  rules: BrainRule[];
};

export type BrainInsight = {
  corridor_id?: string;
  corridor_name?: string;
  likely_failure_modes: string[];
  triggered_rules: BrainRule[];
};

let BRAIN: TransitBrainData | null = null;

function loadBrain(): TransitBrainData {
  if (BRAIN) return BRAIN;
  const fp = path.join(__dirname, "..", "data", "transit_brain.json");
  try {
    const raw = fs.readFileSync(fp, "utf8");
    BRAIN = JSON.parse(raw) as TransitBrainData;
  } catch (err) {
    console.error("[transitBrain] failed to load transit_brain.json", err);
    BRAIN = { corridors: [], rules: [] };
  }
  return BRAIN!;
}

export function getCorridorForRoute(route_id: string): Corridor | null {
  const brain = loadBrain();
  return brain.corridors.find((c) => c.routes.includes(route_id)) || null;
}

export function analyzeWithBrain(
  worldHistory: TimedWorldStatus[],
  external: ExternalContext | null,
): BrainInsight {
  if (!worldHistory.length) {
    return {
      likely_failure_modes: [],
      triggered_rules: [],
    };
  }

  const latest = worldHistory[worldHistory.length - 1];
  const corridor = getCorridorForRoute(latest.route_id);
  const brain = loadBrain();

  const likely: string[] = [];
  if (corridor) {
    likely.push(...corridor.vulnerabilities);
  }

  const triggered: BrainRule[] = [];
  const nearbyEvent = (external?.events || []).length > 0;
  const headwayVariance: number | null = null; // placeholder for future metrics

  for (const rule of brain.rules) {
    let ok = true;
    for (const cond of rule.conditions) {
      if (cond.includes("corridor_id") && corridor) {
        const expected = cond.split("==")[1].trim().replace(/['"]/g, "");
        if (corridor.id !== expected) ok = false;
      } else if (
        cond.includes("headway_variance_secs") &&
        headwayVariance != null
      ) {
        const val = Number(cond.split(">").pop()!.trim());
        if (!(headwayVariance > val)) ok = false;
      } else if (cond.includes("nearby_event == true")) {
        if (!nearbyEvent) ok = false;
      }
    }
    if (ok) triggered.push(rule);
  }

  return {
    corridor_id: corridor?.id,
    corridor_name: corridor?.name,
    likely_failure_modes: Array.from(new Set(likely)),
    triggered_rules: triggered,
  };
}


