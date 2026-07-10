import { useEffect, useRef, useState } from "react";

export function useTypewriter(text, { active = true, speed = 14 } = {}) {
  const [shown, setShown] = useState(active ? "" : text);
  const [done, setDone] = useState(!active);
  const indexRef = useRef(active ? 0 : text.length);

  useEffect(() => {
    if (!active) {
      setShown(text);
      setDone(true);
      return;
    }

    indexRef.current = 0;
    setShown("");
    setDone(false);

    const id = setInterval(() => {
      indexRef.current += 1;
      setShown(text.slice(0, indexRef.current));
      if (indexRef.current >= text.length) {
        clearInterval(id);
        setDone(true);
      }
    }, speed);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, active]);

  return { shown, done };
}