import type { LayoutPlace, Placement, WidgetId } from '../types'

export const WIDGET_IDS: WidgetId[] = [
  'browser',
  'matches',
  'pool',
  'explorer',
  'sequencer',
]

export const WIDGET_LABELS: Record<WidgetId, string> = {
  browser: 'Browser',
  matches: 'Matches',
  pool: 'Pool',
  explorer: 'Explorer',
  sequencer: 'Sequencer',
}

export const UNIT_PX = 8
export const MIN_W = 24
export const MIN_H = 12

export interface Bounds {
  cols: number
  rows: number
}

export const FALLBACK_BOUNDS: Bounds = { cols: 158, rows: 117 }

type FractionRect = { fx: number; fy: number; fw: number; fh: number }

const PRESET_FRACTIONS: Record<string, Record<string, FractionRect>> = {
  'Track DND fanout': {
    browser: { fx: 0, fy: 0, fw: 2 / 3, fh: 1 / 2 },
    pool: { fx: 2 / 3, fy: 0, fw: 1 / 3, fh: 1 / 2 },
    matches: { fx: 0, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
    explorer: { fx: 1 / 3, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
    sequencer: { fx: 2 / 3, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
  },
  'Pool curation': {
    pool: { fx: 0, fy: 0, fw: 2 / 3, fh: 1 / 2 },
    browser: { fx: 2 / 3, fy: 0, fw: 1 / 3, fh: 1 / 2 },
    sequencer: { fx: 0, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
    explorer: { fx: 1 / 3, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
    matches: { fx: 2 / 3, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
  },
  'Explorer sandbox': {
    explorer: { fx: 0, fy: 0, fw: 2 / 3, fh: 1 / 2 },
    browser: { fx: 2 / 3, fy: 0, fw: 1 / 3, fh: 1 / 2 },
    sequencer: { fx: 0, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
    pool: { fx: 1 / 3, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
    matches: { fx: 2 / 3, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
  },
  'Sequencer run': {
    browser: { fx: 0, fy: 0, fw: 1 / 3, fh: 1 / 2 },
    pool: { fx: 1 / 3, fy: 0, fw: 1 / 3, fh: 1 / 2 },
    explorer: { fx: 2 / 3, fy: 0, fw: 1 / 3, fh: 1 / 2 },
    sequencer: { fx: 0, fy: 1 / 2, fw: 2 / 3, fh: 1 / 2 },
    matches: { fx: 2 / 3, fy: 1 / 2, fw: 1 / 3, fh: 1 / 2 },
  },
}

export const PRESET_NAMES = Object.keys(PRESET_FRACTIONS)
export const DEFAULT_PRESET = 'Explorer sandbox'
export const CUSTOM_PRESET = 'Custom'

export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export function presetPlace(name: string, bounds: Bounds): LayoutPlace {
  const spec = PRESET_FRACTIONS[name]
  if (!spec) {
    return {}
  }
  const place: LayoutPlace = {}
  for (const id of WIDGET_IDS) {
    const f = spec[id]
    if (!f) {
      continue
    }
    const x = Math.round(f.fx * bounds.cols)
    const y = Math.round(f.fy * bounds.rows)
    place[id] = {
      x,
      y,
      w: Math.max(MIN_W, Math.round((f.fx + f.fw) * bounds.cols) - x),
      h: Math.max(MIN_H, Math.round((f.fy + f.fh) * bounds.rows) - y),
    }
  }
  return place
}

export function clampRect(p: Placement, bounds: Bounds): Placement {
  const w = Math.min(Math.max(Math.round(p.w), MIN_W), bounds.cols)
  const h = Math.min(Math.max(Math.round(p.h), MIN_H), bounds.rows)
  return {
    w,
    h,
    x: Math.min(Math.max(Math.round(p.x), 0), bounds.cols - w),
    y: Math.min(Math.max(Math.round(p.y), 0), bounds.rows - h),
  }
}

export function scaleRect(p: Placement, from: Bounds, to: Bounds): Placement {
  const sx = to.cols / from.cols
  const sy = to.rows / from.rows
  return clampRect(
    {
      x: Math.round(p.x * sx),
      y: Math.round(p.y * sy),
      w: Math.round(p.w * sx),
      h: Math.round(p.h * sy),
    },
    to,
  )
}

export function overlaps(a: Placement, b: Placement): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  )
}

export function firstFree(
  place: LayoutPlace,
  w: number,
  h: number,
  bounds: Bounds,
): Placement | null {
  const seated = WIDGET_IDS.map((id) => place[id]).filter(
    (p): p is Placement => !!p,
  )
  const xs = [0, ...seated.map((p) => p.x + p.w)].sort((a, b) => a - b)
  const ys = [0, ...seated.map((p) => p.y + p.h)].sort((a, b) => a - b)
  for (const y of ys) {
    if (y + h > bounds.rows) {
      continue
    }
    for (const x of xs) {
      if (x + w > bounds.cols) {
        continue
      }
      const candidate = { x, y, w, h }
      const clash = WIDGET_IDS.some((id) => {
        const other = place[id]
        return !!other && overlaps(candidate, other)
      })
      if (!clash) {
        return candidate
      }
    }
  }
  return null
}

export function resizeRect(
  place: LayoutPlace,
  id: WidgetId,
  edge: Edge,
  start: Placement,
  dx: number,
  dy: number,
  bounds: Bounds,
): Placement {
  const others = WIDGET_IDS.filter((other) => other !== id)
    .map((other) => place[other])
    .filter((p): p is Placement => !!p)

  let { x, y, w, h } = start
  if (edge.includes('w')) {
    const nx = Math.min(Math.max(start.x + dx, 0), start.x + start.w - MIN_W)
    w = start.x + start.w - nx
    x = nx
  }
  if (edge.includes('e')) {
    w = Math.min(Math.max(start.w + dx, MIN_W), bounds.cols - start.x)
  }
  if (edge.includes('n')) {
    const ny = Math.min(Math.max(start.y + dy, 0), start.y + start.h - MIN_H)
    h = start.y + start.h - ny
    y = ny
  }
  if (edge.includes('s')) {
    h = Math.min(Math.max(start.h + dy, MIN_H), bounds.rows - start.y)
  }

  const blocked = (r: Placement) => others.some((o) => overlaps(r, o))
  while (blocked({ x, y, w, h })) {
    if (edge.includes('w') && x < start.x) {
      x++
      w--
    } else if (edge.includes('e') && w > MIN_W) {
      w--
    } else if (edge.includes('n') && y < start.y) {
      y++
      h--
    } else if (edge.includes('s') && h > MIN_H) {
      h--
    } else {
      return start
    }
    if (w < MIN_W || h < MIN_H) {
      return start
    }
  }
  return { x, y, w, h }
}

export function moveRect(
  place: LayoutPlace,
  id: WidgetId,
  start: Placement,
  x: number,
  y: number,
  bounds: Bounds,
): Placement {
  const target = clampRect({ ...start, x, y }, bounds)
  const clash = WIDGET_IDS.some((other) => {
    if (other === id) {
      return false
    }
    const o = place[other]
    return !!o && overlaps(target, o)
  })
  return clash ? start : target
}

export function isReservedPresetName(name: string): boolean {
  const normalized = name.toLocaleLowerCase()
  return (
    normalized === CUSTOM_PRESET.toLocaleLowerCase() ||
    PRESET_NAMES.some((presetName) => presetName.toLocaleLowerCase() === normalized)
  )
}

export function hasDuplicatePresetName(
  names: string[],
  candidate: string,
  excludeName?: string,
): boolean {
  const normalized = candidate.toLocaleLowerCase()
  return names.some(
    (name) =>
      name !== excludeName && name.toLocaleLowerCase() === normalized,
  )
}
