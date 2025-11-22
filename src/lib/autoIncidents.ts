// src/lib/autoIncidents.ts
// Automatic incident creation based on live MBTA (GTFS-RT) world status

import { getWorldStatus } from "./world";
import { store } from "./store";
import type { Incident } from "./models";

/**
 * Find an open incident for a given route that was auto-created from MBTA data.
 * This prevents spamming duplicate incidents while a disruption is ongoing.
 */
function findOpenIncidentForRoute(route_id: string): Incident | undefined {
  const incidents = store.getAllIncidents();
  return incidents.find(
    (inc) =>
      inc.status === "open" &&
      inc.route_ids.includes(route_id) &&
      (inc.data_source === "auto_mbta_realtime" ||
        inc.data_source === "gtfs_realtime")
  );
}

/**
 * Maybe auto-create an incident based on the latest MBTA world status.
 * Only fires when the world source is MBTA and delays / trip impacts are significant.
 */
export async function maybeAutoCreateIncident(): Promise<void> {
  const worldStatus = await getWorldStatus();

  if (worldStatus.source !== "mbta_v3_api") {
    console.log("[autoIncident] Skipping auto incident (source is not MBTA)", {
      source: worldStatus.source,
    });
    return;
  }

  const { avg_delay_minutes, trips_impacted, route_id, riders_estimated } =
    worldStatus;

  const isSevereDelay = avg_delay_minutes >= 8;
  const isModerateDelay = avg_delay_minutes >= 5;
  const manyTripsImpacted = trips_impacted >= 3;

  if (!isModerateDelay && !manyTripsImpacted) {
    console.log("[autoIncident] No auto incident (delays below threshold)", {
      avg_delay_minutes,
      trips_impacted,
      route_id,
    });
    return;
  }

  console.log("[autoIncident] Candidate MBTA auto-incident", {
    avg_delay_minutes,
    trips_impacted,
    route_id,
  });

  // Avoid duplicate open incidents for this route
  const existing = findOpenIncidentForRoute(route_id);
  if (existing) {
    console.log("[autoIncident] Open incident already exists; skipping", {
      id: existing.id,
      route_id,
    });
    return;
  }

  const id = `incident-${Date.now()}`;

  const incident: Incident = {
    id,
    status: "open",
    severity: isSevereDelay ? "major" : "moderate",
    type: "corridor_blockage",
    route_ids: [route_id],
    segment_start_stop_id: worldStatus.segment_start_stop_id,
    segment_end_stop_id: worldStatus.segment_end_stop_id,
    start_time: new Date().toISOString(),
    avg_delay_minutes,
    trips_impacted,
    riders_estimated,
    data_source: "gtfs_realtime",
  };

  store.createIncident(incident);
  console.log("[autoIncident] Created auto incident from MBTA status", {
    id,
    route_id,
    avg_delay_minutes,
    trips_impacted,
  });
}


