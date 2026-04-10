# Customer Persona Spec

## Status
Active — populated by SME Red Team from codebase evidence and domain analysis.

## Target User

**Primary persona: The Library-Obsessed Technical DJ**

A semi-professional to professional DJ who:
- Maintains a curated local file library (hundreds to low thousands of tracks)
- Uses **Mixed In Key** for key/energy analysis and **Rekordbox** for performance prep and CDJ/XDJ USB export
- Acquires music from Beatport, Bandcamp, promo pools, and direct downloads (not streaming-primary)
- Is comfortable running Python, PostgreSQL, Docker, and CLI tools on macOS or Linux
- Cares deeply about transition quality beyond simple key matching — wants to account for genre, mood, energy, vocal clashes, and timbral similarity
- Prepares sets methodically rather than improvising entirely live

**Secondary persona: The Programmer-DJ**

A software developer who DJs as a serious hobby or semi-professionally and wants to:
- Build custom tooling around their music library
- Experiment with audio analysis and scoring algorithms
- Extend or modify the matching system via code

## Primary Jobs to Be Done

1. **"What should I play next?"** — Given a track on deck, find the best transition candidates considering harmonic compatibility, tempo, energy flow, genre coherence, mood continuity, and vocal/instrumental balance
2. **"Prepare my library for analysis"** — Take newly downloaded tracks through metadata enrichment, key/BPM analysis, and ingestion into a structured database
3. **"Tune my matching criteria"** — Adjust the relative importance of scoring factors to match personal mixing style (e.g., prioritize mood continuity over genre similarity for ambient sets, or weight BPM heavily for techno)
4. **"Browse and explore my collection"** — Filter and search the library by key, BPM range, genre, and other attributes to discover tracks for specific set contexts

## Domain Vocabulary and Mental Model

| Term | Meaning to the user |
|------|---------------------|
| Camelot code | Simplified key notation (e.g., 8A, 12B) from the Camelot Wheel; adjacent codes mix harmonically |
| BPM | Beats per minute — the fundamental tempo metric; DJs match or gradually shift BPM between tracks |
| Energy (MIK) | Mixed In Key's 1–10 energy rating; represents intensity/drive, used to plan energy arcs in a set |
| Transition | The mix point between two tracks; quality depends on harmonic, rhythmic, and timbral compatibility |
| Key clash | When two tracks in incompatible keys play simultaneously, producing dissonance |
| Vocal clash | When two tracks with prominent vocals overlap, creating a muddy or distracting mix |
| Cosine Similarity | API factor name for the 75-D descriptor similarity score (internal: `DESCRIPTOR_SIMILARITY`). Not called "Similarity" or "Spectral Similarity" in the product |
| Crate / collection | The DJ's full library or a curated subset for a specific gig or genre |
| Set | An ordered sequence of tracks for a performance, typically 1–4 hours |
| USB export | Preparing a formatted USB drive with tracks and metadata for use on CDJ/XDJ hardware |

## Trust Requirements

- **Key and BPM accuracy is paramount.** If the tool's key data is wrong, all harmonic matching is wrong. The user needs to know where key/BPM values come from and whether sources agree.
- **Scoring transparency.** The user needs to understand why a match scored high or low. Black-box scores without factor breakdowns are not trusted.
- **Configuration correctness.** If the tool documents that weights should sum to 1.0, they must actually sum to 1.0. Precision is expected.
- **No data loss.** Audio files are irreplaceable purchased assets. The ingestion pipeline must never corrupt, overwrite, or lose files.
- **Deterministic behavior.** Same inputs should produce same outputs. The user will test the tool against tracks they know well and verify that results match their intuition.

## Main Workflow Goals

1. **Weekly library maintenance:** Download 10–30 new tracks → metadata agent enrichment → MIK analysis → Rekordbox import → ingestion pipeline → feature extraction → library is ready
2. **Set preparation:** Pick a starting track → find matches → follow transition chains (A→B→C via "Use as source") → build a named set → verify transitions → export to m3u8. *(Server-persisted set workspace shipped April 2026: PostgreSQL-backed sets with pool, tracklist, and visual explorer canvas. Per-track notes on tracklist entries for cue/mix reminders. Transition scoring, reorder, and m3u8 export. USB/Rekordbox handoff remains deferred.)*
3. **Weight experimentation:** Adjust scoring weights for different set styles (high-energy techno vs deep house vs eclectic) → see how results change → save preferred weight profiles. *(Fusion subweights now materially affect live scoring as of April 2026.)*
4. **Collection audit:** Browse by key/BPM/genre to identify gaps ("I have nothing in 4A around 124 BPM") or oversaturation

## Major Fears / Friction / Failure Sensitivities

- **Analysis dead end:** The tool finds great matches but there's no way to get them into Rekordbox for actual performance. Manual re-searching defeats the purpose. *(Partially addressed: m3u8 export and transition chaining shipped April 2026. Direct Rekordbox/USB integration remains the gap.)*
- **Wrong key data:** A match scored 95 that sounds terrible because the key analysis was wrong. This destroys confidence in the entire system.
- **Setup complexity:** PostgreSQL + Docker + Python + ONNX models + .env configuration is a significant barrier. If setup fails at any step, the user may abandon the tool entirely.
- **Silent failures:** The UI showing "no matches" when the real problem is a backend error. The user can't tell if the tool is broken or if there genuinely aren't good matches. *(Partially addressed: error states now distinguished from empty results on Browse and Matches surfaces as of April 2026. MatchDetail error rendering and retry UX remain deferred.)*
- **Stale data:** Running feature extraction on 500 tracks takes time. If the user adds tracks and forgets to re-extract, matches for new tracks are degraded (missing descriptors/traits score 0.0 on those factors).
- **Duplicates polluting results:** The same track appearing multiple times in match results wastes slots and looks unprofessional.

## What "Success" Looks Like

From the customer's perspective, dj-tools succeeds when:
- They can go from "I just downloaded 20 new tracks" to "they're fully analyzed and appearing in match results" in under 30 minutes of active work
- Match results for a well-known track align with their DJ intuition ("yes, those tracks would actually work together")
- They discover non-obvious matches they wouldn't have found manually — tracks that share mood/energy/texture despite being in different genres
- Weight tuning produces meaningfully different results for different set styles
- The transition chain from track A → B → C → D flows naturally when actually mixed
- Match results can flow into their performance software without manual re-entry
