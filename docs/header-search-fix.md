# Connected header caption search

On November 18, 2026, the student reported that search was not working. The previous visual-layout request had explicitly kept the field text-only. This revision enables real caption search in the rounded header while preserving the sidebar and profile design.

## Behavior

- Press Enter or the Search button to apply a word or phrase. On phones, the blue magnifying-glass button submits the search.
- Gallery URLs retain the selected time range and query. Searching from another page opens matching captions on Home in All Time.
- Matches are case-insensitive, literal caption-text matches across all eligible public captions before pagination. Normal browsing retains its Top 100 cap.
- The summary identifies the active query, time range, result count, and visible count. Matching words are highlighted in cards and the full-caption viewer.
- Time filters, Load More, browser Back, and reload use the same URL query. Clear removes the query and restores browsing. Keyboard focus returns to the input after submitting or clearing.
- Empty results explain the current scope and offer query-preserving Search all time when appropriate. Data failures remain distinct from zero matches and have a retry action.

## Verification

- 65 tests passed. New regression checks exercise the actual header submit/clear handlers and the server page's forwarding of query parameters to data loading and rendering. They also cover returning to an earlier query through browser Back.
- Targeted lint and the required production build passed.
- Real-data browser checks returned 82 matches for `butler` and `BUTLER`, and 31 matches for `midterms`. Enter and the visible Search button both submitted successfully.
- Load More displayed 48 unique `butler` captions, all matching and highlighted. Past Week returned zero matches, and Search all time preserved the query and restored the results.
- An unmatched phrase showed the empty state. Clear removed all marks and returned to 100-caption browsing. Back restored both the input and matching results.
- Searching from the login page opened the matching Home feed. No authentication form was submitted.
- The mobile search button worked at 320 pixels wide; the input, Clear, Search, and profile controls fit without horizontal overflow. Checked the 390-pixel mobile and 1280-pixel desktop layouts as well.
- Full-caption highlighting and Escape dismissal worked. The final browser check contained no console errors.

Screenshots: [desktop](screenshots/header-search-working-desktop.jpg), [mobile](screenshots/header-search-working-mobile.jpg).

This is an implementation verification record, not PM feedback.
