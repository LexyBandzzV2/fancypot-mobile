import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Web-only HTML shell for the Expo web build (used by the in-browser preview).
 * The critical bit is the viewport meta tag: without `width=device-width`, mobile
 * layout falls back to ~980px and the phone frame only shows a slice (content
 * clipped on the right, buttons pushed off-screen). Height:100% on html/body/#root
 * gives the app's flex layout a bounded height so bottom-anchored actions sit
 * correctly. This file has no effect on the native iOS/Android builds.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: RESET }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const RESET = `
html, body, #root { height: 100%; width: 100%; margin: 0; }
body { background-color: #FFF8F8; overflow-x: hidden; }
#root { display: flex; flex-direction: column; }
`;
