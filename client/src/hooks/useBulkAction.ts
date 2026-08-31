import { useCallback, useEffect, useRef, useState } from 'react'

export interface BulkProgress {
  label: string
  done: number
  total: number
}

/**
 * Run a per-track action across a selection, one at a time, reporting how far
 * it has got.
 *
 * These actions are a request per track, so a selection of any size takes long
 * enough that silence reads as a hang. The caller renders {@link progress}
 * beside the action instead, and the runner refuses to start a second pass
 * while one is in flight — a double-click on "Remove" must not fire two
 * overlapping sweeps over the same rows.
 */
export function useBulkAction() {
  const [progress, setProgress] = useState<BulkProgress | null>(null)
  const runningRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const run = useCallback(
    async (
      label: string,
      ids: number[],
      each: (id: number) => unknown | Promise<unknown>,
      onDone?: () => void,
    ) => {
      if (runningRef.current || ids.length === 0) {
        return
      }
      runningRef.current = true
      setProgress({ label, done: 0, total: ids.length })
      try {
        for (let i = 0; i < ids.length; i++) {
          await each(ids[i])
          if (!mountedRef.current) {
            return
          }
          setProgress({ label, done: i + 1, total: ids.length })
        }
        onDone?.()
      } finally {
        runningRef.current = false
        if (mountedRef.current) {
          setProgress(null)
        }
      }
    },
    [],
  )

  return { progress, running: progress !== null, run }
}
