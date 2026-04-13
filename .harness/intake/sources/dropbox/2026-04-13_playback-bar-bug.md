# BUG REPORT

- Impacted feature(s): client -> Set -> Tracklist/Pool; audio playback control bar
- Current behavior: When the audio playback control bar is visible, it covers the bottom of the Tracklist and Pool tables non-reactively; i.e. when the lists are long enough, the items on the bottom of the lists are covered, even when scrolling down to the end.
- Expected behavior: Audio playback control bar must not cover other elements in a way that renders them totally inaccessible.