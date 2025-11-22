// src/lib/store.ts
// Simple in-memory store for incidents and actions

import { Incident, PlannedAction } from "./models";

class InMemoryStore {
  private incidents: Map<string, Incident> = new Map();
  private actions: Map<string, PlannedAction[]> = new Map();

  // --- Incidents ---

  getAllIncidents(): Incident[] {
    return Array.from(this.incidents.values());
  }

  getIncident(id: string): Incident | undefined {
    return this.incidents.get(id);
  }

  createIncident(incident: Incident): Incident {
    this.incidents.set(incident.id, incident);
    return incident;
  }

  updateIncident(id: string, updates: Partial<Incident>): Incident | undefined {
    const existing = this.incidents.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.incidents.set(id, updated);
    return updated;
  }

  // --- Actions ---

  getActionsForIncident(incidentId: string): PlannedAction[] {
    return this.actions.get(incidentId) || [];
  }

  addActionsForIncident(incidentId: string, actions: PlannedAction[]): void {
    const existing = this.actions.get(incidentId) || [];
    const withMetadata = actions.map((action, idx) => ({
      ...action,
      id: `${incidentId}-action-${existing.length + idx}`,
      incident_id: incidentId,
      created_at: new Date().toISOString(),
    }));
    this.actions.set(incidentId, [...existing, ...withMetadata]);
  }

  getAllActions(): PlannedAction[] {
    const allActions: PlannedAction[] = [];
    for (const actions of this.actions.values()) {
      allActions.push(...actions);
    }
    return allActions;
  }
}

// Export a singleton instance
export const store = new InMemoryStore();

