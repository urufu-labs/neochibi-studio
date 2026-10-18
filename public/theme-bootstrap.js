// Runs before React hydration to prevent a light→dark FOUC. Sourced by next/script in
// the root layout head so React does not warn on raw <script> tags rendered inside
// components. Keep the STORAGE_KEY in sync with components/shell/theme-toggle.tsx.
//
// Light is the default theme (same as the urufu labs launchpad); dark is a full theme
// behind the toggle. prefers-color-scheme is ignored so a dark-mode OS doesn't override
// the intended look for first-time visitors.
//
// `?theme=dark` / `?theme=light` forces a theme for that page load without saving it,
// so screenshot checks can capture both themes.
(function () {
  try {
    var forced = new URLSearchParams(location.search).get('theme');
    var stored = localStorage.getItem('neochibi-theme');
    var pick = forced === 'dark' || forced === 'light' ? forced : stored;
    var theme = pick === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_err) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
