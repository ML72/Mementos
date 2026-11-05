/* global window, dataLayer */

// The inline half of the Google Tag Manager tag, in a file so the CSP's script-src 'self' covers it.
// vite.config.ts adds both halves to production builds; they can run in either order. Keep `arguments`
// as it is: Google tells a command from plain data by the Arguments object, so a rest parameter would
// break it.
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
