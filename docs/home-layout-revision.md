# Home layout revision

Update later on November 18: [header caption search is now enabled](header-search-fix.md).
The text-only behavior below records the earlier prototype, which it supersedes.

On November 18, 2026, the student supplied a Pinterest screenshot and requested a similar header search field, a sidebar containing Home, Create, and Your saved, and a circular profile control. The student explicitly requested that search only accept text for now. This is a student request, not PM feedback.

## Current behavior

- The wide rounded header field accepts and clears local text. Enter does not submit, navigate, filter captions, or request search results. A Coming soon label appears on desktop, with an accessible explanation at every screen size.
- The former gallery search form is removed. Gallery pages ignore legacy keyword query parameters during this preview stage. The existing database search action remains available for a later integration, but keyword rediscovery is intentionally inactive in the current UI. This supersedes the active-search demonstration in the earlier review notes.
- Home opens the All Time Top 100 feed. Time filters, pagination, voting, saving, and the caption viewer retain their existing behavior.
- The sidebar links to `/`, `/new`, and `/favorites`. On phones it becomes a bottom navigation bar. Existing login requirements protect creation and saved captions.
- The pink circular profile control has a dropdown arrow. Signed-in users get their profile-name initial, falling back to their account email initial. Guests get a user icon and login/signup options. Theme controls remain in this menu.
- The retro palette, generic scenery, and framed caption cards remain. Mobile caption notifications sit above the new bottom navigation.

## Verification

- All 57 existing automated tests passed. They cover the underlying data and caption workflows; the browser checks below cover this text-only header.
- Production build and targeted lint passed.
- Typed `butler and midterms` and pressed Enter. The URL, caption IDs, and Showing 8 of 100 summary stayed unchanged; the field has no form or submission action.
- Clear emptied the field and restored focus to it.
- Confirmed that Create and Your saved lead signed-out visitors to login, and Home returns to the feed.
- Confirmed profile-menu opening, theme selection, and menu fit on mobile. Signed-in initial rendering is derived from the existing profile/account data; no authenticated test session was created for this visual revision.
- Checked 320, 390, and 1280 pixel layouts without horizontal overflow. At desktop width, the sidebar was 96 pixels and the search field was 1,026 pixels wide. Search and avatar corners were rounded as requested.
- Load More displayed 16 unique captions, the full-caption viewer opened with keyboard input, and Escape returned focus to the original card. An empty Past Week range recovered through Browse all time.
- No browser console errors appeared in the final check.

Screenshots: [desktop](screenshots/home-layout-desktop.jpg), [mobile](screenshots/home-layout-mobile.jpg), [dark mobile](screenshots/home-layout-dark-mobile.jpg).
