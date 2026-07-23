import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('getDeviceHash', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('persists a device id and returns a stable hashed value', async () => {
    const { getDeviceHash } = await import('./deviceId')
    const first = getDeviceHash()
    const second = getDeviceHash()
    expect(first).toMatch(/^[0-9a-f]+$/)
    expect(second).toBe(first)
    expect(localStorage.getItem('xeremia-device-id')).toBeTruthy()
  })

  it('produces different hashes for different stored device ids', async () => {
    localStorage.setItem('xeremia-device-id', 'device-a')
    const { getDeviceHash: hashA } = await import('./deviceId')
    const a = hashA()

    vi.resetModules()
    localStorage.setItem('xeremia-device-id', 'device-b')
    const { getDeviceHash: hashB } = await import('./deviceId')
    const b = hashB()

    expect(a).not.toBe(b)
  })
})
