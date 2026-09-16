import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data with proper first-load / refetch semantics:
 *   - `loading` stays true only until the FIRST successful (or failed) response.
 *   - Refetches (StrictMode double-mount, action-triggered) do not flip the
 *     skeleton back on — they show a subtle `refreshing` flag instead.
 *   - Stale responses from cancelled effect runs are dropped.
 *
 * `fetcher` must be a stable reference (wrap with useCallback). Deps drive refetch.
 */
export function useDataFetch<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  opts?: { enabled?: boolean; onError?: (err: unknown) => void },
): {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: unknown;
  refetch: () => Promise<void>;
} {
  const enabled = opts?.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Track whether we've ever successfully filled `data` in THIS mounted instance.
  const hasDataRef = useRef(false);
  const activeIdRef = useRef(0);
  const mountedRef = useRef(true);

  const run = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    const id = ++activeIdRef.current;

    if (hasDataRef.current) setRefreshing(true);
    else setLoading(true);

    try {
      const result = await fetcher();
      if (!mountedRef.current || id !== activeIdRef.current) return;
      setData(result);
      hasDataRef.current = true;
      setError(null);
    } catch (err) {
      if (!mountedRef.current || id !== activeIdRef.current) return;
      setError(err);
      opts?.onError?.(err);
    } finally {
      if (mountedRef.current && id === activeIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fetcher, opts?.onError]);

  useEffect(() => {
    mountedRef.current = true;
    void run();
    return () => {
      mountedRef.current = false;
      // Bump the id so any in-flight response from this mount is ignored.
      activeIdRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, refreshing, error, refetch: run };
}
