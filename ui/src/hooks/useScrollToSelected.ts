import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";

export type UseScrollToSelectedOptions = {
  containerRef: RefObject<HTMLElement | null>;
  targetSelector: string;
  enabled?: boolean;
  threshold?: number | number[];
  deps?: Array<unknown>;
};

export type UseScrollToSelectedResult = {
  show: boolean;
  scrollToSelected: () => void;
};

export function useScrollToSelected(
  options: UseScrollToSelectedOptions,
): UseScrollToSelectedResult {
  const {
    containerRef,
    targetSelector,
    enabled = true,
    threshold = 0.1,
    deps = [],
  } = options;

  const [show, setShow] = useState(false);

  const getTarget = useCallback(() => {
    const container = containerRef.current;
    if (!container || !targetSelector) return null;
    return container.querySelector(targetSelector) as HTMLElement | null;
  }, [containerRef, targetSelector]);

  const scrollToSelected = useCallback(() => {
    const target = getTarget();
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [getTarget]);

  const observeDeps = useMemo(() => deps, [deps]);

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShow(false);
      return;
    }

    const container = containerRef.current;
    if (!container || !targetSelector) {
      setShow(false);
      return;
    }

    const target = getTarget();
    if (!target) {
      setShow(false);
      return;
    }

    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.length) return;
          const entry = entries[0];
          setShow(!entry.isIntersecting);
        },
        {
          root: container,
          threshold,
        },
      );

      observer.observe(target);

      return () => {
        observer.disconnect();
      };
    }

    const updateVisibility = () => {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const visible =
        targetRect.top >= containerRect.top &&
        targetRect.bottom <= containerRect.bottom;
      setShow(!visible);
    };

    updateVisibility();
    container.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);

    return () => {
      container.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, [
    containerRef,
    targetSelector,
    enabled,
    threshold,
    getTarget,
    ...observeDeps,
  ]);

  return { show, scrollToSelected };
}
