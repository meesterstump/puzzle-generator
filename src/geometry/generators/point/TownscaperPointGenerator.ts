import type { Vec2, PathCommand } from "../../types";
import type { PointGenerator, PointGenerationRuntimeOptions } from "./PointGenerator";
import type { GeneratorUIMetadata } from "../../ui_types";
import type { GeneratorConfig, GeneratorFactory } from "../Generator";
import { PointGeneratorRegistry } from "../Generator";
import { isPointInBoundary } from "../../utils";

/** Ratio between horizontal and vertical spacing for an equilateral triangle lattice. */
const TRIANGULAR_VERTICAL_RATIO = Math.sin(Math.PI / 3);

// Name of this generator, uniquely identifies it from all other PointGenerators
type TownscaperPointGeneratorName = "TownscaperPointGenerator";
export const Name: TownscaperPointGeneratorName = "TownscaperPointGenerator";

/** Required config for this generator */
export interface TownscaperPointGeneratorConfig extends GeneratorConfig {
  name: TownscaperPointGeneratorName;
  /** Probability percentage used when merging adjacent triangles into larger blocks */
  mergeProbability: number;
  /** Number of centroid relaxation passes applied after clustering */
  relaxationIterations: number;
  /** Strength percentage applied during each relaxation pass */
  relaxationStrength: number;
}

/** UI metadata needed for this generator */
export const TownscaperPointUIMetadata: GeneratorUIMetadata = {
  name: Name,
  displayName: "Townscaper",
  description: "Generate seed points using a triangular lattice inspired by Townscaper.",
  sortHint: 3,
  controls: [
    {
      type: 'range',
      name: 'mergeProbability',
      label: 'Merge Probability',
      min: 0,
      max: 100,
      step: 5,
      defaultValue: 35,
      helpText: 'Chance that neighboring triangles merge into Townscaper-style blocks.',
    },
    {
      type: 'range',
      name: 'relaxationIterations',
      label: 'Relaxation Iterations',
      min: 0,
      max: 5,
      step: 1,
      defaultValue: 2,
      helpText: 'Number of centroid smoothing passes applied to merged blocks.',
    },
    {
      type: 'range',
      name: 'relaxationStrength',
      label: 'Relaxation Strength',
      min: 0,
      max: 100,
      step: 5,
      defaultValue: 50,
      helpText: 'How far each pass pulls a block center toward its neighbors.',
    },
  ],
};

/**
 * Generate a triangular lattice clipped to the puzzle boundary.
 */
export const TownscaperPointGeneratorFactory: GeneratorFactory<PointGenerator> = (
  _border: PathCommand[],
  _bounds: { width: number; height: number },
  config: TownscaperPointGeneratorConfig,
) => {
  const {
    mergeProbability = 35,
    relaxationIterations = 2,
    relaxationStrength = 50,
  } = config;

  interface LatticePoint {
    row: number;
    column: number;
    position: Vec2;
  }

  const clampPercentage = (value: number): number => Math.min(100, Math.max(0, value));

  const resolveSpacing = (pieceSize: number): { horizontal: number; vertical: number } => {
    const baseSpacing = Math.max(pieceSize, 4);
    const verticalSpacing = baseSpacing * TRIANGULAR_VERTICAL_RATIO;
    return {
      horizontal: baseSpacing,
      vertical: verticalSpacing,
    };
  };

  const generateLattice = (
    runtimeOpts: PointGenerationRuntimeOptions,
  ): {
    points: LatticePoint[];
    indexByCoord: Map<string, number>;
    rowLimit: number;
    columnLimit: number;
  } => {
    const { width, height, pieceSize, border } = runtimeOpts;
    const { horizontal, vertical } = resolveSpacing(pieceSize);
    const overscanX = horizontal;
    const overscanY = vertical;
    const startX = -overscanX;
    const startY = -overscanY;
    const columns = Math.ceil((width + overscanX * 2) / horizontal);
    const rows = Math.ceil((height + overscanY * 2) / vertical);

    const points: LatticePoint[] = [];
    const indexByCoord = new Map<string, number>();
    for (let rowIndex = 0; rowIndex <= rows; rowIndex += 1) {
      const y = startY + rowIndex * vertical;
      const offsetX = (rowIndex % 2 === 0 ? 0 : horizontal / 2);
      for (let columnIndex = 0; columnIndex <= columns; columnIndex += 1) {
        const x = startX + columnIndex * horizontal;
        const candidate: Vec2 = [x + offsetX, y];
        if (isPointInBoundary(candidate, border)) {
          const latticePoint: LatticePoint = {
            row: rowIndex,
            column: columnIndex,
            position: candidate,
          };
          indexByCoord.set(`${rowIndex}:${columnIndex}`, points.length);
          points.push(latticePoint);
        }
      }
    }

    return {
      points,
      indexByCoord,
      rowLimit: rows,
      columnLimit: columns,
    };
  };

  const shuffleInPlace = (values: number[], random: () => number): void => {
    for (let index = values.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      const temp = values[index];
      values[index] = values[swapIndex];
      values[swapIndex] = temp;
    }
  };

  const createEdgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

  interface TriangleCell {
    vertices: [number, number, number];
    centroid: Vec2;
  }

  const buildTriangleCells = (
    latticePoints: LatticePoint[],
    indexByCoord: Map<string, number>,
    rowLimit: number,
    columnLimit: number,
    border: PathCommand[],
  ): { triangles: TriangleCell[]; adjacency: number[][] } => {
    const triangles: TriangleCell[] = [];
    const adjacencySets: Set<number>[] = [];
    const edgeToTriangle = new Map<string, number>();

    const tryAddTriangle = (
      aCoord: [number, number],
      bCoord: [number, number],
      cCoord: [number, number],
    ): void => {
      const aIndex = indexByCoord.get(`${aCoord[0]}:${aCoord[1]}`);
      const bIndex = indexByCoord.get(`${bCoord[0]}:${bCoord[1]}`);
      const cIndex = indexByCoord.get(`${cCoord[0]}:${cCoord[1]}`);
      if (aIndex === undefined || bIndex === undefined || cIndex === undefined) {
        return;
      }

      const centroid: Vec2 = [
        (latticePoints[aIndex].position[0]
          + latticePoints[bIndex].position[0]
          + latticePoints[cIndex].position[0]) / 3,
        (latticePoints[aIndex].position[1]
          + latticePoints[bIndex].position[1]
          + latticePoints[cIndex].position[1]) / 3,
      ];

      if (!isPointInBoundary(centroid, border)) {
        return;
      }

      const triangleIndex = triangles.length;
      triangles.push({
        vertices: [aIndex, bIndex, cIndex],
        centroid,
      });
      adjacencySets.push(new Set<number>());

      const edges: [number, number][] = [
        [aIndex, bIndex],
        [bIndex, cIndex],
        [cIndex, aIndex],
      ];
      for (const [start, end] of edges) {
        const edgeKey = createEdgeKey(start, end);
        const neighborIndex = edgeToTriangle.get(edgeKey);
        if (neighborIndex !== undefined) {
          adjacencySets[triangleIndex].add(neighborIndex);
          adjacencySets[neighborIndex].add(triangleIndex);
        } else {
          edgeToTriangle.set(edgeKey, triangleIndex);
        }
      }
    };

    for (let row = 0; row < rowLimit; row += 1) {
      const isEvenRow = row % 2 === 0;
      for (let column = 0; column < columnLimit; column += 1) {
        if (isEvenRow) {
          tryAddTriangle([row, column], [row, column + 1], [row + 1, column]);
          tryAddTriangle([row, column + 1], [row + 1, column + 1], [row + 1, column]);
        } else {
          tryAddTriangle([row, column], [row + 1, column + 1], [row + 1, column]);
          tryAddTriangle([row, column], [row, column + 1], [row + 1, column + 1]);
        }
      }
    }

    const adjacency = adjacencySets.map((neighbors) => Array.from(neighbors));
    return { triangles, adjacency };
  };

  const clusterTriangles = (
    triangles: TriangleCell[],
    adjacency: number[][],
    mergeChance: number,
    random: () => number,
  ): { clusters: number[][]; assignments: number[] } => {
    const assignments = new Array<number>(triangles.length).fill(-1);
    const clusters: number[][] = [];

    for (let startIndex = 0; startIndex < triangles.length; startIndex += 1) {
      if (assignments[startIndex] !== -1) {
        continue;
      }

      const clusterId = clusters.length;
      const queue: number[] = [startIndex];
      assignments[startIndex] = clusterId;
      const members: number[] = [];

      while (queue.length > 0) {
        const currentIndex = queue.pop() as number;
        members.push(currentIndex);

        const neighborIndices = adjacency[currentIndex];
        shuffleInPlace(neighborIndices, random);
        for (const neighborIndex of neighborIndices) {
          if (assignments[neighborIndex] !== -1) {
            continue;
          }
          if (random() < mergeChance) {
            assignments[neighborIndex] = clusterId;
            queue.push(neighborIndex);
          }
        }
      }

      clusters.push(members);
    }

    return { clusters, assignments };
  };

  const computeClusterCentroids = (
    clusters: number[][],
    triangles: TriangleCell[],
    border: PathCommand[],
  ): Vec2[] => clusters.map((triangleIndices) => {
    if (triangleIndices.length === 0) {
      return [0, 0];
    }

    let sumX = 0;
    let sumY = 0;
    for (const triangleIndex of triangleIndices) {
      const centroid = triangles[triangleIndex].centroid;
      sumX += centroid[0];
      sumY += centroid[1];
    }

    const centroid: Vec2 = [sumX / triangleIndices.length, sumY / triangleIndices.length];
    if (Number.isFinite(centroid[0]) && Number.isFinite(centroid[1]) && isPointInBoundary(centroid, border)) {
      return centroid;
    }

    const fallback = triangles[triangleIndices[0]].centroid;
    return fallback;
  });

  const computeClusterAdjacency = (
    triangleAdjacency: number[][],
    assignments: number[],
  ): Map<number, Set<number>> => {
    const adjacency = new Map<number, Set<number>>();

    const ensureEntry = (clusterId: number): Set<number> => {
      const existing = adjacency.get(clusterId);
      if (existing) {
        return existing;
      }
      const created = new Set<number>();
      adjacency.set(clusterId, created);
      return created;
    };

    const connect = (a: number, b: number): void => {
      if (a === b || a === -1 || b === -1) {
        return;
      }
      ensureEntry(a).add(b);
      ensureEntry(b).add(a);
    };

    triangleAdjacency.forEach((neighbors, triangleIndex) => {
      const clusterA = assignments[triangleIndex];
      for (const neighborTriangle of neighbors) {
        const clusterB = assignments[neighborTriangle];
        connect(clusterA, clusterB);
      }
    });

    return adjacency;
  };

  const applyRelaxation = (
    centroids: Vec2[],
    adjacency: Map<number, Set<number>>,
    border: PathCommand[],
    iterations: number,
    strength: number,
  ): Vec2[] => {
    if (iterations <= 0 || strength <= 0) {
      return centroids;
    }

    let working = centroids.slice();
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const next: Vec2[] = working.map((point, clusterId) => {
        const neighbors = adjacency.get(clusterId);
        if (!neighbors || neighbors.size === 0) {
          return point;
        }

        let sumX = 0;
        let sumY = 0;
        let neighborCount = 0;
        neighbors.forEach((neighborId) => {
          const neighborPoint = working[neighborId];
          if (neighborPoint) {
            sumX += neighborPoint[0];
            sumY += neighborPoint[1];
            neighborCount += 1;
          }
        });

        if (neighborCount === 0) {
          return point;
        }

        const average: Vec2 = [sumX / neighborCount, sumY / neighborCount];
        const candidate: Vec2 = [
          point[0] + (average[0] - point[0]) * strength,
          point[1] + (average[1] - point[1]) * strength,
        ];

        if (isPointInBoundary(candidate, border)) {
          return candidate;
        }

        return point;
      });

      working = next;
    }

    return working;
  };

  const TownscaperPointGenerator: PointGenerator = {
    generatePoints(runtimeOpts: PointGenerationRuntimeOptions): Vec2[] {
      const { points, indexByCoord, rowLimit, columnLimit } = generateLattice(runtimeOpts);
      if (points.length === 0) {
        return [];
      }

      const { triangles, adjacency } = buildTriangleCells(
        points,
        indexByCoord,
        rowLimit,
        columnLimit,
        runtimeOpts.border,
      );

      if (triangles.length === 0) {
        return points.map((entry) => entry.position);
      }

      const mergeChance = clampPercentage(mergeProbability) / 100;
      const relaxationPasses = Math.max(0, Math.round(relaxationIterations));
      const relaxationWeight = clampPercentage(relaxationStrength) / 100;

      const { clusters, assignments } = clusterTriangles(
        triangles,
        adjacency,
        mergeChance,
        runtimeOpts.random,
      );

      const centroids = computeClusterCentroids(clusters, triangles, runtimeOpts.border);
      const clusterAdjacency = computeClusterAdjacency(adjacency, assignments);
      const relaxed = applyRelaxation(
        centroids,
        clusterAdjacency,
        runtimeOpts.border,
        relaxationPasses,
        relaxationWeight,
      );

      return relaxed;
    },
  };

  return TownscaperPointGenerator;
};
export default TownscaperPointGeneratorFactory;

// register the generator
PointGeneratorRegistry.register(Name, TownscaperPointGeneratorFactory, TownscaperPointUIMetadata);
