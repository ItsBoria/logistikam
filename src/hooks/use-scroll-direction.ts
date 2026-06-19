import { useEffect, useState } from "react";

/**
 * Returns `hidden = true` when the user scrolls down past `threshold` px,
 * and `hidden = false` when they scroll back up. Useful for auto-hiding
 * sticky headers.
 */
export function useHideOnScroll(threshold = 40) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let last = window.scrollY;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - last;
        if (Math.abs(dy) > 6) {
          if (dy > 0 && y > threshold) setHidden(true);
          else if (dy < 0) setHidden(false);
          last = y;
        }
        if (y <= 0) setHidden(false);
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return hidden;
}
