// src/lib/models.ts
// Shared types for the PulseOps backend

export type IncidentStatus = "open" | "monitoring" | "resolved";

export type Incident = {
  id: string;
  status: IncidentStatus;
  severity: "minor" | "moderate" | "major";
  type: "corridor_blockage";
  route_ids: string[];
  segment_start_stop_id: string;
  segment_end_stop_id: string;
  start_time: string;
  avg_delay_minutes: number;
  trips_impacted: number;
  riders_estimated: number;
  data_source?: "gtfs_realtime" | "simulated" | "auto_mbta_realtime";
};

export type ActionCategory = "alert_only" | "detour" | "shuttle";

export type PlannedAction = {
  id?: string; // optional ID for tracking
  incident_id?: string; // link back to incident
  category: ActionCategory;
  summary: string;
  rider_alert_header: string;
  rider_alert_body: string;
  ops_script: string;
  social_post: string;
  created_at?: string;
};

export type PlanResult = {
  actions: PlannedAction[];
  reasoning: string;
};

