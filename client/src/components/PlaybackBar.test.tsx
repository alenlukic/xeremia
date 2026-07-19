import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { AudioPlayerProvider, useAudioPlayer } from '../hooks/useAudioPlayer'
import { PlaybackBar } from './PlaybackBar'

let mockPlay: ReturnType<typeof vi.fn>
let mockPause: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockPlay = vi.fn().mockResolvedValue(undefined)
  mockPause = vi.fn()

  let srcValue = ''
  let hasSrc = false

  const mockAudioElement: Record<string, unknown> = {
    play: mockPlay,
    pause: mockPause,
    volume: 0.8,
    currentTime: 0,
    duration: 0,
    error: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getAttribute: vi.fn((attr: string) =>
      attr === 'src' && hasSrc ? srcValue : null,
    ),
    removeAttribute: vi.fn((attr: string) => {
      if (attr === 'src') {
        srcValue = ''
        hasSrc = false
      }
    }),
    load: vi.fn(),
    canPlayType: vi.fn().mockReturnValue('probably'),
  }

  Object.defineProperty(mockAudioElement, 'src', {
    get: () => srcValue,
    set: (v: string) => {
      srcValue = v
      hasSrc = true
    },
    configurable: true,
  })

  const origCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'audio') {
      return mockAudioElement as unknown as HTMLElement
    }
    return origCreateElement(tag)
  })
  vi.spyOn(window, 'fetch').mockResolvedValue({
    ok: true,
    headers: new Headers({ 'content-type': 'audio/mpeg' }),
  } as Response)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function PlayTrigger() {
  const { play } = useAudioPlayer()
  return (
    <button data-testid="trigger-play" onClick={() => play(1, 'Test Track')}>
      Trigger
    </button>
  )
}

function renderBar() {
  return render(
    <AudioPlayerProvider>
      <PlayTrigger />
      <PlaybackBar />
    </AudioPlayerProvider>,
  )
}

describe('PlaybackBar', () => {
  it('renders nothing when no track is loaded', () => {
    renderBar()
    expect(screen.queryByLabelText('Close playback bar')).toBeNull()
  })

  it('shows the close button while a track is playing', async () => {
    renderBar()
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-play'))
    })
    expect(screen.getByLabelText('Pause')).toBeInTheDocument()
    expect(screen.getByLabelText('Close playback bar')).toBeInTheDocument()
  })

  it('close stops the preview and dismisses the bar', async () => {
    renderBar()
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-play'))
    })
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Close playback bar'))
    })
    expect(mockPause).toHaveBeenCalled()
    expect(screen.queryByLabelText('Close playback bar')).toBeNull()
    expect(screen.queryByText('Test Track')).toBeNull()
  })
})
