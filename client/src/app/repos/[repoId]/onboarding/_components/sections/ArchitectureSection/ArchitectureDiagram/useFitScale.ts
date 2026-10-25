import { useLayoutEffect, useRef, useState } from "react";
import { fitScale } from "./helpers";

/** Measures the element's width and returns the scale that fits `contentWidth` into it. */
export function useFitScale<T extends HTMLElement>(contentWidth: number) {
  const ref = useRef<T>(null);
  const [available, setAvailable] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setAvailable(el.clientWidth);
    const observer = new ResizeObserver(() => setAvailable(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, scale: fitScale(available, contentWidth) };
}
