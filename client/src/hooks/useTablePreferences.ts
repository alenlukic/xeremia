import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchTablePreferences, updateTablePreferences } from '../api/http'
import type { TableId } from '../types'
import {
  TABLE_IDS,
  defaultTableConfig,
  normalizeTableConfig,
  toApiPayload,
  type NormalizedTableConfig,
} from '../tablePreferences'

const SAVE_DEBOUNCE_MS = 400

export interface TablePreferencesState {
  loading: boolean
  saving: Record<TableId, boolean>
  error: string | null
  saveErrors: Partial<Record<TableId, string>>
  configs: Record<TableId, NormalizedTableConfig>
  setVisibility: (tableId: TableId, columnId: string, visible: boolean) => void
  toggleVisibility: (tableId: TableId, columnId: string) => void
  reorderColumn: (tableId: TableId, draggedId: string, targetId: string) => void
  insertColumnAfter: (
    tableId: TableId,
    afterColumnId: string,
    columnId: string,
  ) => void
  setColumnWidth: (tableId: TableId, columnId: string, width: number) => void
  flushColumnWidth: (tableId: TableId, columnId: string, width: number) => void
  moveColumn: (tableId: TableId, columnId: string, direction: -1 | 1) => void
  retrySave: (tableId: TableId) => void
}

function buildDefaultConfigs(): Record<TableId, NormalizedTableConfig> {
  return {
    search: defaultTableConfig('search'),
    matches: defaultTableConfig('matches'),
    tracklist: defaultTableConfig('tracklist'),
    pool: defaultTableConfig('pool'),
  }
}

export function useTablePreferences(): TablePreferencesState {
  const [configs, setConfigs] =
    useState<Record<TableId, NormalizedTableConfig>>(buildDefaultConfigs)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<Record<TableId, boolean>>({
    search: false,
    matches: false,
    tracklist: false,
    pool: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [saveErrors, setSaveErrors] = useState<
    Partial<Record<TableId, string>>
  >({})

  const configsRef = useRef(configs)
  configsRef.current = configs

  const timersRef = useRef<
    Partial<Record<TableId, ReturnType<typeof setTimeout>>>
  >({})
  const pendingRef = useRef<Partial<Record<TableId, NormalizedTableConfig>>>({})

  const persistTable = useCallback(async (tableId: TableId) => {
    const config = pendingRef.current[tableId] ?? configsRef.current[tableId]
    setSaving((prev) => ({ ...prev, [tableId]: true }))
    setSaveErrors((prev) => {
      const next = { ...prev }
      delete next[tableId]
      return next
    })
    try {
      await updateTablePreferences(tableId, toApiPayload(config))
      delete pendingRef.current[tableId]
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to save table preferences'
      setSaveErrors((prev) => ({ ...prev, [tableId]: message }))
    } finally {
      setSaving((prev) => ({ ...prev, [tableId]: false }))
    }
  }, [])

  const scheduleSave = useCallback(
    (tableId: TableId, immediate = false) => {
      const existing = timersRef.current[tableId]
      if (existing) {
        clearTimeout(existing)
      }
      if (immediate) {
        void persistTable(tableId)
        return
      }
      timersRef.current[tableId] = setTimeout(() => {
        delete timersRef.current[tableId]
        void persistTable(tableId)
      }, SAVE_DEBOUNCE_MS)
    },
    [persistTable],
  )

  useEffect(() => {
    let cancelled = false
    fetchTablePreferences()
      .then((data) => {
        if (cancelled) {
          return
        }
        const next = buildDefaultConfigs()
        for (const pref of data.preferences) {
          if (TABLE_IDS.includes(pref.table_id)) {
            next[pref.table_id] = normalizeTableConfig(pref.table_id, pref)
          }
        }
        setConfigs(next)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load table preferences',
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    const timers = timersRef.current
    return () => {
      cancelled = true
      for (const timer of Object.values(timers)) {
        if (timer) {
          clearTimeout(timer)
        }
      }
    }
  }, [])

  const updateConfig = useCallback(
    (
      tableId: TableId,
      updater: (prev: NormalizedTableConfig) => NormalizedTableConfig,
      immediate = false,
    ) => {
      // Compute the next config synchronously from the ref so both the pending
      // save payload and an immediate flush see the post-change value. Putting
      // this only inside a setState updater raced with scheduleSave(immediate),
      // while reading the ref after setState (without writing it first) used to
      // drop the latest toggle on debounced save.
      const prevConfigs = configsRef.current
      const nextConfig = updater(prevConfigs[tableId])
      const merged = { ...prevConfigs, [tableId]: nextConfig }
      configsRef.current = merged
      pendingRef.current[tableId] = nextConfig
      setConfigs(merged)
      scheduleSave(tableId, immediate)
    },
    [scheduleSave],
  )

  const setVisibility = useCallback(
    (tableId: TableId, columnId: string, visible: boolean) => {
      updateConfig(tableId, (prev) => ({
        ...prev,
        columnVisibility: { ...prev.columnVisibility, [columnId]: visible },
      }))
    },
    [updateConfig],
  )

  const toggleVisibility = useCallback(
    (tableId: TableId, columnId: string) => {
      updateConfig(tableId, (prev) => ({
        ...prev,
        columnVisibility: {
          ...prev.columnVisibility,
          [columnId]: prev.columnVisibility[columnId] === false,
        },
      }))
    },
    [updateConfig],
  )

  const reorderColumn = useCallback(
    (tableId: TableId, draggedId: string, targetId: string) => {
      if (draggedId === targetId) {
        return
      }
      updateConfig(tableId, (prev) => {
        const order = [...prev.columnOrder]
        const fromIdx = order.indexOf(draggedId)
        const toIdx = order.indexOf(targetId)
        if (fromIdx === -1 || toIdx === -1) {
          return prev
        }
        order.splice(fromIdx, 1)
        order.splice(toIdx, 0, draggedId)
        return { ...prev, columnOrder: order }
      })
    },
    [updateConfig],
  )

  const insertColumnAfter = useCallback(
    (tableId: TableId, afterColumnId: string, columnId: string) => {
      updateConfig(tableId, (prev) => {
        const order = [...prev.columnOrder]
        const afterIdx = order.indexOf(afterColumnId)
        if (afterIdx === -1 || !order.includes(columnId)) {
          return prev
        }
        const existingIdx = order.indexOf(columnId)
        if (existingIdx !== -1) {
          order.splice(existingIdx, 1)
        }
        const insertAt = order.indexOf(afterColumnId)
        order.splice(insertAt + 1, 0, columnId)
        return {
          ...prev,
          columnOrder: order,
          columnVisibility: { ...prev.columnVisibility, [columnId]: true },
        }
      })
    },
    [updateConfig],
  )

  const setColumnWidth = useCallback(
    (tableId: TableId, columnId: string, width: number) => {
      updateConfig(tableId, (prev) => ({
        ...prev,
        columnWidths: { ...prev.columnWidths, [columnId]: width },
      }))
    },
    [updateConfig],
  )

  const flushColumnWidth = useCallback(
    (tableId: TableId, columnId: string, width: number) => {
      updateConfig(
        tableId,
        (prev) => ({
          ...prev,
          columnWidths: { ...prev.columnWidths, [columnId]: width },
        }),
        true,
      )
    },
    [updateConfig],
  )

  const moveColumn = useCallback(
    (tableId: TableId, columnId: string, direction: -1 | 1) => {
      updateConfig(tableId, (prev) => {
        const order = [...prev.columnOrder]
        const idx = order.indexOf(columnId)
        const target = idx + direction
        if (idx === -1 || target < 0 || target >= order.length) {
          return prev
        }
        const tmp = order[idx]
        order[idx] = order[target]
        order[target] = tmp
        return { ...prev, columnOrder: order }
      })
    },
    [updateConfig],
  )

  const retrySave = useCallback(
    (tableId: TableId) => {
      void persistTable(tableId)
    },
    [persistTable],
  )

  return useMemo(
    () => ({
      loading,
      saving,
      error,
      saveErrors,
      configs,
      setVisibility,
      toggleVisibility,
      reorderColumn,
      insertColumnAfter,
      setColumnWidth,
      flushColumnWidth,
      moveColumn,
      retrySave,
    }),
    [
      loading,
      saving,
      error,
      saveErrors,
      configs,
      setVisibility,
      toggleVisibility,
      reorderColumn,
      insertColumnAfter,
      setColumnWidth,
      flushColumnWidth,
      moveColumn,
      retrySave,
    ],
  )
}
