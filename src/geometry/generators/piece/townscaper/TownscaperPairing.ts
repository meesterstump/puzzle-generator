import type { TownscaperLattice } from "./TownscaperLattice";

/**
 * Options supplied to {@link pairTownscaperTriangles}.
 */
export interface TownscaperPairingOptions {
  /** Base lattice containing triangles, edges, and adjacency metadata. */
  lattice: TownscaperLattice;
  /** Seeded pseudo-random number generator supplied by the runtime. */
  random: () => number;
}

/**
 * Describes a merged Townscaper block produced by pairing two triangles.
 */
export interface TownscaperPair {
  /** Unique identifier assigned to the pair. */
  id: number;
  /**
   * Triangles that belong to this pair. Most entries will contain two triangles,
   * but odd leftovers keep a single triangle to preserve coverage.
   */
  triangleIds: [number, number] | [number];
  /**
   * Lattice edge removed when the triangles merged. `null` when no partner was
   * available and the triangle remains single.
   */
  sharedEdgeId: number | null;
}

/**
 * Result returned by {@link pairTownscaperTriangles}.
 */
export interface TownscaperPairingResult {
  /** Detailed entries for each generated pair. */
  pairs: TownscaperPair[];
  /** Map from triangle index to the owning pair id (`-1` when unassigned). */
  triangleToPair: number[];
  /**
   * Lattice edges removed during pairing. Consumers can treat these edges as
   * interior seams that should not appear in the final topology.
   */
  removedEdgeIds: number[];
}

const shuffleInPlace = (values: number[], random: () => number): void => {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const temp = values[index];
    values[index] = values[swapIndex];
    values[swapIndex] = temp;
  }
};

const findSharedEdgeId = (
  candidateEdges: number[],
  neighborEdges: number[],
): number | null => {
  for (const edgeId of candidateEdges) {
    if (neighborEdges.includes(edgeId)) {
      return edgeId;
    }
  }
  return null;
};

/**
 * Randomly pair adjacent lattice triangles into Townscaper-style diamond blocks.
 */
export function pairTownscaperTriangles(
  options: TownscaperPairingOptions,
): TownscaperPairingResult {
  const { lattice, random } = options;

  const assignments = new Array<number>(lattice.triangles.length).fill(-1);

  const triangleEdges = lattice.triangles.map(() => [] as number[]);
  lattice.edges.forEach((edge) => {
    for (const triangleId of edge.triangles) {
      if (triangleEdges[triangleId]) {
        triangleEdges[triangleId].push(edge.id);
      }
    }
  });

  const eligible = lattice.triangles
    .filter((triangle) => triangle.insideBoundary)
    .map((triangle) => triangle.id);
  shuffleInPlace(eligible, random);

  const pairs: TownscaperPair[] = [];
  const removedEdgeIds: number[] = [];

  for (const triangleId of eligible) {
    if (assignments[triangleId] !== -1) {
      continue;
    }

    const neighborIds = lattice.triangles[triangleId]?.neighbors ?? [];
    const availableNeighbors = neighborIds.filter((neighborId) => (
      lattice.triangles[neighborId]?.insideBoundary
      && assignments[neighborId] === -1
    ));
    shuffleInPlace(availableNeighbors, random);

    const partnerId = availableNeighbors.length > 0 ? availableNeighbors[0] : null;
    const pairId = pairs.length;

    if (partnerId !== null) {
      const sharedEdgeId = findSharedEdgeId(
        triangleEdges[triangleId],
        triangleEdges[partnerId],
      );
      assignments[triangleId] = pairId;
      assignments[partnerId] = pairId;
      if (sharedEdgeId !== null) {
        removedEdgeIds.push(sharedEdgeId);
      }
      pairs.push({
        id: pairId,
        triangleIds: triangleId < partnerId
          ? [triangleId, partnerId]
          : [partnerId, triangleId],
        sharedEdgeId,
      });
    } else {
      assignments[triangleId] = pairId;
      pairs.push({
        id: pairId,
        triangleIds: [triangleId],
        sharedEdgeId: null,
      });
    }
  }

  removedEdgeIds.sort((a, b) => a - b);

  return {
    pairs,
    triangleToPair: assignments,
    removedEdgeIds,
  };
}

export default pairTownscaperTriangles;
