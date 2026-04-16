import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ExplorerEdgeLayer } from './ExplorerEdgeLayer';
import { nodeHeightForTrack, cleanTitle, nodeHeight, stripTitlePrefix, NODE_H_DEFAULT } from '../../utils/explorer';
import type { ExplorerNode, ExplorerEdge } from '../../types';

function makeNode(overrides: Partial<ExplorerNode> = {}): ExplorerNode {
  return {
    id: 1, set_id: 1, tree_id: 1, node_id: 'n1',
    track_id: 100, level: 0, col_index: 0,
    track: { id: 100, title: 'Short', artist_names: [], bpm: 120, key: 'Am', camelot_code: '1A', genre: null, label: null, energy: null, date_added: null },
    ...overrides,
  };
}

function makeEdge(overrides: Partial<ExplorerEdge> = {}): ExplorerEdge {
  return { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2', ...overrides };
}

const NODE_W = 203;
const SLOT_W = 292;
const TOP_PAD = 32;
const LABEL_W = 32;
const CELL_NODE_OFFSET_Y = 0;

const EDGE_SLOTS = 5;
const EDGE_PAD = 23;
const SLOT_STEP = 6;
const BUCKET_GAP = 5;

function calcNodeX(colIndex: number): number {
  return LABEL_W + colIndex * SLOT_W + (SLOT_W - NODE_W) / 2;
}

function expectedSlotX(colIndex: number, laneIndex: number): number {
  const nodeX = calcNodeX(colIndex);
  const bucket = Math.floor(laneIndex / EDGE_SLOTS);
  const slot = laneIndex % EDGE_SLOTS;
  return nodeX + EDGE_PAD + bucket * (EDGE_SLOTS * SLOT_STEP + BUCKET_GAP) + slot * SLOT_STEP;
}

describe('ExplorerEdgeLayer', () => {
  it('edge path uses slot-based entry/exit anchors, not center-x', () => {
    const parent = makeNode({ node_id: 'n1', level: 0, col_index: 0 });
    const child = makeNode({ id: 2, node_id: 'n2', level: 1, col_index: 1, track_id: 101,
      track: { id: 101, title: 'B', artist_names: [], bpm: 128, key: 'Cm', camelot_code: '5A', genre: null, label: null, energy: null, date_added: null },
    });
    const edge = makeEdge();

    const { container } = render(
      <ExplorerEdgeLayer
        edges={[edge]} nodes={[parent, child]}
        edgeScores={new Map()} loadingEdgeKeys={new Set()}
        selectedEdgeId={null}
        onEdgeClick={vi.fn()} onDeleteEdge={vi.fn()}
        totalWidth={1000} totalHeight={600}
      />
    );

    const hitbox = container.querySelector('[data-testid="explorer-edge-hitbox"]');
    expect(hitbox).toBeTruthy();
    const d = hitbox!.getAttribute('d')!;

    const laneIndex = 0 * EDGE_SLOTS + 1;
    const parentSlotX = expectedSlotX(0, laneIndex);
    const childSlotX = expectedSlotX(1, laneIndex);

    expect(d).toContain(`M ${parentSlotX} `);
    expect(d).toContain(` L ${childSlotX} `);
  });

  it('different parent-child column combos produce distinct anchor positions', () => {
    const nodes = [
      makeNode({ node_id: 'n1', level: 0, col_index: 0 }),
      makeNode({ id: 2, node_id: 'n2', level: 1, col_index: 0, track_id: 101,
        track: { id: 101, title: 'B', artist_names: [], bpm: 128, key: 'Cm', camelot_code: '5A', genre: null, label: null, energy: null, date_added: null },
      }),
      makeNode({ id: 3, node_id: 'n3', level: 1, col_index: 1, track_id: 102,
        track: { id: 102, title: 'C', artist_names: [], bpm: 130, key: 'Dm', camelot_code: '7A', genre: null, label: null, energy: null, date_added: null },
      }),
    ];
    const edges = [
      makeEdge({ id: 1, parent_node_id: 'n1', child_node_id: 'n2' }),
      makeEdge({ id: 2, parent_node_id: 'n1', child_node_id: 'n3' }),
    ];

    const { container } = render(
      <ExplorerEdgeLayer
        edges={edges} nodes={nodes}
        edgeScores={new Map()} loadingEdgeKeys={new Set()}
        selectedEdgeId={null}
        onEdgeClick={vi.fn()} onDeleteEdge={vi.fn()}
        totalWidth={1000} totalHeight={600}
      />
    );

    const hitboxes = container.querySelectorAll('[data-testid="explorer-edge-hitbox"]');
    expect(hitboxes.length).toBe(2);

    const d0 = hitboxes[0].getAttribute('d')!;
    const d1 = hitboxes[1].getAttribute('d')!;

    const startX0 = Number(d0.split(' ')[1]);
    const startX1 = Number(d1.split(' ')[1]);
    expect(startX0).not.toBe(startX1);
  });

  it('edge path connects parent bottom to child top', () => {
    const parent = makeNode({ node_id: 'n1', level: 0, col_index: 0 });
    const child = makeNode({ id: 2, node_id: 'n2', level: 1, col_index: 0, track_id: 101,
      track: { id: 101, title: 'B', artist_names: [], bpm: 128, key: 'Cm', camelot_code: '5A', genre: null, label: null, energy: null, date_added: null },
    });
    const edge = makeEdge();

    const { container } = render(
      <ExplorerEdgeLayer
        edges={[edge]} nodes={[parent, child]}
        edgeScores={new Map()} loadingEdgeKeys={new Set()}
        selectedEdgeId={null}
        onEdgeClick={vi.fn()} onDeleteEdge={vi.fn()}
        totalWidth={1000} totalHeight={600}
      />
    );

    const d = container.querySelector('[data-testid="explorer-edge-hitbox"]')!.getAttribute('d')!;
    const V_GAP = 132;
    const LEVEL_HEIGHT = NODE_H_DEFAULT + V_GAP;
    const parentBottom = TOP_PAD + 0 * LEVEL_HEIGHT + CELL_NODE_OFFSET_Y + nodeHeightForTrack('Short');
    const childTop = TOP_PAD + 1 * LEVEL_HEIGHT + CELL_NODE_OFFSET_Y;

    expect(d).toMatch(new RegExp(`M [\\d.]+ ${parentBottom}`));
    expect(d).toMatch(new RegExp(`L [\\d.]+ ${childTop}$`));
  });

  it('long-title parent uses same height as rendered cell (NODE_H_DEFAULT)', () => {
    const longTitle = '[8A - Aminor - 128] ' + 'A'.repeat(50);
    const parent = makeNode({ node_id: 'n1', level: 0, col_index: 0,
      track: { id: 100, title: longTitle, artist_names: [], bpm: 120, key: 'Am', camelot_code: '1A', genre: null, label: null, energy: null, date_added: null },
    });
    const child = makeNode({ id: 2, node_id: 'n2', level: 1, col_index: 0, track_id: 101,
      track: { id: 101, title: 'B', artist_names: [], bpm: 128, key: 'Cm', camelot_code: '5A', genre: null, label: null, energy: null, date_added: null },
    });
    const edge = makeEdge();

    const { container } = render(
      <ExplorerEdgeLayer
        edges={[edge]} nodes={[parent, child]}
        edgeScores={new Map()} loadingEdgeKeys={new Set()}
        selectedEdgeId={null}
        onEdgeClick={vi.fn()} onDeleteEdge={vi.fn()}
        totalWidth={1000} totalHeight={600}
      />
    );

    const d = container.querySelector('[data-testid="explorer-edge-hitbox"]')!.getAttribute('d')!;
    const parentBottom = TOP_PAD + CELL_NODE_OFFSET_Y + nodeHeightForTrack(longTitle);
    expect(d).toMatch(new RegExp(`M [\\d.]+ ${parentBottom}`));
  });

  it('long title without metadata prefix produces same edge height as short title', () => {
    const noPrefix = 'A'.repeat(60);
    const parent = makeNode({ node_id: 'n1', level: 0, col_index: 0,
      track: { id: 100, title: noPrefix, artist_names: [], bpm: 120, key: 'Am', camelot_code: '1A', genre: null, label: null, energy: null, date_added: null },
    });
    const child = makeNode({ id: 2, node_id: 'n2', level: 1, col_index: 0, track_id: 101,
      track: { id: 101, title: 'B', artist_names: [], bpm: 128, key: 'Cm', camelot_code: '5A', genre: null, label: null, energy: null, date_added: null },
    });

    const { container } = render(
      <ExplorerEdgeLayer
        edges={[makeEdge()]} nodes={[parent, child]}
        edgeScores={new Map()} loadingEdgeKeys={new Set()}
        selectedEdgeId={null}
        onEdgeClick={vi.fn()} onDeleteEdge={vi.fn()}
        totalWidth={1000} totalHeight={600}
      />
    );

    const d = container.querySelector('[data-testid="explorer-edge-hitbox"]')!.getAttribute('d')!;
    const parentBottom = TOP_PAD + CELL_NODE_OFFSET_Y + nodeHeightForTrack(noPrefix);
    expect(d).toMatch(new RegExp(`M [\\d.]+ ${parentBottom}`));
  });

  it('nodeHeightForTrack matches Cell cleanTitle + nodeHeight for all title shapes', () => {
    const titles = [
      'Short',
      '[8A - Aminor - 128] Track With Prefix And Long Name Here',
      'A'.repeat(60),
      '[1B] Tiny',
      '',
    ];
    for (const raw of titles) {
      expect(nodeHeightForTrack(raw)).toBe(nodeHeight(cleanTitle(raw)));
    }
  });

  it('stripTitlePrefix removes metadata but does not truncate', () => {
    expect(stripTitlePrefix('[8A - Aminor - 128] My Long Title Here For Testing')).toBe(
      'My Long Title Here For Testing',
    );
    expect(stripTitlePrefix('No Prefix')).toBe('No Prefix');
    expect(stripTitlePrefix('[1B] Tiny')).toBe('Tiny');
  });

  it('edge SVG has z-index above levels for clickability', () => {
    const parent = makeNode({ node_id: 'n1', level: 0, col_index: 0 });
    const child = makeNode({ id: 2, node_id: 'n2', level: 1, col_index: 0, track_id: 101,
      track: { id: 101, title: 'B', artist_names: [], bpm: 128, key: 'Cm', camelot_code: '5A', genre: null, label: null, energy: null, date_added: null },
    });

    const { container } = render(
      <ExplorerEdgeLayer
        edges={[makeEdge()]} nodes={[parent, child]}
        edgeScores={new Map()} loadingEdgeKeys={new Set()}
        selectedEdgeId={null}
        onEdgeClick={vi.fn()} onDeleteEdge={vi.fn()}
        totalWidth={1000} totalHeight={600}
      />
    );

    const svg = container.querySelector('.explorer-edge-svg') as SVGElement;
    expect(svg).toBeTruthy();
    expect(svg.style.zIndex).toBe('3');
  });

  it('edge child-top Y matches drag-origin formula (CELL_NODE_OFFSET_Y consistency)', () => {
    const parent = makeNode({ node_id: 'n1', level: 0, col_index: 0 });
    const child = makeNode({ id: 2, node_id: 'n2', level: 1, col_index: 0, track_id: 101,
      track: { id: 101, title: 'B', artist_names: [], bpm: 128, key: 'Cm', camelot_code: '5A', genre: null, label: null, energy: null, date_added: null },
    });

    const { container } = render(
      <ExplorerEdgeLayer
        edges={[makeEdge()]} nodes={[parent, child]}
        edgeScores={new Map()} loadingEdgeKeys={new Set()}
        selectedEdgeId={null}
        onEdgeClick={vi.fn()} onDeleteEdge={vi.fn()}
        totalWidth={1000} totalHeight={600}
      />
    );

    const d = container.querySelector('[data-testid="explorer-edge-hitbox"]')!.getAttribute('d')!;
    const V_GAP = 132;
    const LEVEL_HEIGHT = NODE_H_DEFAULT + V_GAP;
    const childTop = TOP_PAD + 1 * LEVEL_HEIGHT + CELL_NODE_OFFSET_Y;
    const dragOriginCY = TOP_PAD + 1 * LEVEL_HEIGHT + CELL_NODE_OFFSET_Y + NODE_H_DEFAULT / 2;
    expect(d).toMatch(new RegExp(`L [\\d.]+ ${childTop}$`));
    expect(dragOriginCY).toBe(childTop + NODE_H_DEFAULT / 2);
  });

  it('hitbox and delete interaction are preserved', () => {
    const onEdgeClick = vi.fn();
    const onDeleteEdge = vi.fn();
    const parent = makeNode({ node_id: 'n1', level: 0, col_index: 0 });
    const child = makeNode({ id: 2, node_id: 'n2', level: 1, col_index: 0, track_id: 101,
      track: { id: 101, title: 'B', artist_names: [], bpm: 128, key: 'Cm', camelot_code: '5A', genre: null, label: null, energy: null, date_added: null },
    });

    const { container } = render(
      <ExplorerEdgeLayer
        edges={[makeEdge()]} nodes={[parent, child]}
        edgeScores={new Map()} loadingEdgeKeys={new Set()}
        selectedEdgeId={1}
        onEdgeClick={onEdgeClick} onDeleteEdge={onDeleteEdge}
        totalWidth={1000} totalHeight={600}
      />
    );

    const hitbox = container.querySelector('[data-testid="explorer-edge-hitbox"]') as SVGElement;
    expect(hitbox).toBeTruthy();
    expect(hitbox.getAttribute('stroke')).toBe('transparent');
    expect(hitbox.getAttribute('stroke-width')).toBe('12');

    const deleteBtn = container.querySelector('[data-testid="explorer-edge-delete-btn"]');
    expect(deleteBtn).toBeTruthy();
    expect(deleteBtn!.getAttribute('aria-label')).toBe('Delete edge');
  });
});
