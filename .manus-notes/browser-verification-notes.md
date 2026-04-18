# Browser verification notes

## 2026-04-18 pre-session council view

The authenticated `/council` page loads successfully.

The current pre-session layout still shows three columns on desktop:

| Column | Observed content |
|---|---|
| Left | Council members cards |
| Center | Live transcript placeholder and brief composer |
| Right | Cross-session memory, selected session transcript, and user administration |

This is acceptable for the pre-session state if the requirement is only to collapse the right rail after the first live message. The next verification step is to start a live session and confirm that the active transcript expands to dominate the page width and the right rail disappears.

## 2026-04-18 refreshed pre-session council view after UI fix

A fresh reload of `/council` now shows the updated compact composer in the center column.

| Check | Result |
|---|---|
| Helper copy removed from composer | Yes |
| CTA reduced to compact `SEND` button | Yes |
| Large textarea reduced to tighter composer | Yes |
| Right rail still visible before first brief | No visible right-rail cards remain in the viewport; the prior sidebar content has been hidden in the rendered branch |

The remaining live verification step is to start a run and confirm that the active session remains dominant after the first message and that prior-session recall surfaces when Orion asks for continuity.
