import m from 'mithril';
import '@awesome.me/webawesome/dist/components/slider/slider.js';
import WaSlider from '@awesome.me/webawesome/dist/components/slider/slider.js';

import mulberry32 from '../utils/mulberry';
import { createRectangleBorder } from '../geometry/borderShapes';
import {
  createTownscaperLattice,
  type TownscaperLattice,
} from '../geometry/generators/piece/townscaper/TownscaperLattice';
import {
  clusterTownscaperLattice,
  type TownscaperClusteringResult,
} from '../geometry/generators/piece/townscaper/TownscaperClustering';

import './TownscaperDebugPage.css';

const PALETTE = [
  '#ff6b6b',
  '#4dabf7',
  '#51cf66',
  '#845ef7',
];

const CLUSTER_COLORS = [
  '#f6bd60',
  '#f28482',
  '#84a59d',
  '#f5cac3',
  '#82c0cc',
  '#90be6d',
  '#ffafcc',
  '#cdb4db',
];

/**
 * Debug page that visualizes the Townscaper lattice during Phase 1.
 */
export const TownscaperDebugPage: m.ClosureComponent = () => {
  const state = {
    width: 900,
    height: 600,
    pieceSize: 120,
    mergeProbability: 45,
    seed: 1,
    border: createRectangleBorder(900, 600),
    lattice: null as TownscaperLattice | null,
    clustering: null as TownscaperClusteringResult | null,
  };

  const rebuildLattice = () => {
    const random = mulberry32(state.seed);
    const lattice = createTownscaperLattice({
      width: state.width,
      height: state.height,
      pieceSize: state.pieceSize,
      border: state.border,
      random,
    });
    state.lattice = lattice;
    state.clustering = clusterTownscaperLattice({
      lattice,
      mergeChance: state.mergeProbability / 100,
      random,
    });
  };

  const handleSliderChange = (
    field: 'pieceSize' | 'seed' | 'mergeProbability',
  ) => (event: Event) => {
    const slider = event.target as WaSlider;
    const numeric = Number(slider.value);
    state[field] = Number.isFinite(numeric) ? numeric : state[field];
    if (field === 'seed') {
      state[field] = Math.max(0, Math.round(state[field]));
    }
    if (field === 'mergeProbability') {
      state[field] = Math.min(100, Math.max(0, Math.round(state[field])));
    }
    rebuildLattice();
  };

  return {
    oninit: rebuildLattice,
    view: () => {
      if (!state.lattice) {
        rebuildLattice();
      }
      const lattice = state.lattice!;
      const clustering = state.clustering;
      const activeTriangles = lattice.triangles.filter((triangle) => triangle.insideBoundary).length;
      const activeVertices = lattice.vertices.filter((vertex) => vertex.insideBoundary).length;
      const boundaryEdges = lattice.edges.filter((edge) => edge.touchesBoundary).length;
      const clusterCount = clustering ? clustering.clusters.length : 0;
      const clusterSizes = clustering
        ? clustering.clusters.map((cluster) => cluster.triangleIds.length)
        : [];
      const averageClusterSize = clusterSizes.length > 0
        ? clusterSizes.reduce((sum, count) => sum + count, 0) / clusterSizes.length
        : 0;
      const largestCluster = clusterSizes.length > 0
        ? Math.max(...clusterSizes)
        : 0;

      return m('.townscaper-debug-page', [
        m('h1', 'Townscaper Lattice Debug'),
        m('p.description', [
          'Phase 2 visualizer for the Townscaper-inspired generator. Adjust the sliders to explore seeded '
          + 'lattice construction, clustering probability, and the resulting Townscaper-style blocks.',
        ]),
        m('.townscaper-debug-layout', [
          m('.townscaper-debug-controls', [
            m('wa-slider', {
              label: 'Nominal Piece Size',
              min: 60,
              max: 200,
              step: 5,
              value: state.pieceSize,
              'with-tooltip': true,
              onchange: handleSliderChange('pieceSize'),
            }),
            m('wa-slider', {
              label: 'Seed',
              min: 0,
              max: 999,
              step: 1,
              value: state.seed,
              'with-tooltip': true,
              onchange: handleSliderChange('seed'),
            }),
            m('wa-slider', {
              label: 'Merge Probability (%)',
              min: 0,
              max: 100,
              step: 1,
              value: state.mergeProbability,
              'with-tooltip': true,
              onchange: handleSliderChange('mergeProbability'),
            }),
            m('.metrics', [
              m('div', [
                m('span.label', 'Vertices in border'),
                m('span.value', `${activeVertices} / ${lattice.vertices.length}`),
              ]),
              m('div', [
                m('span.label', 'Triangles in border'),
                m('span.value', `${activeTriangles} / ${lattice.triangles.length}`),
              ]),
              m('div', [
                m('span.label', 'Boundary edges'),
                m('span.value', `${boundaryEdges}`),
              ]),
              m('div', [
                m('span.label', 'Clusters'),
                m('span.value', `${clusterCount}`),
              ]),
              m('div', [
                m('span.label', 'Avg cluster size'),
                m('span.value', clusterSizes.length > 0 ? averageClusterSize.toFixed(2) : '0'),
              ]),
              m('div', [
                m('span.label', 'Largest cluster (triangles)'),
                m('span.value', `${largestCluster}`),
              ]),
            ]),
          ]),
          m('.townscaper-debug-preview', [
            m('svg', {
              viewBox: `0 0 ${state.width} ${state.height}`,
              width: '100%',
              height: '100%',
              preserveAspectRatio: 'xMidYMid meet',
            }, [
              m('rect', {
                x: 0,
                y: 0,
                width: state.width,
                height: state.height,
                fill: 'none',
                stroke: '#9e9e9e',
                'stroke-width': 1,
              }),
              clustering
                ? clustering.triangleToCluster.flatMap((clusterId, triangleIndex) => {
                  if (clusterId === -1) {
                    return [];
                  }
                  const triangle = lattice.triangles[triangleIndex];
                  if (!triangle?.insideBoundary) {
                    return [];
                  }
                  const vertices = triangle.vertices.map((vertexId) => lattice.vertices[vertexId]?.position);
                  if (vertices.some((vertex) => !vertex)) {
                    return [];
                  }
                  const fill = CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length];
                  return m('polygon', {
                    points: vertices.map((vertex) => `${vertex[0]},${vertex[1]}`).join(' '),
                    fill,
                    opacity: 0.45,
                    stroke: fill,
                    'stroke-width': 0.5,
                  });
                })
                : null,
              lattice.edges.map((edge) => {
                const start = lattice.vertices[edge.vertices[0]].position;
                const end = lattice.vertices[edge.vertices[1]].position;
                return m('line', {
                  x1: start[0],
                  y1: start[1],
                  x2: end[0],
                  y2: end[1],
                  stroke: edge.touchesBoundary ? '#ff922b' : '#2f9e44',
                  'stroke-width': edge.touchesBoundary ? 2 : 1,
                  'stroke-linecap': 'round',
                  opacity: edge.touchesBoundary ? 0.85 : 0.4,
                });
              }),
              lattice.vertices.map((vertex) => {
                const [x, y] = vertex.position;
                const color = PALETTE[(vertex.row % PALETTE.length + PALETTE.length) % PALETTE.length];
                return m('circle', {
                  cx: x,
                  cy: y,
                  r: vertex.insideBoundary ? 3 : 2,
                  fill: color,
                  opacity: vertex.insideBoundary ? 0.9 : 0.3,
                });
              }),
            ]),
          ]),
        ]),
      ]);
    },
  };
};

export default TownscaperDebugPage;
