/* Battleshiple: the safety net. Loaded before the game, synchronously, and depending on nothing, so
   that when the game's script fails to load, throws before it has drawn anything, or never draws at
   all, the visitor reads a short note (#boot-failed in index.html) instead of a blank page. Once
   the game has drawn, its own error boundary ("Signal lost") takes over and this stays silent.
   Written for older browsers than the game needs: a browser too old for the game is one this note
   is for. So it is ES5 (var, never const or let, which Safari 9 refuses to parse in strict code
   and IE 10 does not know; no arrow functions, no modules) and uses nothing in the page newer than
   IE 9 has: it removes the hidden attribute rather than setting the hidden property, which IE 10
   does not have. __tests__/website.test.ts parses it as ES5. */
/* eslint-disable no-var -- ES5 on purpose, as above */
(function () {
  'use strict';

  // How long after the page's load event the game has to have drawn something. The menu draws in
  // well under a second (it does not wait for the saved settings); this is for a bundle that ran
  // and drew nothing, which no event reports.
  var GRACE_MS = 4000;

  function started() {
    var root = document.getElementById('root');
    return !!root && root.childElementCount > 0;
  }

  function fail() {
    var note = document.getElementById('boot-failed');
    if (note) note.removeAttribute('hidden');
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
      var el = e.target;
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
