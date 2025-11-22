import { Incident, PlanResult } from "../lib/models";
/**
 * planIncident
 *
 * Call this from your backend when a new incident is detected.
 * It runs the Claude Agent SDK with our tools and returns planned actions.
 */
export declare function planIncident(incident: Incident): Promise<PlanResult>;
//# sourceMappingURL=pulseOpsAgent.d.ts.map