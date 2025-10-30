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

## Step 2 Progress
- Established the initial `TownscaperPointGenerator` module with configuration scaffolding and registry wiring.
- Implemented a triangular lattice seed stage that respects the puzzle boundary while supporting adjustable spacing and jitter.

## Next Steps
- Extend the generator to group adjacent triangles into larger Townscaper-style blocks using a seeded merge probability.
- Introduce relaxation/centroid passes that keep merged block centers inside the boundary.
- Expose merge and relaxation controls in the UI metadata once the behaviors are implemented.

## Step 1 Audit Notes (Complete)
- **Generator interfaces & runtime context**
  - `PointGenerationRuntimeOptions` (in `PointGenerator.ts`) provides `width`, `height`, `pieceSize`, the seeded `random` function, and the flattened `border` commands. These are the only runtime inputs a generator can rely on.
  - `PointGenerator` itself exposes a single `generatePoints(runtimeOpts)` method and returns an array of `Vec2` coordinates. No generator maintains internal state between runs.
  - All point generators are instantiated via the shared `GeneratorFactory` signature (`Generator.ts`), which always receives `(border, bounds, config)`. Bounds are `{ width, height }` numbers separate from the runtime options.
- **Factory/config wiring pattern**
  - Each implementation defines a unique literal `Name` constant and a config interface extending `GeneratorConfig` with a `name` discriminator plus any additional fields (e.g., `jitter` for the grid generator).
  - Factories capture config defaults at construction time; defaults come from UI metadata `controls[i].defaultValue` when `GeneratorRegistry.getDefaultConfig()` is called. Generation logic assumes these values are already populated.
  - Registration happens at module load via `PointGeneratorRegistry.register(Name, Factory, UIMetadata)`. Side-effect imports in `src/index.ts` activate the generator.
- **Implementation patterns in existing generators**
  - `PoissonPointGenerator` wraps the `poisson-disk-sampling` package, using the provided `pieceSize` as the minimum distance, and filters post-generated points with `isPointInBoundary(point, border)`.
  - `GridJitterPointGenerator` iterates over a rectangular lattice sized by `pieceSize`, offsets each cell center by `(random() - 0.5) * jitter% * pieceSize`, and likewise filters by boundary containment before pushing points.
  - Both generators only pull randomness from `runtimeOpts.random`, preserving determinism, and avoid storing intermediate state on the generator object.
- **Reusable geometry utilities**
  - `isPointInBoundary` (in `src/geometry/utils.ts`) flattens complex borders (including Bézier curves and arcs) through `flattenBoundary` and then runs an even-odd ray-cast test. This is critical for clipping the triangular lattice later.
  - `clipPolygonAgainstBoundary` leverages `martinez-polygon-clipping` for robust intersection tests between simple polygons and the flattened boundary.
  - `flattenBoundary` emits polygon loops derived from command sequences, handling `move`, `line`, `bezier`, and `arc` segments by sampling them into point lists; these will be useful for constraining relaxation operations.
  - Additional helpers like `distanceSq` and centroid-friendly utilities (e.g., `calculateSegmentsBounds`) exist, but there is no dedicated Lloyd relaxation helper—any smoothing step will need to work with the Vec2 arrays directly.
