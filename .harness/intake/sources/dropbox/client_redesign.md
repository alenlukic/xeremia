# STATUS: DRAFT
_note to agent: do not ingest this yet_


# Motivation

- Two fundamental user stories for the client: 1) browse library; 2) create set
- Implication: anchor UX around these use cases; enable easy switching; each one is a first class experience

# Low-Touch Solution
- When user navigates to "Explorer" tab, an accordion bar appears to the right of the track table (same style as the Pool accordion bar in the Set tab)
- If the user clicks it, the track table collapses all the way to the left, and the Tracklist + Pool components expand out (same layout as in Set); should support same behavior as in Set (i.e. searching for tracks, dragging items from Tracklist or Pool to Explorer graph); changes should reflect in Set tab (easiest to just render one component for each and then display them in both Set and here)
- Navigating to another tab -> automatically restores track table; the accordion bar should only be present when in the Explorer tab
