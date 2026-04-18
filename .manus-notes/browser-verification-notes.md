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

## 2026-04-18 live verification continuation

- Loaded `/council?session=kuc9bwxjOBR1ho9s9foz` directly and confirmed the session transcript renders in the browser with the transcript as the dominant workspace panel, without the active right rail.
- Verified live recall rendering in the loaded session: Metis explicitly opened with `Prior memory:` and the later turns and synthesis continued to reference the recalled architecture guidance.
- Verified transcript rich text renders cleanly in the integrated UI: bullet lists were rendered as bullets in the browser-extracted content and visible transcript cards rather than raw markdown syntax.
- Verified live history/search data through the authenticated browser runtime: `/api/history` returned current sessions, `q=architecture` returned populated results, and `q=zzzz-no-match` returned empty results.
- Verified live admin/runtime controls via authenticated runtime checks: created temporary user `temp_admin_check_1776504925856`, toggled role and active state, confirmed inactive login was rejected with `error=invalid_credentials`, confirmed restored login redirected to `/council`, then downgraded and paused the temporary user again for safety.
