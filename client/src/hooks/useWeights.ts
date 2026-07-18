import { useState, useEffect, useCallback, useRef } from 'react'
import type { WeightsResponse } from '../types'
import { fetchWeights, fetchDefaultWeights, updateWeights } from '../api/http'

interface WeightsState {
  weights: Record<string, number>
  serverState: WeightsResponse | null
  loading: boolean
  error: string | null
  saving: boolean
  saveSuccess: boolean
  setWeight: (factor: string, value: number) => void
  rawSum: number
  isSumValid: boolean
  warningMessage: string | null
  normalizeWeights: () => void
  resetWeights: () => void
}

const FUSION_KEY_PREFIX = 'FUSION_'
const isFusionKey = (k: string) => k.startsWith(FUSION_KEY_PREFIX)

function normalizeToHundred(
  weights: Record<string, number>,
): Record<string, number> {
  const mainEntries = Object.entries(weights).filter(([k]) => !isFusionKey(k))
  const fusionEntries = Object.entries(weights).filter(([k]) => isFusionKey(k))
  const sum = mainEntries.reduce((s, [, v]) => s + v, 0)
  if (sum === 0) {
    return { ...weights }
  }

  const scaled = mainEntries.map(([key, v]) => {
    const ideal = (v / sum) * 100
    return {
      key,
      floored: Math.floor(ideal),
      remainder: ideal - Math.floor(ideal),
    }
  })

  let remaining = 100 - scaled.reduce((s, e) => s + e.floored, 0)
  const sorted = [...scaled].sort(
    (a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key),
  )

  const result: Record<string, number> = {}
  for (const entry of scaled) {
    result[entry.key] = entry.floored
  }
  for (const entry of sorted) {
    if (remaining <= 0) {
      break
    }
    result[entry.key]++
    remaining--
  }
  for (const [k, v] of fusionEntries) {
    result[k] = v
  }
  return result
}

export function useWeights(onSaveSuccess?: () => void): WeightsState {
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [serverState, setServerState] = useState<WeightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveVersionRef = useRef(0)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSaveSuccessRef = useRef(onSaveSuccess)
  useEffect(() => {
    onSaveSuccessRef.current = onSaveSuccess
  }, [onSaveSuccess])

  useEffect(() => {
    fetchWeights()
      .then((data) => {
        setServerState(data)
        setWeights(data.raw_weights)
        setError(null)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load weights')
      })
      .finally(() => setLoading(false))
  }, [])

  const persistWeights = useCallback((updated: Record<string, number>) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current)
    }
    setSaveSuccess(false)
    setSaving(true)
    const version = ++saveVersionRef.current
    debounceRef.current = setTimeout(() => {
      updateWeights(updated)
        .then((data) => {
          if (saveVersionRef.current === version) {
            setServerState(data)
            setSaveSuccess(true)
            successTimerRef.current = setTimeout(
              () => setSaveSuccess(false),
              2000,
            )
          }
          setError(null)
          onSaveSuccessRef.current?.()
        })
        .catch((err) => {
          setError(
            err instanceof Error ? err.message : 'Failed to save weights',
          )
        })
        .finally(() => {
          if (saveVersionRef.current === version) {
            setSaving(false)
          }
        })
    }, 500)
  }, [])

  // Mirror of `weights` so setWeight can compute the next value without
  // running side effects (persistWeights) inside a state updater, which must
  // stay pure (StrictMode invokes updaters twice).
  const weightsRef = useRef(weights)
  useEffect(() => {
    weightsRef.current = weights
  }, [weights])

  const setWeight = useCallback(
    (factor: string, value: number) => {
      const prev = weightsRef.current
      if (prev[factor] === value) {
        return
      }
      const next = { ...prev, [factor]: value }
      weightsRef.current = next
      setWeights(next)
      persistWeights(next)
    },
    [persistWeights],
  )

  const rawSum = Object.entries(weights)
    .filter(([k]) => !isFusionKey(k))
    .reduce((s, [, v]) => s + v, 0)
  const isSumValid = Math.abs(rawSum - 100) < 0.01
  const warningMessage =
    serverState && !serverState.is_sum_valid ? serverState.message : null
  const displayWarning = isSumValid
    ? null
    : (warningMessage ??
      `Weights sum to ${Number(rawSum.toFixed(1))}; target is 100`)

  const normalizeWeights = useCallback(() => {
    const normalized = normalizeToHundred(weights)
    setWeights(normalized)
    persistWeights(normalized)
  }, [weights, persistWeights])

  const resetWeights = useCallback(() => {
    fetchDefaultWeights()
      .then((defaults) => {
        setWeights(defaults)
        persistWeights(defaults)
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch defaults',
        )
      })
  }, [persistWeights])

  return {
    weights,
    serverState,
    loading,
    error,
    saving,
    saveSuccess,
    setWeight,
    rawSum,
    isSumValid,
    warningMessage: displayWarning,
    normalizeWeights,
    resetWeights,
  }
}
