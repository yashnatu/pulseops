// src/lib/health.ts
// Health metrics computation for corridor monitoring

import type { TimedWorldStatus } from "./world";

export type HealthMetrics = {
  health_score: number; // 0–100
  avg_delay_15m: number; // minutes
  delay_volatility: number; // standard deviation of avg_delay_minutes
  risk_level: "low" | "medium" | "high";
  near_miss_count_30m: number;

  // New stakeholder KPIs
  avg_delay_30m: number; // minutes, last 30m
  total_rider_delay_minutes_30m: number; // sum over 30m of (avg_delay_minutes * riders_estimated)
  percent_time_minor: number; // 0–100, delay 0–2 min
  percent_time_moderate: number; // 0–100, delay 2–5 min
  percent_time_severe: number; // 0–100, delay > 5 min
};

/**
 * Compute health metrics from world status history
 */
export function computeHealthMetrics(history: TimedWorldStatus[]): HealthMetrics {
  // Default metrics for empty history
  if (history.length === 0) {
    return {
      health_score: 100,
      avg_delay_15m: 0,
      delay_volatility: 0,
      risk_level: "low",
      near_miss_count_30m: 0,
      avg_delay_30m: 0,
      total_rider_delay_minutes_30m: 0,
      percent_time_minor: 100,
      percent_time_moderate: 0,
      percent_time_severe: 0,
    };
  }

  const now = Date.now();
  const last30m = history.filter((h) => now - h.timestamp <= 30 * 60 * 1000);
  const last15m = history.filter((h) => now - h.timestamp <= 15 * 60 * 1000);

  // Compute average delay over last 15 minutes
  const avg_delay_15m =
    last15m.length > 0
      ? last15m.reduce((sum, h) => sum + h.avg_delay_minutes, 0) / last15m.length
      : 0;

  // Compute delay volatility (standard deviation) over last 30 minutes
  const delays = last30m.map((h) => h.avg_delay_minutes);
  const mean = delays.length > 0 ? delays.reduce((sum, d) => sum + d, 0) / delays.length : 0;
  const variance =
    delays.length > 0
      ? delays.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / delays.length
      : 0;
  const delay_volatility = Math.sqrt(variance);

  // Count "near misses" (delays above concern threshold but below incident threshold)
  const concernThreshold = 3; // minutes
  const incidentThreshold = 10; // minutes
  const near_miss_count_30m = last30m.filter(
    (h) =>
      h.avg_delay_minutes >= concernThreshold && h.avg_delay_minutes < incidentThreshold
  ).length;

  // Compute health score (100 = perfect, 0 = worst)
  const delayPenalty = Math.min(avg_delay_15m * 5, 50); // 5 points per minute up to 50
  const volatilityPenalty = Math.min(delay_volatility * 3, 30); // 3 per sd up to 30
  const nearMissPenalty = Math.min(near_miss_count_30m * 2, 20); // 2 per near miss up to 20

  let health_score = 100 - delayPenalty - volatilityPenalty - nearMissPenalty;
  if (health_score < 0) health_score = 0;
  if (health_score > 100) health_score = 100;

  // Derive risk level from health score and recent delay
  let risk_level: "low" | "medium" | "high" = "low";
  if (health_score < 70 || avg_delay_15m >= 5) {
    risk_level = "medium";
  }
  if (health_score < 50 || avg_delay_15m >= 10) {
    risk_level = "high";
  }

  // Compute new stakeholder KPIs for last 30 minutes
  let avg_delay_30m = 0;
  let total_rider_delay_minutes_30m = 0;
  let minorCount = 0;
  let moderateCount = 0;
  let severeCount = 0;

  if (last30m.length > 0) {
    const totalDelay = last30m.reduce(
      (sum, h) => sum + (h.avg_delay_minutes || 0),
      0
    );
    avg_delay_30m = totalDelay / last30m.length;

    // Approximate rider-delay-minutes: delay (min) * riders_estimated per snapshot
    total_rider_delay_minutes_30m = last30m.reduce((sum, h) => {
      const delay = Math.max(h.avg_delay_minutes || 0, 0);
      const riders = Math.max(h.riders_estimated || 0, 0);
      return sum + delay * riders;
    }, 0);

    for (const h of last30m) {
      const d = h.avg_delay_minutes || 0;
      if (d <= 2) minorCount++;
      else if (d <= 5) moderateCount++;
      else severeCount++;
    }
  }

  const totalCount = last30m.length || 1;
  const percent_time_minor = (minorCount / totalCount) * 100;
  const percent_time_moderate = (moderateCount / totalCount) * 100;
  const percent_time_severe = (severeCount / totalCount) * 100;

  return {
    health_score: Math.round(health_score),
    avg_delay_15m: Math.round(avg_delay_15m * 10) / 10,
    delay_volatility: Math.round(delay_volatility * 10) / 10,
    risk_level,
    near_miss_count_30m,
    avg_delay_30m: Math.round(avg_delay_30m * 10) / 10,
    total_rider_delay_minutes_30m: Math.round(total_rider_delay_minutes_30m),
    percent_time_minor: Math.round(percent_time_minor * 10) / 10,
    percent_time_moderate: Math.round(percent_time_moderate * 10) / 10,
    percent_time_severe: Math.round(percent_time_severe * 10) / 10,
  };
}

