// src/lib/risk.ts
// Simple risk assessment / prediction utilities for the next ~15 minutes

import type { TimedWorldStatus } from "./world";

export type RiskAssessment = {
  route_id: string;
  segment_start_stop_id: string;
  segment_end_stop_id: string;

  current_delay_minutes: number;
  predicted_delay_15m: number;

  current_headway_variance_secs: number | null;
  predicted_risk_score: number; // 0–100

  risk_factors: string[];
};

/**
 * Compute a simple risk estimate for the next ~15 minutes based on:
 * - recent delay trend
 * - current riders_estimated
 * - volatility
 */
export function computeRiskForRoute(
  history: TimedWorldStatus[],
): RiskAssessment | null {
  if (!history.length) return null;

  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
  const latest = sorted[sorted.length - 1];

  const last15mCutoff = Date.now() - 15 * 60 * 1000;
  const last15m = sorted.filter((h) => h.timestamp >= last15mCutoff);

  if (!last15m.length) {
    return {
      route_id: latest.route_id,
      segment_start_stop_id: latest.segment_start_stop_id,
      segment_end_stop_id: latest.segment_end_stop_id,
      current_delay_minutes: latest.avg_delay_minutes || 0,
      predicted_delay_15m: latest.avg_delay_minutes || 0,
      current_headway_variance_secs: null,
      predicted_risk_score: 0,
      risk_factors: ["no_recent_history"],
    };
  }

  const delays = last15m.map((h) => h.avg_delay_minutes || 0);
  const riders = last15m.map((h) => h.riders_estimated || 0);

  const currentDelay = delays[delays.length - 1];
  const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;

  const avgRiders =
    riders.length > 0 ? riders.reduce((a, b) => a + b, 0) / riders.length : 0;

  const third = Math.max(Math.floor(delays.length / 3), 1);
  const earlyAvg =
    delays.slice(0, third).reduce((a, b) => a + b, 0) / Math.max(third, 1);
  const lateAvg =
    delays.slice(-third).reduce((a, b) => a + b, 0) / Math.max(third, 1);
  const trend = lateAvg - earlyAvg;

  let predictedDelay15m = currentDelay + trend;
  if (!Number.isFinite(predictedDelay15m)) {
    predictedDelay15m = currentDelay;
  }

  const riskFactors: string[] = [];
  let risk = 0;

  if (currentDelay >= 5) {
    risk += 30;
    riskFactors.push("current_delay_high");
  } else if (currentDelay >= 3) {
    risk += 15;
    riskFactors.push("current_delay_moderate");
  }

  if (trend > 0.5) {
    risk += 25;
    riskFactors.push("delay_trend_worsening");
  } else if (trend < -0.5) {
    risk -= 10;
    riskFactors.push("delay_trend_improving");
  }

  if (avgRiders >= 1500) {
    risk += 25;
    riskFactors.push("high_ridership");
  } else if (avgRiders >= 700) {
    risk += 10;
    riskFactors.push("medium_ridership");
  }

  const predicted_risk_score = Math.max(0, Math.min(100, risk));

  return {
    route_id: latest.route_id,
    segment_start_stop_id: latest.segment_start_stop_id,
    segment_end_stop_id: latest.segment_end_stop_id,
    current_delay_minutes: currentDelay,
    predicted_delay_15m: predictedDelay15m,
    current_headway_variance_secs: null,
    predicted_risk_score,
    risk_factors: riskFactors,
  };
}


