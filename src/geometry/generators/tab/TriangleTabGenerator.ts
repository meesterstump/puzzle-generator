import type { TabGeneratorRuntimeOptions, TabGenerator } from "./TabGenerator";
import type { Edge, Vec2, EdgeSegment } from "../../types";
import type { GeneratorUIMetadata } from '../../ui_types';
import type { GeneratorConfig, GeneratorFactory } from "../Generator";
import { TabGeneratorRegistry } from "../Generator";

// Name of this generator, uniquely identifies it from all the other TabGenerators
type TriangleTabGeneratorName = "TriangleTabGenerator";
export const Name: TriangleTabGeneratorName = "TriangleTabGenerator";

/** Configuration options for the Triangle Tab Generator */
export interface TriangleTabGeneratorConfig extends GeneratorConfig {
  name: TriangleTabGeneratorName;
  /** Height of the triangular tab as a percentage of the edge length (default: 20%) */
  tabHeightRatio?: number;
  /** Width of the triangle base as a percentage of the edge length (default: 30%) */
  tabWidthRatio?: number;
  /** Minimum edge length required to create a triangular tab (default: 20) */
  minEdgeLength?: number;
}

/** UI metadata for the Triangle Tab Generator */
export const TriangleTabUIMetadata: GeneratorUIMetadata = {
  name: Name,
  displayName: "Triangle",
  description: "Creates sharp triangular tabs using straight line segments for a geometric, angular appearance.",
  sortHint: 2,
  controls: [
    {
      type: 'range',
      name: 'tabHeightRatio',
      label: 'Tab Height (%)',
      optional: true,
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 20,
      helpText: 'Height of the triangular tab as a percentage of the edge length',
    },
    {
      type: 'range',
      name: 'tabWidthRatio',
      label: 'Tab Width (%)',
      optional: true,
      min: 10,
      max: 80,
      step: 1,
      defaultValue: 30,
      helpText: 'Width of the triangle base as a percentage of the edge length',
    },
    {
      type: 'number',
      name: 'minEdgeLength',
      label: 'Minimum Edge Length',
      optional: true,
      defaultValue: 20,
      helpText: 'Minimum edge length required to create a triangular tab',
    },
  ],
};

/**
 * Tab generator that creates sharp triangular connectors using straight line segments.
 * 
 * This generator produces tabs with a defined geometric triangular shape consisting
 * of four straight line segments that form a sharp triangular protrusion or indentation
 * along the puzzle piece edge. The triangular shape provides a clean, angular aesthetic
 * that contrasts with the curved tabs of other generators.
 */
export const TriangleTabGeneratorFactory: GeneratorFactory<TabGenerator> = (_width: number, _height: number, config: TriangleTabGeneratorConfig) => {
  const { tabHeightRatio = 20, tabWidthRatio = 30, minEdgeLength } = config;

  const TriangleTabGenerator: TabGenerator = {
    addTab(edge: Edge, runtimeOpts: TabGeneratorRuntimeOptions) {
      const { topology, random } = runtimeOpts;

      // Get the half-edges from the topology
      const he1 = topology.halfEdges.get(edge.heLeft);
      const he2 = topology.halfEdges.get(edge.heRight);

      if (!he1 || !he2) {
        console.warn("Could not find half-edges for edge:", edge.id);
        return;
      }

      // Define edge endpoints
      const p0 = he1.origin;
      const p3 = he2.origin;

      // Calculate edge properties
      const edgeVector: Vec2 = [p3[0] - p0[0], p3[1] - p0[1]];
      const edgeLength = Math.sqrt(edgeVector[0] ** 2 + edgeVector[1] ** 2);
      
      if (edgeLength < 1e-6) return; // Skip zero-length edges

      // Check minimum edge length threshold
      if (minEdgeLength && edgeLength < minEdgeLength) {
        return; // Edge too small for triangular tab, leave as simple line
      }

      // Calculate normalized edge direction and perpendicular normal
      const edgeDir: Vec2 = [edgeVector[0] / edgeLength, edgeVector[1] / edgeLength];
      const normalDir: Vec2 = [-edgeDir[1], edgeDir[0]];

      // Calculate triangle geometry
      const midPoint: Vec2 = [
        p0[0] + edgeVector[0] / 2, 
        p0[1] + edgeVector[1] / 2,
      ];
      
      // Randomly determine tab direction (outward or inward)
      const direction = random() > 0.5 ? 1 : -1;
      const tabHeight = edgeLength * (tabHeightRatio / 100) * direction;
      const halfTabWidth = edgeLength * (tabWidthRatio / 100) / 2;
      
      // Calculate triangle vertices
      const apexPoint: Vec2 = [
        midPoint[0] + normalDir[0] * tabHeight,
        midPoint[1] + normalDir[1] * tabHeight,
      ];
      
      const corner1: Vec2 = [
        midPoint[0] - edgeDir[0] * halfTabWidth,
        midPoint[1] - edgeDir[1] * halfTabWidth,
      ];
      
      const corner2: Vec2 = [
        midPoint[0] + edgeDir[0] * halfTabWidth,
        midPoint[1] + edgeDir[1] * halfTabWidth,
      ];

      // Create triangular path segments for first half-edge
      const he1Segments: EdgeSegment[] = [
        { type: 'line', p: corner1 },
        { type: 'line', p: apexPoint },
        { type: 'line', p: corner2 },
        { type: 'line', p: p3 },
      ];

      // Create complementary path for twin half-edge (inverted triangle)
      const apexPointTwin: Vec2 = [
        midPoint[0] - normalDir[0] * tabHeight,
        midPoint[1] - normalDir[1] * tabHeight,
      ];
      
      const he2Segments: EdgeSegment[] = [
        { type: 'line', p: corner2 },
        { type: 'line', p: apexPointTwin },
        { type: 'line', p: corner1 },
        { type: 'line', p: p0 },
      ];

      // Apply segments to half-edges
      he1.segments = he1Segments;
      he2.segments = he2Segments;
    },
  };
  return TriangleTabGenerator;
};
export default TriangleTabGeneratorFactory;

// Register the generator with the system
TabGeneratorRegistry.register(Name, TriangleTabGeneratorFactory, TriangleTabUIMetadata);
