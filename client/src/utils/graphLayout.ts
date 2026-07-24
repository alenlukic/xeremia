// Force-directed graph layout (Fruchterman–Reingold).
//
// The Explorer is a directed graph on a free canvas with no inherent ordering,
// so "auto-layout" is a physics simulation: every pair of nodes repels (spreads
// the graph out and separates disconnected components) while connected nodes
// attract (pulls related tracks together). The classic Fruchterman–Reingold
// model balances the two with an ideal edge length `k` and a cooling schedule
// that shrinks the maximum step each iteration so the system settles.
//
// The implementation is fully deterministic: the initial placement is a fixed
// circle (not random), and coincident nodes are separated with an index-derived
// nudge. Given the same inputs it always returns the same positions, which
// keeps it unit-testable.

export interface LayoutNodeInput {
  id: string
}

export interface LayoutEdgeInput {
  source: string
  target: string
}

export interface LayoutOptions {
  /** Number of simulation steps. More = closer to equilibrium. */
  iterations?: number
  /** Ideal distance between connected nodes (px). */
  idealDistance?: number
  /** Snap final coordinates to this grid increment (px). */
  gridSize?: number
  /** Padding kept between the top-left-most node and the origin (px). */
  margin?: number
  /** Node footprint (incl. desired gap) used by the overlap-removal pass. */
  nodeWidth?: number
  nodeHeight?: number
}

export interface Point {
  x: number
  y: number
}

const DEFAULTS = {
  // Ideal edge length is set generously relative to the ~210px-wide node cards
  // (which the point-based simulation treats as points) so connected nodes keep
  // a readable gap rather than overlapping.
  iterations: 400,
  idealDistance: 420,
  gridSize: 20,
  margin: 40,
  // Node footprint incl. gap (card is 210×48). The overlap-removal pass keeps
  // node *rectangles* this far apart.
  nodeWidth: 240,
  nodeHeight: 96,
}

// Push apart any overlapping node rectangles along their axis of least overlap.
// Force-directed layout treats nodes as points, so hubs and dense clusters can
// leave cards visually overlapping; this cheap post-pass separates them while
// disturbing the force layout as little as possible. Deterministic throughout.
function removeOverlaps(
  posX: number[],
  posY: number[],
  nodeW: number,
  nodeH: number,
): void {
  const n = posX.length
  for (let pass = 0; pass < 80; pass++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = posX[j] - posX[i]
        const dy = posY[j] - posY[i]
        const overlapX = nodeW - Math.abs(dx)
        const overlapY = nodeH - Math.abs(dy)
        if (overlapX <= 0 || overlapY <= 0) {
          continue
        }
        // Separate along whichever axis needs the smaller shift.
        if (overlapX < overlapY) {
          const dir = dx !== 0 ? Math.sign(dx) : i % 2 === 0 ? 1 : -1
          const shift = (overlapX / 2) * dir
          posX[i] -= shift
          posX[j] += shift
        } else {
          const dir = dy !== 0 ? Math.sign(dy) : i % 2 === 0 ? 1 : -1
          const shift = (overlapY / 2) * dir
          posY[i] -= shift
          posY[j] += shift
        }
        moved = true
      }
    }
    if (!moved) {
      break
    }
  }
}

export function forceDirectedLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  options: LayoutOptions = {},
): Map<string, Point> {
  const iterations = options.iterations ?? DEFAULTS.iterations
  const k = options.idealDistance ?? DEFAULTS.idealDistance
  const gridSize = options.gridSize ?? DEFAULTS.gridSize
  const margin = options.margin ?? DEFAULTS.margin

  const result = new Map<string, Point>()
  const n = nodes.length
  if (n === 0) {
    return result
  }
  if (n === 1) {
    result.set(nodes[0].id, { x: margin, y: margin })
    return result
  }

  // Bounded drawing frame. Confining the simulation to a fixed W×H area is the
  // step that keeps Fruchterman–Reingold compact: without it, a sparse graph's
  // repulsion pushes nodes outward almost without limit. The frame grows with
  // node count so denser graphs get proportionally more room.
  const frame = k * Math.sqrt(n)
  const cx = frame / 2
  const cy = frame / 2

  // Deterministic initial placement on a circle centered in the frame. A fixed
  // (non-random) layout avoids coincident-point singularities and makes the
  // result reproducible.
  const radius = frame * 0.35
  const posX = new Array<number>(n)
  const posY = new Array<number>(n)
  const idToIndex = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n
    posX[i] = cx + Math.cos(angle) * radius
    posY[i] = cy + Math.sin(angle) * radius
    idToIndex.set(nodes[i].id, i)
  }

  const edgePairs: [number, number][] = []
  for (const e of edges) {
    const s = idToIndex.get(e.source)
    const t = idToIndex.get(e.target)
    if (s !== undefined && t !== undefined && s !== t) {
      edgePairs.push([s, t])
    }
  }

  const dispX = new Array<number>(n)
  const dispY = new Array<number>(n)
  let temp = k
  const cooling = temp / (iterations + 1)

  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < n; i++) {
      dispX[i] = 0
      dispY[i] = 0
    }

    // Repulsion between every pair of nodes.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = posX[i] - posX[j]
        let dy = posY[i] - posY[j]
        let dist = Math.hypot(dx, dy)
        if (dist < 1e-4) {
          // Index-derived nudge keeps coincident nodes deterministic.
          dx = Math.cos(i * 2.399) * 0.01
          dy = Math.sin(i * 2.399) * 0.01
          dist = 0.01
        }
        const force = (k * k) / dist
        const ux = dx / dist
        const uy = dy / dist
        dispX[i] += ux * force
        dispY[i] += uy * force
        dispX[j] -= ux * force
        dispY[j] -= uy * force
      }
    }

    // Attraction along edges.
    for (const [s, t] of edgePairs) {
      const dx = posX[s] - posX[t]
      const dy = posY[s] - posY[t]
      let dist = Math.hypot(dx, dy)
      if (dist < 1e-4) {
        dist = 1e-4
      }
      const force = (dist * dist) / k
      const ux = dx / dist
      const uy = dy / dist
      dispX[s] -= ux * force
      dispY[s] -= uy * force
      dispX[t] += ux * force
      dispY[t] += uy * force
    }

    // Apply displacement, capped by the current temperature, then clamp back
    // into the frame so the graph cannot expand without bound.
    for (let i = 0; i < n; i++) {
      const len = Math.hypot(dispX[i], dispY[i])
      if (len > 0) {
        const step = Math.min(len, temp)
        posX[i] += (dispX[i] / len) * step
        posY[i] += (dispY[i] / len) * step
      }
      posX[i] = Math.min(frame, Math.max(0, posX[i]))
      posY[i] = Math.min(frame, Math.max(0, posY[i]))
    }

    temp = Math.max(0, temp - cooling)
  }

  // Post-pass: separate any node cards that still overlap.
  removeOverlaps(
    posX,
    posY,
    options.nodeWidth ?? DEFAULTS.nodeWidth,
    options.nodeHeight ?? DEFAULTS.nodeHeight,
  )

  // Normalize into positive space: translate the top-left-most node to
  // (margin, margin) and snap everything to the grid.
  let minX = Infinity
  let minY = Infinity
  for (let i = 0; i < n; i++) {
    if (posX[i] < minX) {
      minX = posX[i]
    }
    if (posY[i] < minY) {
      minY = posY[i]
    }
  }
  const snap = (v: number) => Math.round(v / gridSize) * gridSize
  for (let i = 0; i < n; i++) {
    result.set(nodes[i].id, {
      x: snap(posX[i] - minX + margin),
      y: snap(posY[i] - minY + margin),
    })
  }
  return result
}
