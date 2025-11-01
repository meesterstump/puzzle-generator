import type { TownscaperLattice } from "./TownscaperLattice";

/**
 * Options accepted by {@link clusterTownscaperLattice} when grouping triangles
 * into Townscaper-style blocks.
 */
export interface TownscaperClusteringOptions {
  /** Base lattice containing triangles, edges, and adjacency metadata. */
  lattice: TownscaperLattice;
  /**
   * Probability (0..1) that an adjacent triangle will merge into the current
   * cluster when traversing the lattice.
   */
  mergeChance: number;
  /** Seeded pseudo-random number generator supplied by the runtime. */
  random: () => number;
}

/**
 * Summary describing a cluster of merged triangles.
 */
export interface TownscaperCluster {
  /** Unique identifier assigned to the cluster. */
  id: number;
  /** Indices of all triangles belonging to this cluster. */
  triangleIds: number[];
  /** Lattice edge indices touched by this cluster. */
  edgeIds: number[];
}

/**
 * Result returned by {@link clusterTownscaperLattice}.
 */
export interface TownscaperClusteringResult {
  /** Detailed entries for each generated cluster. */
  clusters: TownscaperCluster[];
  /** Map from triangle index to the owning cluster id (`-1` when unassigned). */
  triangleToCluster: number[];
  /** Map from lattice edge index to all clusters that reference the edge. */
  edgeToClusters: number[][];
}

const clamp01 = (value: number): number => {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
};

const shuffleInPlace = (values: number[], random: () => number): void => {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const temp = values[index];
    values[index] = values[swapIndex];
    values[swapIndex] = temp;
  }
};

/**
 * Merge adjacent lattice triangles into Townscaper-style clusters.
 */
export function clusterTownscaperLattice(
  options: TownscaperClusteringOptions,
): TownscaperClusteringResult {
  const { lattice, random } = options;
  const mergeChance = clamp01(options.mergeChance);

  const assignments = new Array<number>(lattice.triangles.length).fill(-1);
  const clusterMembers: number[][] = [];

  for (const triangle of lattice.triangles) {
    if (!triangle.insideBoundary) {
      continue;
    }
    if (assignments[triangle.id] !== -1) {
      continue;
    }

    const clusterId = clusterMembers.length;
    const stack: number[] = [triangle.id];
    assignments[triangle.id] = clusterId;
    const members: number[] = [];

    while (stack.length > 0) {
      const current = stack.pop() as number;
      members.push(current);

      const neighborIds = lattice.triangles[current].neighbors
        .filter((neighborId) => lattice.triangles[neighborId]?.insideBoundary);
      shuffleInPlace(neighborIds, random);

      for (const neighborId of neighborIds) {
        if (assignments[neighborId] !== -1) {
          continue;
        }
        if (random() <= mergeChance) {
          assignments[neighborId] = clusterId;
          stack.push(neighborId);
        }
      }
    }

    members.sort((a, b) => a - b);
    clusterMembers.push(members);
  }

  const clusters: TownscaperCluster[] = clusterMembers.map((triangleIds, clusterId) => ({
    id: clusterId,
    triangleIds,
    edgeIds: [],
  }));

  const edgeToClusters = lattice.edges.map(() => [] as number[]);

  lattice.edges.forEach((edge) => {
    const clusterSet = new Set<number>();
    for (const triangleId of edge.triangles) {
      const clusterId = assignments[triangleId];
      if (clusterId !== undefined && clusterId !== -1) {
        clusterSet.add(clusterId);
      }
    }
    const clusterList = Array.from(clusterSet).sort((a, b) => a - b);
    edgeToClusters[edge.id] = clusterList;
    for (const clusterId of clusterList) {
      const cluster = clusters[clusterId];
      if (cluster) {
        cluster.edgeIds.push(edge.id);
      }
    }
  });

  clusters.forEach((cluster) => {
    cluster.edgeIds.sort((a, b) => a - b);
  });

  return {
    clusters,
    triangleToCluster: assignments,
    edgeToClusters,
  };
}

export default clusterTownscaperLattice;
