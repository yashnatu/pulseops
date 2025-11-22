// src/lib/simulation.ts
// Simple what-if impact simulation helpers

export type SimulationInput = {
  delay_minutes: number;
  riders_estimated: number;
  duration_minutes: number;
};

export type SimulationResult = {
  rider_delay_minutes: number;
  qualitative_impact: string;
};

export function simulateImpact(input: SimulationInput): SimulationResult {
  const rider_delay_minutes = input.delay_minutes * input.riders_estimated;

  let qualitative_impact = "low";
  if (rider_delay_minutes > 20000) qualitative_impact = "high";
  else if (rider_delay_minutes > 5000) qualitative_impact = "moderate";

  return {
    rider_delay_minutes,
    qualitative_impact,
  };
}


