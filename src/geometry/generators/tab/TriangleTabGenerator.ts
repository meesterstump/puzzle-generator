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
  /** Amount of curviness applied to triangle edges (0-100, default: 0) */
  curviness?: number;
}

/** UI metadata for the Triangle Tab Generator */
export const TriangleTabUIMetadata: GeneratorUIMetadata = {
  name: Name,
  displayName: "Triangle",
  description: "Creates triangular tabs with adjustable curviness, from sharp geometric lines to rounded, cloud-like forms.",
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
    {
      type: 'range',
      name: 'curviness',
      label: 'Curviness (%)',
      optional: true,
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 0,
      helpText: 'Amount of curviness applied to triangle edges (0 = sharp lines, 100 = smooth curves)',
    },
  ],
};

/**
 * Tab generator that creates triangular connectors with adjustable curviness.
 * 
 * This generator produces tabs with a triangular shape that can range from sharp 
 * geometric lines to rounded, cloud-like curves. At 0% curviness, it creates four 
 * straight line segments. At 100% curviness, it uses Bézier curves to create 
 * bulged edges that maintain the triangular structure while appearing more organic.
 */
export const TriangleTabGeneratorFactory: GeneratorFactory<TabGenerator> = (_width: number, _height: number, config: TriangleTabGeneratorConfig) => {
  const { tabHeightRatio = 20, tabWidthRatio = 30, minEdgeLength, curviness = 0 } = config;

  // Constants for curve control point positioning
  const CURVE_CONTROL_START = 0.25;
  const CURVE_CONTROL_END = 0.75;
  const CURVE_BULGE_FACTOR = 0.2;

  /**
   * Creates either a straight line or curved segment based on curviness setting
   */
  const createSegment = (startPoint: Vec2, endPoint: Vec2, curveDirection?: Vec2): EdgeSegment => {
    if (curviness === 0) {
      return { type: 'line', p: endPoint };
    }

    // Calculate control points for smooth curves
    const curveAmount = curviness / 100;
    const segmentVector: Vec2 = [endPoint[0] - startPoint[0], endPoint[1] - startPoint[1]];
    const segmentLength = Math.sqrt(segmentVector[0] ** 2 + segmentVector[1] ** 2);
    
    // Create perpendicular vector for curve bulge
    const perpendicular: Vec2 = [-segmentVector[1] / segmentLength, segmentVector[0] / segmentLength];
    const actualCurveDir = curveDirection ?? perpendicular;
    
    // Position control points to create smooth curves
    const bulgeAmount = segmentLength * CURVE_BULGE_FACTOR * curveAmount;
    
    const control1: Vec2 = [
      startPoint[0] + segmentVector[0] * CURVE_CONTROL_START + actualCurveDir[0] * bulgeAmount,
      startPoint[1] + segmentVector[1] * CURVE_CONTROL_START + actualCurveDir[1] * bulgeAmount,
    ];
    
    const control2: Vec2 = [
      startPoint[0] + segmentVector[0] * CURVE_CONTROL_END + actualCurveDir[0] * bulgeAmount,
      startPoint[1] + segmentVector[1] * CURVE_CONTROL_END + actualCurveDir[1] * bulgeAmount,
    ];
    
    return {
      type: 'bezier',
      p1: control1,
      p2: control2,
      p3: endPoint,
    };
  };

  const TriangleTabGenerator: TabGenerator = {
    addTab(edge: Edge, runtimeOpts: TabGeneratorRuntimeOptions) {
      const { topology, random } = runtimeOpts;

      // Validate half-edges
      const he1 = topology.halfEdges.get(edge.heLeft);
      const he2 = topology.halfEdges.get(edge.heRight);

      if (!he1 || !he2) {
        console.warn("Could not find half-edges for edge:", edge.id);
        return;
      }

      // Calculate edge properties
      const p0 = he1.origin;
      const p3 = he2.origin;
      const edgeVector: Vec2 = [p3[0] - p0[0], p3[1] - p0[1]];
      const edgeLength = Math.sqrt(edgeVector[0] ** 2 + edgeVector[1] ** 2);
      
      if (edgeLength < 1e-6) return; // Skip zero-length edges

      // Apply minimum edge length filter
      if (minEdgeLength && edgeLength < minEdgeLength) {
        return; // Edge too small for triangular tab, leave as simple line
      }

      // Calculate geometric vectors
      const edgeDir: Vec2 = [edgeVector[0] / edgeLength, edgeVector[1] / edgeLength];
      const normalDir: Vec2 = [-edgeDir[1], edgeDir[0]];
      const midPoint: Vec2 = [
        p0[0] + edgeVector[0] / 2, 
        p0[1] + edgeVector[1] / 2,
      ];
      
      // Calculate triangle dimensions
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

      // Generate path segments for primary half-edge
      // Generate path segments for primary half-edge
      const he1Segments: EdgeSegment[] = [
        createSegment(p0, corner1, normalDir),
        createSegment(corner1, apexPoint, normalDir),
        createSegment(apexPoint, corner2, normalDir),
        createSegment(corner2, p3, normalDir),
      ];

      // Generate complementary path for twin half-edge
      const apexPointTwin: Vec2 = [
        midPoint[0] - normalDir[0] * tabHeight,
        midPoint[1] - normalDir[1] * tabHeight,
      ];
      
      const invertedNormal: Vec2 = [-normalDir[0], -normalDir[1]];
      const he2Segments: EdgeSegment[] = [
        createSegment(p3, corner2, invertedNormal),
        createSegment(corner2, apexPointTwin, invertedNormal),
        createSegment(apexPointTwin, corner1, invertedNormal),
        createSegment(corner1, p0, invertedNormal),
      ];

      // Apply segments to topology
      he1.segments = he1Segments;
      he2.segments = he2Segments;
    },
  };
  return TriangleTabGenerator;
};
export default TriangleTabGeneratorFactory;

// Register the generator with the system
TabGeneratorRegistry.register(Name, TriangleTabGeneratorFactory, TriangleTabUIMetadata);
