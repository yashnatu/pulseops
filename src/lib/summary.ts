// src/lib/summary.ts
// Daily summary helpers for PulseOps

import type { TimedWorldStatus } from "./world";

export type DaySummary = {
  total_incidents: number;
  avg_delay: number;
  max_delay: number;
  total_rider_delay_minutes: number;
};

export function summarizeDay(history: TimedWorldStatus[]): DaySummary {
  if (!history.length) {
    return {
      total_incidents: 0,
      avg_delay: 0,
      max_delay: 0,
      total_rider_delay_minutes: 0,
    };
  }

  const delays = history.map((h) => h.avg_delay_minutes || 0);
  const avg_delay = delays.reduce((a, b) => a + b, 0) / delays.length;
  const max_delay = Math.max(...delays);

  const total_rider_delay_minutes = history.reduce((sum, h) => {
    const delay = Math.max(h.avg_delay_minutes || 0, 0);
    const riders = Math.max(h.riders_estimated || 0, 0);
    return sum + delay * riders;
  }, 0);

  const total_incidents = delays.filter((d) => d >= 5).length;

  return {
    total_incidents,
    avg_delay,
    max_delay,
    total_rider_delay_minutes,
  };
}


