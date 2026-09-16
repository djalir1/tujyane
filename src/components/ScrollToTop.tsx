import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls to the top on every route change. Mount once at the app root
 * (inside <BrowserRouter>). Uses useLayoutEffect so it runs synchronously
 * before the browser paints the new page — otherwise a child that adjusts
 * scroll in its own useEffect can leave the page mid-scroll on first paint.
 *
 * Resets window/document/body plus any container marked data-scroll-root.
 * Also fires when the query string changes — /search?to=X → /search?to=Y
 * should snap to the top of the results just like a full navigation would.
 */
export function ScrollToTop() {
  const { pathname, search } = useLocation();

  useLayoutEffect(() => {
    try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch { /* older browsers */ }
    try { document.documentElement.scrollTop = 0; } catch { /* ignore */ }
    try { document.body.scrollTop = 0; } catch { /* ignore */ }

    document.querySelectorAll<HTMLElement>('[data-scroll-root]').forEach((el) => {
      el.scrollTop = 0;
    });
  }, [pathname, search]);

  return null;
}
