'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Marks <html data-js> once React has actually hydrated.
//
// globals.css scopes every "hidden until revealed" state to `html[data-js]`,
// so content is visible by default and only becomes an animation once the
// client bundle is known to be running. A browser where a chunk fails to
// parse (an old Safari, say) never sets the attribute and simply gets the
// server-rendered page as-is — instead of a page stuck at opacity 0 that
// looks like it never loaded.
//
// This is a React effect on purpose, not an inline <script>: an inline
// script would run (and set the flag) even when the main bundle crashes,
// which is exactly the case this guards against.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';

export default function JsReady() {
  useEffect(() => {
    document.documentElement.dataset.js = '1';
  }, []);
  return null;
}
