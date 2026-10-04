/**
 * Smart routing: rank nearby phones so messages go to the best relay candidates
 * instead of being broadcast to everyone.
 */
export interface RelayCandidate {
  deviceId: string;
  hasInternet: boolean;
  rssi: number; // typically -100 to -30
  distanceMeters: number;
  batteryLevel: number; // 0 to 100
  previousSuccessRate: number; // 0.0 to 1.0
  destinationProximityMeters?: number;
}

export class RelayScorer {
  /**
   * Calculate Smart Routing Score
   * Parameters:
   * 1. Internet availability (50 points maximum)
   * 2. BLE RSSI signal strength (-100 dBm to -30 dBm) (15 points maximum)
   * 3. Battery level 0-100% (10 points maximum)
   * 4. Previous delivery success rate 0.0 - 1.0 (15 points maximum)
   * 5. Destination proximity (10 points maximum)
   */
  static calculateRelayScore(candidate: RelayCandidate): number {
    let score = 0;

    // 1. Internet availability (Max 50)
    if (candidate.hasInternet) {
      score += 50;
    }

    // 2. BLE RSSI (Max 15)
    // Normalize -100 to -30 -> 0 to 1
    let normalizedRssi = (candidate.rssi - (-100)) / (-30 - (-100));
    normalizedRssi = Math.max(0, Math.min(1, normalizedRssi));
    score += normalizedRssi * 15;

    // 3. Battery Level (Max 10)
    let batteryFactor = candidate.batteryLevel / 100;
    batteryFactor = Math.max(0, Math.min(1, batteryFactor));
    score += batteryFactor * 10;

    // 4. Previous Success Rate (Max 15)
    let successRate = Math.max(0, Math.min(1, candidate.previousSuccessRate));
    score += successRate * 15;

    // 5. Destination Proximity (Max 10)
    if (candidate.destinationProximityMeters !== undefined) {
      // Assuming a threshold of 10km for max penalty, 0m for max points
      const maxDistance = 10000;
      let proximityFactor = 1 - (candidate.destinationProximityMeters / maxDistance);
      proximityFactor = Math.max(0, Math.min(1, proximityFactor));
      score += proximityFactor * 10;
    } else {
      // Default intermediate score if proximity is unknown
      score += 5;
    }

    return score;
  }

  static rankRelayCandidates(candidates: RelayCandidate[]): RelayCandidate[] {
    return [...candidates].sort((a, b) => {
      const scoreA = this.calculateRelayScore(a);
      const scoreB = this.calculateRelayScore(b);
      return scoreB - scoreA;
    });
  }

  static selectBestRelay(candidates: RelayCandidate[]): RelayCandidate | null {
    if (!candidates || candidates.length === 0) {
      return null;
    }
    const ranked = this.rankRelayCandidates(candidates);
    return ranked[0];
  }
}
