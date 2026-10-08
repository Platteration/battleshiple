/* Battleshiple: the safety net. Loaded before the game, synchronously, and depending on nothing, so
   that when the game's script fails to load, throws before it has drawn anything, or never draws at
   all, the visitor reads a short note (#boot-failed in index.html) instead of a blank page. Once
   the game has drawn, its own error boundary ("Signal lost") takes over and this stays silent.
   Written for older browsers than the game needs (no arrow functions, no modules): a browser
   too old for the game is one this note is for. */
(function () {
  'use strict';

  // How long after the page's load event the game has to have drawn something. The menu draws in
  // well under a second (it does not wait for the saved settings); this is for a bundle that ran
  // and drew nothing, which no event reports.
  const GRACE_MS = 4000;

  function started() {
    const root = document.getElementById('root');
    return !!root && root.childElementCount > 0;
  }

  function fail() {
    const note = document.getElementById('boot-failed');
    if (note) note.hidden = false;
  }

  // An error while the game is starting. Checked a moment later, because React reports an error
  // thrown while rendering before it has finished taking the tree down: a page that drew and then
  // emptied is as dead as one that never drew.
  function maybeFail() {
    setTimeout(function () {
      if (!started()) fail();
    }, 50);
  }

  // Capture phase: a script that fails to load fires `error` on its element, and that event does
  // not bubble to window.
  window.addEventListener(
    'error',
    function (e) {
      const el = e.target;
      if (el && el !== window && el.tagName) {
        if (el.tagName.toLowerCase() === 'script') fail();
        return;
      }
      maybeFail();
    },
    true
  );
  window.addEventListener('unhandledrejection', maybeFail);
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (!started()) fail();
    }, GRACE_MS);
  });
})();
