import { useState, useEffect } from "react";

/** Returns true when viewport width is 768px or narrower. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return isMobile;
}
