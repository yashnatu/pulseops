// src/lib/gtfsAdapter.ts
// GTFS-Realtime integration following official spec

import GtfsRealtimeBindings from "gtfs-realtime-bindings";

export type GtfsWorldStatus = {
  route_id: string;
  segment_start_stop_id: string;
  segment_end_stop_id: string;
  avg_delay_minutes: number;
  trips_impacted: number;
  riders_estimated: number;
  source: "gtfs_realtime";
};

/**
 * Fetch and parse GTFS-Realtime feed to get current delay status
 * Returns null on any failure or if no delays found (triggers fallback to simulation)
 */
export async function getGtfsWorldStatus(): Promise<GtfsWorldStatus | null> {
  try {
    // Read environment variables
    const GTFS_RT_URL = process.env.GTFS_RT_URL || "";
    const GTFS_RT_ROUTE_FILTER = process.env.GTFS_RT_ROUTE_FILTER || "";
    const GTFS_RT_SEGMENT_START_STOP_ID =
      process.env.GTFS_RT_SEGMENT_START_STOP_ID || "stop-100";
    const GTFS_RT_SEGMENT_END_STOP_ID =
      process.env.GTFS_RT_SEGMENT_END_STOP_ID || "stop-120";

    // If no URL configured, return null immediately
    if (!GTFS_RT_URL) {
      return null;
    }

    console.log("📡 Fetching GTFS-Realtime feed from:", GTFS_RT_URL);

    // Fetch the protobuf feed
    const response = await fetch(GTFS_RT_URL);
    if (!response.ok) {
      console.warn(`⚠️  GTFS-RT fetch failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    // Decode the protobuf using gtfs-realtime-bindings
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(uint8Array);

    console.log(`✅ Decoded GTFS-RT feed with ${feed.entity.length} entities`);

    // Aggregate delays from all trip updates
    let totalDelaySeconds = 0;
    let tripsWithDelays = 0;
    const processedTripIds = new Set<string>();

    for (const entity of feed.entity) {
      // Skip if no trip_update
      if (!entity.tripUpdate) {
        continue;
      }

      const tripUpdate = entity.tripUpdate;
      const trip = tripUpdate.trip;

      // Route filtering (if specified)
      if (GTFS_RT_ROUTE_FILTER) {
        // Check if trip has a route_id that matches filter
        if (trip?.routeId && trip.routeId !== GTFS_RT_ROUTE_FILTER) {
          continue; // Skip trips that don't match the filter
        }
      }

      // Get trip ID for deduplication
      const tripId = trip?.tripId || `unknown-${entity.id}`;
      if (processedTripIds.has(tripId)) {
        continue; // Already processed this trip
      }

      // Process stop time updates
      const stopTimeUpdates = tripUpdate.stopTimeUpdate || [];
      let tripHasDelay = false;
      let tripTotalDelay = 0;

      for (const stopTimeUpdate of stopTimeUpdates) {
        // Per GTFS-RT spec: use arrival.delay if present, else departure.delay
        const arrival = stopTimeUpdate.arrival;
        const departure = stopTimeUpdate.departure;

        let delaySeconds = 0;

        if (arrival && typeof arrival.delay === "number") {
          delaySeconds = arrival.delay;
        } else if (departure && typeof departure.delay === "number") {
          delaySeconds = departure.delay;
        } else {
          continue; // No delay information
        }

        // Only treat positive delays as "late" (negative = early, clamp to 0)
        delaySeconds = Math.max(delaySeconds, 0);

        if (delaySeconds > 0) {
          tripHasDelay = true;
          tripTotalDelay += delaySeconds;
        }
      }

      if (tripHasDelay) {
        processedTripIds.add(tripId);
        tripsWithDelays++;
        totalDelaySeconds += tripTotalDelay;
      }
    }

    console.log(
      `📊 GTFS-RT analysis: ${tripsWithDelays} trips with delays, total ${totalDelaySeconds}s`
    );

    // If no delays found, return null (fallback to simulation)
    if (tripsWithDelays === 0 || totalDelaySeconds === 0) {
      console.log("ℹ️  No delays in GTFS-RT feed, falling back to simulation");
      return null;
    }

    // Calculate metrics
    const avg_delay_minutes = totalDelaySeconds / tripsWithDelays / 60;
    const riders_estimated = tripsWithDelays * 30; // Simple heuristic: 30 riders per trip

    const result: GtfsWorldStatus = {
      route_id: GTFS_RT_ROUTE_FILTER || "gtfs-route",
      segment_start_stop_id: GTFS_RT_SEGMENT_START_STOP_ID,
      segment_end_stop_id: GTFS_RT_SEGMENT_END_STOP_ID,
      avg_delay_minutes: Math.round(avg_delay_minutes * 10) / 10, // Round to 1 decimal
      trips_impacted: tripsWithDelays,
      riders_estimated,
      source: "gtfs_realtime",
    };

    console.log("✅ GTFS-RT world status:", result);
    return result;
  } catch (error: any) {
    // On any error, log warning and return null (safe fallback)
    console.warn("⚠️  GTFS-Realtime error, falling back to simulation:", error.message);
    return null;
  }
}

