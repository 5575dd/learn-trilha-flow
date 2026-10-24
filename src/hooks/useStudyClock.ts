import { useEffect, useState } from "react";

export function useStudyClock(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: number;
    const update = () => {
      window.clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      timer = window.setTimeout(update, 60_000 - (current % 60_000));
    };
    const onVisible = () => {
      if (!document.hidden) update();
    };
    update();
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return now;
}
