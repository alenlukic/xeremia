import { describe, it, expect } from 'vitest'
import { forceDirectedLayout } from './graphLayout'

describe('forceDirectedLayout', () => {
  it('returns an empty map for no nodes', () => {
    expect(forceDirectedLayout([], []).size).toBe(0)
  })

  it('places a single node at the margin', () => {
    const out = forceDirectedLayout([{ id: 'a' }], [], { margin: 40 })
    expect(out.get('a')).toEqual({ x: 40, y: 40 })
  })

  it('produces finite, grid-snapped coordinates', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'd' },
    ]
    const out = forceDirectedLayout(nodes, edges, { gridSize: 20 })
    for (const p of out.values()) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(p.x % 20).toBe(0)
      expect(p.y % 20).toBe(0)
    }
  })

  it('separates two connected nodes to roughly the ideal distance', () => {
    const out = forceDirectedLayout([{ id: 'a' }, { id: 'b' }], [
      { source: 'a', target: 'b' },
    ])
    const a = out.get('a')!
    const b = out.get('b')!
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    // With only two nodes the equilibrium sits near the ideal distance (320).
    expect(dist).toBeGreaterThan(150)
    expect(dist).toBeLessThan(600)
  })

  it('does not produce NaN when all nodes start coincident', () => {
    // Inputs carry no coordinates; the algorithm seeds its own positions, but
    // this also guards the internal coincident-node nudge path.
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const out = forceDirectedLayout(nodes, [], { iterations: 50 })
    for (const p of out.values()) {
      expect(Number.isNaN(p.x)).toBe(false)
      expect(Number.isNaN(p.y)).toBe(false)
    }
  })

  it('is deterministic for identical inputs', () => {
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const edges = [{ source: 'a', target: 'b' }]
    const first = forceDirectedLayout(nodes, edges)
    const second = forceDirectedLayout(nodes, edges)
    expect([...first.entries()]).toEqual([...second.entries()])
  })

  it('keeps disconnected components apart', () => {
    // Two isolated pairs; repulsion should push the pairs away from each other.
    const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'c', target: 'd' },
    ]
    const out = forceDirectedLayout(nodes, edges)
    const a = out.get('a')!
    const c = out.get('c')!
    expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeGreaterThan(100)
  })

  it('leaves no overlapping node cards', () => {
    // A hub connected to many leaves is the worst case for point-based layout;
    // the overlap-removal pass must still separate every card.
    const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}` }))
    const edges = Array.from({ length: 11 }, (_, i) => ({
      source: 'n0',
      target: `n${i + 1}`,
    }))
    const out = forceDirectedLayout(nodes, edges, {
      nodeWidth: 240,
      nodeHeight: 96,
    })
    const pts = [...out.values()]
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const overlapX = 240 - Math.abs(pts[i].x - pts[j].x)
        const overlapY = 96 - Math.abs(pts[i].y - pts[j].y)
        // No pair may overlap on both axes simultaneously.
        expect(overlapX > 0 && overlapY > 0).toBe(false)
      }
    }
  })

  it('ignores edges that reference unknown nodes', () => {
    const out = forceDirectedLayout([{ id: 'a' }, { id: 'b' }], [
      { source: 'a', target: 'ghost' },
    ])
    expect(out.size).toBe(2)
    for (const p of out.values()) {
      expect(Number.isFinite(p.x)).toBe(true)
    }
  })
})
