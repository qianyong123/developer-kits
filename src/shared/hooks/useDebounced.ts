import { useEffect, useRef, type DependencyList } from 'react';

/** 延迟触发副作用（跳过首次挂载）。 */
export function useDebouncedEffect(fn: () => void, deps: DependencyList, delay: number) {
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = window.setTimeout(fn, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
