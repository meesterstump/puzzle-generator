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
  /** Relative spacing multiplier applied to runtime piece size when building lattice */
  latticeSpacing: number;
  /** Amount of random jitter (0 to 100) */
  jitter: number;
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
      name: 'latticeSpacing',
      label: 'Lattice Spacing',
      min: 50,
      max: 150,
      step: 5,
      defaultValue: 80,
      helpText: 'Spacing between lattice rows as a percentage of the typical piece size.',
    },
    {
      type: 'range',
      name: 'jitter',
      label: 'Point Jitter',
      min: 0,
      max: 100,
      step: 5,
      defaultValue: 10,
      helpText: 'Random offset applied to each lattice point to avoid a too-perfect pattern.',
    },
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
    latticeSpacing = 80,
    jitter = 10,
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

  const EVEN_ROW_NEIGHBORS: [number, number][] = [
    [0, -1],
    [0, 1],
    [-1, -1],
    [-1, 0],
    [1, -1],
    [1, 0],
  ];

  const ODD_ROW_NEIGHBORS: [number, number][] = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [-1, 1],
    [1, 0],
    [1, 1],
  ];

  const resolveSpacing = (pieceSize: number): { horizontal: number; vertical: number } => {
    const baseSpacing = Math.max(pieceSize * (latticeSpacing / 100), 4);
    const verticalSpacing = baseSpacing * TRIANGULAR_VERTICAL_RATIO;
    return {
      horizontal: baseSpacing,
      vertical: verticalSpacing,
    };
  };

  const applyJitter = (point: Vec2, horizontalSpacing: number, verticalSpacing: number, random: () => number): Vec2 => {
    if (jitter <= 0) {
      return point;
    }
    const jitterFactor = jitter / 100;
    const dx = (random() - 0.5) * jitterFactor * horizontalSpacing;
    const dy = (random() - 0.5) * jitterFactor * verticalSpacing;
    return [point[0] + dx, point[1] + dy];
  };

  const generateLattice = (
    runtimeOpts: PointGenerationRuntimeOptions,
  ): { points: LatticePoint[]; indexByCoord: Map<string, number> } => {
    const { width, height, pieceSize, random, border } = runtimeOpts;
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
        const jittered = applyJitter(candidate, horizontal, vertical, random);
        if (isPointInBoundary(jittered, border)) {
          const latticePoint: LatticePoint = {
            row: rowIndex,
            column: columnIndex,
            position: jittered,
          };
          indexByCoord.set(`${rowIndex}:${columnIndex}`, points.length);
          points.push(latticePoint);
        }
      }
    }

    return { points, indexByCoord };
  };

  const getNeighborOffsets = (row: number): [number, number][] => (
    row % 2 === 0 ? EVEN_ROW_NEIGHBORS : ODD_ROW_NEIGHBORS
  );

  const getNeighborIndices = (
    point: LatticePoint,
    indexByCoord: Map<string, number>,
  ): number[] => {
    const indices: number[] = [];
    const offsets = getNeighborOffsets(point.row);
    for (const [dRow, dColumn] of offsets) {
      const neighborRow = point.row + dRow;
      const neighborColumn = point.column + dColumn;
      const neighborIndex = indexByCoord.get(`${neighborRow}:${neighborColumn}`);
      if (neighborIndex !== undefined) {
        indices.push(neighborIndex);
      }
    }
    return indices;
  };

  const shuffleInPlace = (values: number[], random: () => number): void => {
    for (let index = values.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      const temp = values[index];
      values[index] = values[swapIndex];
      values[swapIndex] = temp;
    }
  };

  const clusterLatticePoints = (
    latticePoints: LatticePoint[],
    indexByCoord: Map<string, number>,
    mergeChance: number,
    random: () => number,
  ): { clusters: number[][]; assignments: number[] } => {
    const assignments = new Array<number>(latticePoints.length).fill(-1);
    const clusters: number[][] = [];

    for (let startIndex = 0; startIndex < latticePoints.length; startIndex += 1) {
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

        const neighborIndices = getNeighborIndices(latticePoints[currentIndex], indexByCoord);
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

  const computeCentroids = (
    clusters: number[][],
    latticePoints: LatticePoint[],
    border: PathCommand[],
  ): Vec2[] => clusters.map((memberIndices) => {
    let sumX = 0;
    let sumY = 0;
    for (const index of memberIndices) {
      const point = latticePoints[index].position;
      sumX += point[0];
      sumY += point[1];
    }
    const centroid: Vec2 = [sumX / memberIndices.length, sumY / memberIndices.length];
    if (Number.isFinite(centroid[0]) && Number.isFinite(centroid[1]) && isPointInBoundary(centroid, border)) {
      return centroid;
    }
    const fallbackPoint = latticePoints[memberIndices[0]].position;
    return fallbackPoint;
  });

  const computeClusterAdjacency = (
    latticePoints: LatticePoint[],
    indexByCoord: Map<string, number>,
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

    latticePoints.forEach((point, index) => {
      const neighborIndices = getNeighborIndices(point, indexByCoord);
      const clusterA = assignments[index];
      for (const neighborIndex of neighborIndices) {
        const clusterB = assignments[neighborIndex];
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
      const { points, indexByCoord } = generateLattice(runtimeOpts);
      if (points.length === 0) {
        return [];
      }

      const mergeChance = clampPercentage(mergeProbability) / 100;
      const relaxationPasses = Math.max(0, Math.round(relaxationIterations));
      const relaxationWeight = clampPercentage(relaxationStrength) / 100;

      const { clusters, assignments } = clusterLatticePoints(
        points,
        indexByCoord,
        mergeChance,
        runtimeOpts.random,
      );

      const centroids = computeCentroids(clusters, points, runtimeOpts.border);
      const adjacency = computeClusterAdjacency(points, indexByCoord, assignments);
      const relaxed = applyRelaxation(
        centroids,
        adjacency,
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
