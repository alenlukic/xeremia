# Set Workspace Manual QA Checklist

Date: 2026-08-07  
Environment: local dev (`http://localhost:5173`, API `http://127.0.0.1:8000`)  
Browser automation: Chrome DevTools MCP (`user-chrome-devtools`)  
Isolation: `new_page` with `isolatedContext=qa-reorient-20260807`  
Cleanup: QA page was closed with `close_page(pageId=2)`

## Results

| Area | Status | Notes | Evidence |
| --- | --- | --- | --- |
| Widget drag/resize/snap geometry | BLOCKED | Could not fully exercise pointer-driven panel move/resize handles with available MCP actions (no coordinate drag for non-`draggable` handles). | Snapshots: `63ed1ec1-...`, `4340bff7-...` |
| Preset apply/save/rename | PASS | Applied `Pool curation`, created `QA Layout`, then renamed to `QA Layout Renamed`. | `7ea01ded-...`, `06a507f7-...`, `7aebb806-...`, `1c463109-...` |
| Layout/Add-widget Escape behavior | PASS | `Escape` closed both the layout menu and add-widget menu. | `10deee87-...`, `82ca86f0-...` |
| Widget remove/restore flow | PASS | Removed `Matches`, then restored it from `Add widget` menu. | `3f12c78e-...`, `298143ec-...`, `4340bff7-...` |
| Sequencer block drag between lanes | PASS | Dragged a benched block from one alt lane to another lane target. | `56e30509-...` |
| Sequencer marquee + clipboard shortcuts | BLOCKED | Could not reliably automate modifier-key clipboard paths (`Cmd/Ctrl+C/X/V`) and marquee drag in this run. | Snapshot baseline: `af9c6cc8-...` |
| Sequencer time input validation | PASS | Entering start time after end time produced `Start time must be before end time.` | `af9c6cc8-...` |
| Explorer drill-in + Escape-to-close inspector | PASS | Opened populated cohort inspector and closed it via `Escape`. | `c725b0fa-...`, `8b3fe786-...` |
| Explorer destructive confirmation | PASS | `Clear` shows confirmation prompt and cancel path works. | `4e6f2b75-...` |
| Persistence across reload | PARTIAL | Active set persisted after reload and custom preset remained available; active layout returned to custom state after interactions. | `a3db9ec5-...`, `ec32eda2-...` |
| Sub-1280px behavior | PASS | Resized viewport to `1180x900`; app remained interactive and stable. | `59a95a54-...` |

## Notes

- Screenshot evidence was captured in-session (viewport screenshot) and DOM evidence was recorded via `take_snapshot`.
- Manual follow-up is still recommended for:
  - precise panel drag/resize snap geometry,
  - sequencer marquee selection and clipboard keyboard flows using real pointer/keyboard interaction.
