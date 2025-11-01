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
  pairTownscaperTriangles,
  type TownscaperPairingResult,
} from '../geometry/generators/piece/townscaper/TownscaperPairing';

import './TownscaperDebugPage.css';

const PALETTE = [
  '#ff6b6b',
  '#4dabf7',
  '#51cf66',
  '#845ef7',
];

const PAIR_COLORS = [
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
    seed: 1,
    border: createRectangleBorder(900, 600),
    lattice: null as TownscaperLattice | null,
    pairing: null as TownscaperPairingResult | null,
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
    state.pairing = pairTownscaperTriangles({
      lattice,
      random,
    });
  };

  const handleSliderChange = (
    field: 'pieceSize' | 'seed',
  ) => (event: Event) => {
    const slider = event.target as WaSlider;
    const numeric = Number(slider.value);
    state[field] = Number.isFinite(numeric) ? numeric : state[field];
    if (field === 'seed') {
      state[field] = Math.max(0, Math.round(state[field]));
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
      const pairing = state.pairing;
      const activeTriangles = lattice.triangles.filter((triangle) => triangle.insideBoundary).length;
      const activeVertices = lattice.vertices.filter((vertex) => vertex.insideBoundary).length;
      const boundaryEdges = lattice.edges.filter((edge) => edge.touchesBoundary).length;
      const pairCount = pairing ? pairing.pairs.filter((pair) => pair.triangleIds.length === 2).length : 0;
      const singlesCount = pairing ? pairing.pairs.filter((pair) => pair.triangleIds.length === 1).length : 0;
      const removedEdges = pairing ? pairing.removedEdgeIds.length : 0;
      const removedEdgeSet = new Set(pairing?.removedEdgeIds ?? []);

      return m('.townscaper-debug-page', [
        m('h1', 'Townscaper Lattice Debug'),
        m('p.description', [
          'Phase 2 visualizer for the Townscaper-inspired generator. Adjust the sliders to explore seeded '
          + 'lattice construction and observe how triangles pair into diamond-shaped Townscaper blocks.',
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
                m('span.label', 'Paired diamonds'),
                m('span.value', `${pairCount}`),
              ]),
              m('div', [
                m('span.label', 'Single triangles'),
                m('span.value', `${singlesCount}`),
              ]),
              m('div', [
                m('span.label', 'Removed interior edges'),
                m('span.value', `${removedEdges}`),
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
              pairing
                ? pairing.triangleToPair.flatMap((pairId, triangleIndex) => {
                  if (pairId === -1) {
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
                  const fill = PAIR_COLORS[pairId % PAIR_COLORS.length];
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
                const removed = removedEdgeSet.has(edge.id);
                return m('line', {
                  x1: start[0],
                  y1: start[1],
                  x2: end[0],
                  y2: end[1],
                  stroke: removed ? '#adb5bd' : (edge.touchesBoundary ? '#ff922b' : '#2f9e44'),
                  'stroke-width': removed ? 0.75 : (edge.touchesBoundary ? 2 : 1),
                  'stroke-linecap': 'round',
                  'stroke-dasharray': removed ? '4 3' : undefined,
                  opacity: removed ? 0.35 : (edge.touchesBoundary ? 0.85 : 0.4),
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
