# Townscaper-Inspired Piece Generator Plan

## Context
- The current feature branch introduced a `TownscaperPointGenerator`, but routing Townscaper-style lattice logic through the Voronoi piece generator produces shapes that still inherit Voronoi topology. That prevents the algorithm from capturing the recognizable blocky silhouettes from Townscaper.
- The puzzle pipeline already separates **point** and **piece** generation. For layouts that do not resemble Voronoi tessellations we should build a dedicated piece generator that constructs the topology directly instead of trying to retrofit points.
- Existing helpers in `src/geometry/generators/piece/PieceGeneratorHelpers.ts` and `linkAndCreateEdges` in `src/geometry/utils.ts` can be reused to materialize pieces once we have polygons for each Townscaper block.

## Objectives
1. Design and implement a `TownscaperPieceGenerator` that produces puzzle topology from a Townscaper-inspired lattice without relying on Voronoi.
2. Preserve determinism by continuing to drive all randomness through the seeded `random` function supplied in the runtime options.
3. Provide configuration controls that expose key artistic levers (grid spacing, merge probability, relaxation strength, etc.) while keeping sensible defaults.
4. Ensure compatibility with the existing tab placement and tab geometry pipeline by emitting well-formed `PuzzleTopology` data (pieces, edges, half-edges, vertices, boundary markers).
5. Retire or hide the incomplete point generator once the new piece generator is validated to avoid confusing duplicate options.

## Guiding Principles
- **Honor the Townscaper lattice**: model the irregular hexagonal/triangular grid described in the reference article so that neighboring cells meet at consistent 120°/60° angles.
- **Cluster before polygonization**: treat merged lattice cells as regions to be converted into simple polygons whose boundaries trace the outside edges of the cluster.
- **Reuse helper utilities**: leverage boundary clipping and topology wiring utilities instead of rebuilding them, keeping the generator focused on cluster assembly.
- **Respect borders**: always clip generated geometry against the puzzle border and discard clusters that fall completely outside.
- **Maintain UI parity**: surface configuration metadata in the same style as other piece generators so the Mithril UI can render controls automatically.

## Preview & Validation Strategy
- **Leverage the existing preview workflow**: ensure every phase exposes its progress through the already-configured GitHub Pages previews so changes remain reviewable on mobile without running a local dev server.
- **Dedicated Townscaper harness**: create a `TownscaperDebugPage` (or extend `TestPage`) that mounts only the Townscaper generator with debug overlays, large tap targets, and a permalink-friendly route (`/townscaper-debug`). The preview workflow should publish this page alongside the main app so it can be opened directly on mobile Safari/Chrome.
- **Layered debug toggles**: expose UI switches to visualize successive stages—base lattice, merge clusters, polygon outlines, and final puzzle topology—so early phases can be reviewed visually even before the generator is fully integrated into the main puzzle page.
- **Mobile-first controls**: ensure the debug view uses responsive layout, zoom presets, and tap-friendly toggle buttons because the reviewer is using a tablet without desktop dev tools.
- **Logging fallback**: when needed, add an overlay panel that prints key counts (triangles, clusters, polygons, edges) so regression triage is possible without console access.

## Implementation Roadmap

### Phase 0 – Preparatory Analysis
- Audit `PieceGenerator` interface, `PuzzleTopology` structure, and helper functions (`createPieceFromPolygon`, `clipCellToBoundary`, `linkAndCreateEdges`).
- Catalogue reusable pieces of logic from `TownscaperPointGenerator` (lattice creation, triangle adjacency, clustering, relaxation) that can be transplanted into the piece generator.
- Identify UI touch points (`PieceGeneratorRegistry`, `PuzzlePage` imports) to integrate the new generator and hide the point generator experiment.
- Establish a baseline Townscaper debug route so subsequent phases can be demonstrated visually through the existing preview builds.

### Phase 1 – Core Lattice Model *(Completed)*
- Implement a deterministic routine that builds the Townscaper base lattice across the puzzle bounds (likely via triangular coordinates with alternating row offsets).
- Store both vertex positions and connectivity metadata (triangles, shared edges) to support later clustering and boundary tracing.
- Clip or filter lattice vertices to the puzzle border using `isPointInBoundary` while retaining adjacency information for partially clipped cells.
- Render the lattice in the debug page with color-coded axial coordinates and expose piece size and seed controls so reviewers can confirm spacing/alignment in the GitHub Pages preview.

**Status update:** The new `createTownscaperLattice` module produces deterministic vertices, edges, and triangle adjacency data while respecting the puzzle border, and the `TownscaperDebugPage` now visualizes the lattice with piece size + seed controls. Future work should proceed with Phase 2.

### Phase 2 – Block Clustering
- Reuse/adapt the merge queue logic to group adjacent triangles into clusters based on configurable merge probability.
- Track cluster membership at the edge level so that we can derive the outer boundary of each cluster without losing neighboring relationships.
- Ensure clusters respect the puzzle border: drop triangles that straddle the boundary if their centroid falls outside, or split clusters accordingly.
- Add a debug overlay that fills each cluster with a distinct color and lists cluster statistics in the mobile-friendly panel.

### Phase 3 – Polygon Extraction
- Convert each cluster into a simple polygon by walking the perimeter edges (e.g., build a directed edge map keyed by lattice edge -> cluster id, then trace the boundary loops in clockwise order).
- Simplify polygons (remove colinear vertices) and clip them against the puzzle border using `clipCellToBoundary` for safety.
- Compute representative seed/site positions for each cluster (centroid or averaged vertex) for downstream features that expect `piece.site`.
- Toggle polygon overlays in the debug harness (thicker stroke, vertex markers) so reviewers can verify orientation and clipping against the border.

### Phase 4 – Topology Construction
- For every polygon that survives clipping, create puzzle pieces using `createPieceFromPolygon`, storing cluster centroids as the `site`.
- Link neighboring pieces with `linkAndCreateEdges`, marking true border edges by detecting when only one cluster owns the lattice edge or when clipping truncated the polygon.
- Populate `topology.vertices` with the deduplicated vertex list following the pattern in the Voronoi generator.
- Show the half-edge graph in the debug view (piece outlines plus shared edge highlights) and export the topology stats in the overlay panel.

### Phase 5 – UI & Integration
- Add `TownscaperPieceGenerator.ts` with config, UI metadata, factory, and registry registration.
- Update `src/index.ts` (and any generator pickers) to import the new generator and remove/disable the point generator entry to avoid exposing redundant options.
- Document configuration fields and defaults in UI metadata to guide users.
- Wire the generator into `PuzzlePage` behind a feature flag toggle that defaults on once validation is complete, and keep the debug route for regression triage.

### Phase 6 – Validation & Cleanup
- Run `pnpm exec tsc --noEmit` and `pnpm run lint` to guarantee type and style conformance.
- Manually exercise the generator within the dev UI to verify shape variety, boundary adherence, and tab placement compatibility.
- Remove or archive `TownscaperPointGenerator` after confirming the piece generator supersedes it, updating docs and changelog notes accordingly.
- Fold the debug overlays into a configurable developer mode (hidden behind URL param) once the main feature ships, continuing to rely on the preview builds for regression review.

## Open Questions & Research Tasks
- Precisely replicate Townscaper's underlying lattice (a perturbed skewed square grid vs. true triangular lattice) – confirm by studying the reference article or inspecting Townscaper exports.
- Determine whether relaxation should move cluster centroids or actual polygon vertices to achieve the organic offsets seen in Townscaper.
- Evaluate performance implications when generating large puzzles (hundreds of clusters) and profile hotspots for potential optimization.
