import type { Vec2, PathCommand } from "../../types";
import type { PointGenerator, PointGenerationRuntimeOptions } from "./PointGenerator";
import type { GeneratorUIMetadata } from '../../ui_types';
import type { GeneratorConfig, GeneratorFactory } from "../Generator";
import { PointGeneratorRegistry } from "../Generator";
import { isPointInBoundary } from '../../utils';

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
  const { latticeSpacing = 80, jitter = 10 } = config;

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

  const generateLattice = (runtimeOpts: PointGenerationRuntimeOptions): Vec2[] => {
    const { width, height, pieceSize, random, border } = runtimeOpts;
    const { horizontal, vertical } = resolveSpacing(pieceSize);
    const overscanX = horizontal;
    const overscanY = vertical;
    const startX = -overscanX;
    const startY = -overscanY;
    const columns = Math.ceil((width + overscanX * 2) / horizontal);
    const rows = Math.ceil((height + overscanY * 2) / vertical);

    const points: Vec2[] = [];
    for (let rowIndex = 0; rowIndex <= rows; rowIndex += 1) {
      const y = startY + rowIndex * vertical;
      const offsetX = (rowIndex % 2 === 0 ? 0 : horizontal / 2);
      for (let columnIndex = 0; columnIndex <= columns; columnIndex += 1) {
        const x = startX + columnIndex * horizontal;
        const candidate: Vec2 = [x + offsetX, y];
        const jittered = applyJitter(candidate, horizontal, vertical, random);
        if (isPointInBoundary(jittered, border)) {
          points.push(jittered);
        }
      }
    }

    return points;
  };

  const TownscaperPointGenerator: PointGenerator = {
    generatePoints(runtimeOpts: PointGenerationRuntimeOptions): Vec2[] {
      return generateLattice(runtimeOpts);
    },
  };

  return TownscaperPointGenerator;
};
export default TownscaperPointGeneratorFactory;

// register the generator
PointGeneratorRegistry.register(Name, TownscaperPointGeneratorFactory, TownscaperPointUIMetadata);
