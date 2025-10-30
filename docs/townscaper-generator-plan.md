# Townscaper-Inspired Point Generator Plan

## Objectives
- Introduce a new point generator that mimics Townscaper's block placement aesthetic within the existing puzzle generator architecture.
- Maintain deterministic behavior via the provided seeded random number generator.
- Keep generation performant for interactive use in the browser.

## Implementation Roadmap

### 1. Audit Existing Point Generation Infrastructure
- Review `src/geometry/generators/point/PointGenerator.ts` to confirm required interfaces and runtime options.
- Study implementations in `src/geometry/generators/point/PoissonPointGenerator.ts` and `src/geometry/generators/point/GridJitterPointGenerator.ts` to understand configuration wiring, RNG usage, and boundary filtering helpers.
- Catalog reusable geometry utilities in `src/geometry/utils.ts` and related modules for point-in-polygon tests, vector math, and mesh relaxation support.

### 2. Design Townscaper Lattice Workflow
- Define configuration parameters such as lattice spacing, merge probability, relaxation iterations, and optional jitter derived from puzzle `pieceSize`.
- Choose internal data structures for triangles, adjacency relationships, and merged regions that stay deterministic with seeded RNG input.
- Select a relaxation strategy (e.g., Lloyd iterations with centroid snapping) compatible with available utilities.

### 3. Prototype Geometry Stages
- Implement helper routines for:
  - Constructing a triangular lattice clipped to puzzle bounds/border.
  - Randomly merging adjacent triangle pairs using the seeded RNG without crossing borders.
  - Subdividing merged regions into quads and extracting representative point positions.
  - Applying relaxation passes while constraining results to remain inside the puzzle boundary.
- Devise lightweight validation checks or debug visualizations to verify each stage before full integration.

### 4. Implement Generator Module
- Create `src/geometry/generators/point/TownscaperPointGenerator.ts` with configuration interface, UI metadata, and factory following repository conventions.
- Integrate the staged helper algorithms, ensuring deterministic RNG usage and respect for provided `bounds` and `border` inputs.
- Register the generator with `PointGeneratorRegistry` and add the side-effect import in `src/index.ts`.

### 5. UI Integration and Defaults
- Populate UI metadata with descriptive labels and sensible ranges for the new configuration parameters.
- Confirm default values produce a visually appealing Townscaper-like distribution without additional tuning.

### 6. Verification and QA
- Run `pnpm exec tsc --noEmit` and `pnpm run lint` to ensure type safety and code style compliance.
- Manually test the new generator in the development UI to confirm behavior and performance.
- Document follow-up tuning opportunities or performance considerations for future work.

## Next Steps
- Begin Step 1 by auditing the point generator interface and existing implementations, capturing notes to guide subsequent stages.

## Step 1 Audit Notes (In Progress)
- `PointGenerator` interface exposes a single `generatePoints` method receiving `PointGenerationRuntimeOptions` with width, height, pieceSize, seeded `random`, and `border` path information.
- Existing generators (`PoissonPointGenerator`, `GridJitterPointGenerator`) follow a pattern of factory functions returning `PointGenerator` objects that self-register via `PointGeneratorRegistry` alongside UI metadata definitions.
- Boundary filtering relies on `isPointInBoundary` from `src/geometry/utils.ts`; all generators ensure final point sets respect the custom border.
- Config metadata is surfaced via `GeneratorUIMetadata.controls`, using range inputs for numeric settings and mapping to the config interface; defaults are provided within metadata rather than hard-coded in generation logic.
- RNG usage is deterministic by sourcing all randomness from the supplied `runtimeOpts.random` function.
- Geometry utilities also expose `clipPolygonAgainstBoundary` and `flattenBoundary` helpers, suggesting potential reuse for lattice clipping and relaxation constraints.
