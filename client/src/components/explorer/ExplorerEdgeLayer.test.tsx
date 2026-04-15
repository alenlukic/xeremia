import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ExplorerEdgeLayer } from './ExplorerEdgeLayer';
import { nodeHeightForTrack, cleanTitle, nodeHeight } from '../../utils/explorer';
import type { ExplorerNode, ExplorerEdge } from '../../types';

function makeNode(overrides: Partial<ExplorerNode> = {}): ExplorerNode {
  return {
    id: 1, set_id: 1, tree_id: 1, node_id: 'n1',
    track_id: 100, level: 0, col_index: 0,
    track: { id: 100, title: 'Short', artist_names: [], bpm: 120, key: 'Am', camelot_code: '1A' },
    ...overrides,
  };
}

function makeEdge(overrides: Partial<ExplorerEdge> = {}): ExplorerEdge {
  return { id: 1, set_id: 1, tree_id: 1, parent_node_id: 'n1', child_node_id: 'n2', ...overrides };
}

const NODE_W = 203;
const SLOT_W = 292;
const NODE_H = 27;
const TOP_PAD = 32;
const LABEL_W = 32;
const CELL_NODE_OFFSET_Y = 43;

function expectedCenterX(colIndex: number): number {
  return LABEL_W + colIndex * SLOT_W + (SLOT_W - NODE_W) / 2 + NODE_W / 2;
}

describe('ExplorerEdgeLayer', () => {
  it('edge path starts at parent center-x and ends at child center-x', () => {
    const parent = makeNode({ node_id: 'n1', level: 0, col_index: 0 });
    const child = makeNode({ id: 2, node_id: 'n2', level: 1, col_index: 1, track_id: 101,
      track: { id: 101, title: 'B', artist_names: [], bpm: 128, key: 'Cm', camelot_code: '5A' },
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

    const parentCenterX = expectedCenterX(0);
    const childCenterX = expectedCenterX(1);

    expect(d).toContain(`M ${parentCenterX} `);
    expect(d).toContain(` L ${childCenterX} `);
  });

  it('edge path connects parent bottom to child top', () => {
    const parent = makeNode({ node_id: 'n1', level: 0, col_index: 0 });
    const child = makeNode({ id: 2, node_id: 'n2', level: 1, col_index: 0, track_id: 101,
      track: { id: 101, title: 'B', artist_names: [], bpm: 128, key: 'Cm', camelot_code: '5A' },
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
    const parentBottom = TOP_PAD + 0 * (NODE_H + V_GAP) + CELL_NODE_OFFSET_Y + NODE_H;
    const childTop = TOP_PAD + 1 * (NODE_H + V_GAP) + CELL_NODE_OFFSET_Y;

    expect(d).toMatch(new RegExp(`M \\d+ ${parentBottom}`));
    expect(d).toMatch(new RegExp(`L \\d+ ${childTop}$`));
  });

  it('long-title parent uses same height as rendered cell (NODE_H_DEFAULT)', () => {
    const longTitle = '[8A - Aminor - 128] ' + 'A'.repeat(50);
    const parent = makeNode({ node_id: 'n1', level: 0, col_index: 0,
      track: { id: 100, title: longTitle, artist_names: [], bpm: 120, key: 'Am', camelot_code: '1A' },
    });
    const child = makeNode({ id: 2, node_id: 'n2', level: 1, col_index: 0, track_id: 101,
      track: { id: 101, title: 'B', artist_names: [], bpm: 128, key: 'Cm', camelot_code: '5A' },
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
    const parentBottom = TOP_PAD + 0 * (NODE_H + V_GAP) + CELL_NODE_OFFSET_Y + NODE_H;
    expect(d).toMatch(new RegExp(`M \\d+ ${parentBottom}`));
  });

  it('long title without metadata prefix produces same edge height as short title', () => {
    const noPrefix = 'A'.repeat(60);
    const parent = makeNode({ node_id: 'n1', level: 0, col_index: 0,
      track: { id: 100, title: noPrefix, artist_names: [], bpm: 120, key: 'Am', camelot_code: '1A' },
    });
    const child = makeNode({ id: 2, node_id: 'n2', level: 1, col_index: 0, track_id: 101,
      track: { id: 101, title: 'B', artist_names: [], bpm: 128, key: 'Cm', camelot_code: '5A' },
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
    const parentBottom = TOP_PAD + 0 * (NODE_H + V_GAP) + CELL_NODE_OFFSET_Y + NODE_H;
    expect(d).toMatch(new RegExp(`M \\d+ ${parentBottom}`));
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

  it('hitbox and delete interaction are preserved', () => {
    const onEdgeClick = vi.fn();
    const onDeleteEdge = vi.fn();
    const parent = makeNode({ node_id: 'n1', level: 0, col_index: 0 });
    const child = makeNode({ id: 2, node_id: 'n2', level: 1, col_index: 0, track_id: 101,
      track: { id: 101, title: 'B', artist_names: [], bpm: 128, key: 'Cm', camelot_code: '5A' },
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
