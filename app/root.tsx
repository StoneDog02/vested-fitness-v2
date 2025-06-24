import type { LinksFunction } from "@remix-run/node";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import { ThemeProvider } from "./context/ThemeContext";
import { MealCompletionProvider } from "./context/MealCompletionContext";

import styles from "./tailwind.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: styles },
  { rel: "icon", type: "image/png", href: "/KAVA-black.png" },
  { rel: "shortcut icon", type: "image/png", href: "/KAVA-black.png" },
  { rel: "apple-touch-icon", type: "image/png", href: "/KAVA-black.png" },
];

// This script detects the saved theme from localStorage and applies it immediately to prevent flash
const themeScript = `
  (function() {
    let theme = localStorage.getItem('theme') || 'light';
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  })();
`;

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#ffffff" />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="transition-colors duration-200 bg-white dark:bg-night text-secondary dark:text-alabaster">
        <ThemeProvider>
          <MealCompletionProvider>
            <Outlet />
          </MealCompletionProvider>
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
