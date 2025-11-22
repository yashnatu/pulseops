// src/lib/world.ts
// Transit world: Real GTFS-Realtime with fallback to simulation

import { getGtfsWorldStatus } from "./gtfsAdapter";

export type WorldStatus = {
  route_id: string;
  segment_start_stop_id: string;
  segment_end_stop_id: string;
  avg_delay_minutes: number;
  trips_impacted: number;
  riders_estimated: number;
  source: "mbta_v3_api" | "simulated";
};

export type TimedWorldStatus = WorldStatus & {
  timestamp: number; // ms since epoch
};

let currentDelay = 0;

// In-memory history of world status snapshots (last 60 minutes)
const worldHistory: TimedWorldStatus[] = [];

/**
 * Try to get live MBTA world status via GTFS-Realtime adapter.
 * Returns null on any failure so callers can safely fall back to simulation.
 */
async function getMbtaWorldStatusSafe(): Promise<WorldStatus | null> {
  try {
    console.log("[world] Trying MBTA world status via GTFS-RT adapter");
    const status = await getGtfsWorldStatus();

    if (!status) {
      console.log("[world] MBTA world status returned null (no delays or feed unavailable)");
      return null;
    }

    const mapped: WorldStatus = {
      route_id: status.route_id,
      segment_start_stop_id: status.segment_start_stop_id,
      segment_end_stop_id: status.segment_end_stop_id,
      avg_delay_minutes: status.avg_delay_minutes,
      trips_impacted: status.trips_impacted,
      riders_estimated: status.riders_estimated,
      source: "mbta_v3_api",
    };

    console.log("[world] MBTA world status OK", {
      avg_delay_minutes: mapped.avg_delay_minutes,
      trips_impacted: mapped.trips_impacted,
      riders_estimated: mapped.riders_estimated,
      source: mapped.source,
    });

    return mapped;
  } catch (err) {
    console.error("[world] MBTA world status error, falling back to sim", err);
    return null;
  }
}

/**
 * Get the current state of the transit world.
 * Tries MBTA GTFS-Realtime first, falls back to simulation if unavailable.
 */
export async function getWorldStatus(): Promise<WorldStatus> {
  const live = await getMbtaWorldStatusSafe();
  if (live) {
    return live;
  }

  // Fallback to simulated world
  const simulated: WorldStatus = {
    route_id: "10",
    segment_start_stop_id: "S2",
    segment_end_stop_id: "S3",
    avg_delay_minutes: currentDelay,
    trips_impacted: currentDelay > 0 ? 3 : 0,
    riders_estimated: currentDelay > 0 ? 90 : 0,
    source: "simulated",
  };

  return simulated;
}

/**
 * Simulate a sudden disruption (big delay) on the corridor
 */
export function triggerDisruption(): void {
  currentDelay = 15;
  console.log("🚨 Disruption triggered! Delay set to 15 minutes");
}

/**
 * Gradually recover the corridor over time (decay delay by 1 min)
 */
export function decayDelay(): void {
  if (currentDelay > 0) {
    currentDelay = Math.max(0, currentDelay - 1);
    console.log(`⏱️  Delay decaying... Current: ${currentDelay} minutes`);
  }
}

/**
 * Record a world status snapshot to history
 */
export function recordWorldStatus(status: WorldStatus): void {
  const now = Date.now();

  const timed: TimedWorldStatus = {
    ...status,
    timestamp: now,
  };

  worldHistory.push(timed);

  // Keep only the last 60 minutes of history
  const cutoff = now - 60 * 60 * 1000;
  while (worldHistory.length && worldHistory[0].timestamp < cutoff) {
    worldHistory.shift();
  }
}

/**
 * Get the full world history (read-only copy)
 */
export function getWorldHistory(): TimedWorldStatus[] {
  return [...worldHistory];
}

