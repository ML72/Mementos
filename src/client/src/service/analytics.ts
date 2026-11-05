const GTM_SCRIPT_URL = 'https://www.googletagmanager.com/gtm.js?id=GTM-TJ7HT245';

let started = false;

/**
 * Starts Google Tag Manager, in production builds only so `npm run dev` doesn't count as traffic.
 * Call it once a page has its title: Google's first hit reports document.title as it stands, so a
 * tag in index.html beats the page there and files every direct visit under index.html's title.
 * Starting here also makes a redirect, such as a signed-in visitor going from / to /home, one page
 * view of where it ended up.
 */
export const startAnalytics = (): void => {
  if (started || !import.meta.env.PROD) return;
  started = true;

  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  // Google tells a command from plain data by the Arguments object, so a rest parameter would break it
  // eslint-disable-next-line prefer-rest-params
  const gtag: (...args: unknown[]) => void = function () { w.dataLayer.push(arguments); };
  gtag('js', new Date());

  const script = document.createElement('script');
  script.async = true;
  script.src = GTM_SCRIPT_URL;
  document.head.appendChild(script);
};
