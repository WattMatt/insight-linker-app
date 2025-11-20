interface Pin {
  id: string;
  pin_number: number;
  x_position: number;
  y_position: number;
  pin_type: 'snag' | 'observation';
  status: 'open' | 'in_progress' | 'finished' | 'closed' | 'resolved';
  priority?: string;
}

export interface PinCluster {
  id: string;
  pins: Pin[];
  x_position: number;
  y_position: number;
  isCluster: true;
}

export type ClusteredPin = Pin | PinCluster;

/**
 * Calculates the distance between two pins in percentage coordinates
 */
function getDistance(pin1: { x_position: number; y_position: number }, pin2: { x_position: number; y_position: number }): number {
  const dx = pin1.x_position - pin2.x_position;
  const dy = pin1.y_position - pin2.y_position;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Determines if a pin is a cluster
 */
export function isCluster(item: ClusteredPin): item is PinCluster {
  return 'isCluster' in item && item.isCluster === true;
}

/**
 * Clusters pins based on zoom level and distance threshold
 * @param pins - Array of pins to cluster
 * @param scale - Current zoom scale (0.5 to 3)
 * @param expandedClusterId - ID of cluster that should be expanded (if any)
 * @returns Array of pins and clusters
 */
export function clusterPins(
  pins: Pin[],
  scale: number,
  expandedClusterId: string | null = null
): ClusteredPin[] {
  // At high zoom levels (>1.5), don't cluster at all
  if (scale > 1.5) {
    return pins;
  }

  // Distance threshold increases as zoom decreases
  // At scale 1.5: threshold = 3%
  // At scale 1.0: threshold = 5%
  // At scale 0.5: threshold = 8%
  const baseThreshold = 3;
  const scaleFactor = (1.5 - scale) / 1.0; // 0 at scale 1.5, 1 at scale 0.5
  const distanceThreshold = baseThreshold + (scaleFactor * 5);

  const clustered: ClusteredPin[] = [];
  const processed = new Set<string>();

  for (let i = 0; i < pins.length; i++) {
    if (processed.has(pins[i].id)) continue;

    const nearbyPins: Pin[] = [pins[i]];
    processed.add(pins[i].id);

    // Find all pins within threshold distance
    for (let j = i + 1; j < pins.length; j++) {
      if (processed.has(pins[j].id)) continue;

      const distance = getDistance(pins[i], pins[j]);
      if (distance <= distanceThreshold) {
        nearbyPins.push(pins[j]);
        processed.add(pins[j].id);
      }
    }

    if (nearbyPins.length > 1) {
      // Create a cluster
      const clusterId = `cluster-${nearbyPins.map(p => p.id).join('-')}`;
      
      // If this cluster is expanded, return individual pins instead
      if (expandedClusterId === clusterId) {
        clustered.push(...nearbyPins);
      } else {
        // Calculate center position (average of all pins)
        const centerX = nearbyPins.reduce((sum, pin) => sum + pin.x_position, 0) / nearbyPins.length;
        const centerY = nearbyPins.reduce((sum, pin) => sum + pin.y_position, 0) / nearbyPins.length;

        clustered.push({
          id: clusterId,
          pins: nearbyPins,
          x_position: centerX,
          y_position: centerY,
          isCluster: true,
        });
      }
    } else {
      // Single pin, no clustering needed
      clustered.push(pins[i]);
    }
  }

  return clustered;
}

/**
 * Gets color for a cluster based on its pins' priorities and statuses
 */
export function getClusterColor(pins: Pin[]): string {
  const hasCritical = pins.some(p => p.priority === 'critical' && p.status !== 'resolved' && p.status !== 'closed');
  const hasOpen = pins.some(p => (p.status === 'open' || p.status === 'in_progress') && p.priority !== 'critical');
  const allResolved = pins.every(p => p.status === 'resolved' || p.status === 'closed' || p.status === 'finished');

  if (hasCritical) return '#dc2626'; // Red for critical
  if (allResolved) return '#9ca3af'; // Gray for all resolved
  if (hasOpen) return '#f59e0b'; // Amber for open items
  return '#3b82f6'; // Blue default
}
