export type IncidentStatus = "open" | "monitoring" | "resolved";
export type Incident = {
    id: string;
    status: IncidentStatus;
    severity: "minor" | "major";
    type: "corridor_blockage";
    route_ids: string[];
    segment_start_stop_id: string;
    segment_end_stop_id: string;
    start_time: string;
    avg_delay_minutes: number;
    trips_impacted: number;
    riders_estimated: number;
};
export type ActionCategory = "alert_only" | "detour" | "shuttle";
export type PlannedAction = {
    id?: string;
    incident_id?: string;
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
//# sourceMappingURL=models.d.ts.map