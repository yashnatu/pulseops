import { Incident, PlannedAction } from "./models";
declare class InMemoryStore {
    private incidents;
    private actions;
    getAllIncidents(): Incident[];
    getIncident(id: string): Incident | undefined;
    createIncident(incident: Incident): Incident;
    updateIncident(id: string, updates: Partial<Incident>): Incident | undefined;
    getActionsForIncident(incidentId: string): PlannedAction[];
    addActionsForIncident(incidentId: string, actions: PlannedAction[]): void;
    getAllActions(): PlannedAction[];
}
export declare const store: InMemoryStore;
export {};
//# sourceMappingURL=store.d.ts.map