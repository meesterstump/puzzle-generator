import type { PathCommand, Vec2 } from "../../../types";
import { isPointInBoundary } from "../../../utils";

/** Ratio between horizontal and vertical spacing for an equilateral triangle lattice. */
const TRIANGULAR_VERTICAL_RATIO = Math.sin(Math.PI / 3);

/**
 * Configuration used when building the Townscaper lattice.
 */
export interface TownscaperLatticeOptions {
  /** Width of the area to cover with the lattice. */
  width: number;
  /** Height of the area to cover with the lattice. */
  height: number;
  /** Nominal puzzle piece size from runtime configuration. */
  pieceSize: number;
  /** Puzzle border used to filter lattice points. */
  border: PathCommand[];
  /**
   * Seeded random number generator supplied by the runtime.
   *
   * The initial lattice construction does not use randomness but accepts the
   * generator so later phases can reuse the same options object.
   */
  random: () => number;
}

/**
 * Vertex entry representing a lattice point with bookkeeping metadata.
 */
export interface TownscaperLatticeVertex {
  /** Unique index of the vertex within the lattice. */
  id: number;
  /** Row index in the triangular lattice. */
  row: number;
  /** Column index in the triangular lattice. */
  column: number;
  /** Final world-space position. */
  position: Vec2;
  /** Indicates whether the vertex lies inside the puzzle border. */
  insideBoundary: boolean;
}

/**
 * Edge entry describing the connection between two lattice vertices.
 */
export interface TownscaperLatticeEdge {
  /** Unique index of the edge within the lattice. */
  id: number;
  /** Vertex indices for the edge, stored in traversal order. */
  vertices: [number, number];
  /** Triangle indices that reference this edge (one or two entries). */
  triangles: number[];
  /** True when the edge lies on or beyond the puzzle border. */
  touchesBoundary: boolean;
}

/**
 * Triangle entry representing a single cell in the triangular lattice.
 */
export interface TownscaperLatticeTriangle {
  /** Unique index of the triangle within the lattice. */
  id: number;
  /** Vertex indices that define the triangle. */
  vertices: [number, number, number];
  /** Centroid of the triangle. */
  centroid: Vec2;
  /** Neighboring triangle indices that share an edge. */
  neighbors: number[];
  /** Indicates whether the centroid is inside the puzzle border. */
  insideBoundary: boolean;
}

/**
 * Result returned by {@link createTownscaperLattice} containing the full lattice.
 */
export interface TownscaperLattice {
  /** All generated lattice vertices. */
  vertices: TownscaperLatticeVertex[];
  /** All generated lattice edges connecting vertices. */
  edges: TownscaperLatticeEdge[];
  /** All generated lattice triangles. */
  triangles: TownscaperLatticeTriangle[];
  /** Horizontal spacing between columns. */
  horizontalSpacing: number;
  /** Vertical spacing between rows. */
  verticalSpacing: number;
  /** Number of lattice rows generated (including overscan rows). */
  rowCount: number;
  /** Number of lattice columns generated (including overscan columns). */
  columnCount: number;
}

const createEdgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

interface EdgeRecord {
  vertices: [number, number];
  triangles: number[];
}

/**
 * Build the base Townscaper lattice used by later generator phases.
 *
 * The function constructs a triangular lattice (two triangles per cell) across
 * the requested bounds, records adjacency metadata, and marks entries that
 * intersect the puzzle border. The routine is deterministic and currently does
 * not use randomness, but accepts a seeded {@link TownscaperLatticeOptions.random}
 * implementation for parity with later phases.
 */
export function createTownscaperLattice(options: TownscaperLatticeOptions): TownscaperLattice {
  const {
    width,
    height,
    pieceSize,
    border,
    random: _random,
  } = options;

  const spacing = Math.max(pieceSize, 4);
  const horizontalSpacing = spacing;
  const verticalSpacing = spacing * TRIANGULAR_VERTICAL_RATIO;

  const overscanX = horizontalSpacing;
  const overscanY = verticalSpacing;
  const startX = -overscanX;
  const startY = -overscanY;

  const columnLimit = Math.ceil((width + overscanX * 2) / horizontalSpacing);
  const rowLimit = Math.ceil((height + overscanY * 2) / verticalSpacing);

  const vertices: TownscaperLatticeVertex[] = [];
  const indexByCoord = new Map<string, number>();

  for (let rowIndex = 0; rowIndex <= rowLimit; rowIndex += 1) {
    const y = startY + rowIndex * verticalSpacing;
    const offsetX = (rowIndex % 2 === 0 ? 0 : horizontalSpacing / 2);

    for (let columnIndex = 0; columnIndex <= columnLimit; columnIndex += 1) {
      const x = startX + columnIndex * horizontalSpacing;
      const basePoint: Vec2 = [x + offsetX, y];
      const insideBoundary = isPointInBoundary(basePoint, border);
      const vertexIndex = vertices.length;

      vertices.push({
        id: vertexIndex,
        row: rowIndex,
        column: columnIndex,
        position: basePoint,
        insideBoundary,
      });
      indexByCoord.set(`${rowIndex}:${columnIndex}`, vertexIndex);
    }
  }

  const triangles: TownscaperLatticeTriangle[] = [];
  const edgeRecords = new Map<string, EdgeRecord>();

  const addTriangle = (
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

    const a = vertices[aIndex].position;
    const b = vertices[bIndex].position;
    const c = vertices[cIndex].position;

    const centroid: Vec2 = [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
    ];

    const triangleId = triangles.length;
    triangles.push({
      id: triangleId,
      vertices: [aIndex, bIndex, cIndex],
      centroid,
      neighbors: [],
      insideBoundary: isPointInBoundary(centroid, border),
    });

    const edgePairs: [number, number][] = [
      [aIndex, bIndex],
      [bIndex, cIndex],
      [cIndex, aIndex],
    ];

    for (const pair of edgePairs) {
      const key = createEdgeKey(pair[0], pair[1]);
      const record = edgeRecords.get(key);
      if (record) {
        record.triangles.push(triangleId);
      } else {
        edgeRecords.set(key, {
          vertices: pair,
          triangles: [triangleId],
        });
      }
    }
  };

  for (let row = 0; row < rowLimit; row += 1) {
    const isEvenRow = row % 2 === 0;
    for (let column = 0; column < columnLimit; column += 1) {
      if (isEvenRow) {
        addTriangle([row, column], [row, column + 1], [row + 1, column]);
        addTriangle([row, column + 1], [row + 1, column + 1], [row + 1, column]);
      } else {
        addTriangle([row, column], [row + 1, column + 1], [row + 1, column]);
        addTriangle([row, column], [row, column + 1], [row + 1, column + 1]);
      }
    }
  }

  const edges: TownscaperLatticeEdge[] = [];

  edgeRecords.forEach((record) => {
    const edgeId = edges.length;
    const touchesBoundary = record.triangles.length < 2
      || record.triangles.some((triangleId) => !triangles[triangleId].insideBoundary);

    edges.push({
      id: edgeId,
      vertices: record.vertices,
      triangles: record.triangles.slice(),
      touchesBoundary,
    });
  });

  // Populate triangle neighbor lists now that all edges are known.
  for (const triangle of triangles) {
    const neighborSet = new Set<number>();
    const vertexIndices = triangle.vertices;
    for (let i = 0; i < vertexIndices.length; i += 1) {
      const start = vertexIndices[i];
      const end = vertexIndices[(i + 1) % vertexIndices.length];
      const key = createEdgeKey(start, end);
      const record = edgeRecords.get(key);
      if (!record) {
        continue;
      }
      for (const triangleId of record.triangles) {
        if (triangleId !== triangle.id) {
          neighborSet.add(triangleId);
        }
      }
    }
    triangle.neighbors = Array.from(neighborSet).sort((a, b) => a - b);
  }

  return {
    vertices,
    edges,
    triangles,
    horizontalSpacing,
    verticalSpacing,
    rowCount: rowLimit + 1,
    columnCount: columnLimit + 1,
  };
}
