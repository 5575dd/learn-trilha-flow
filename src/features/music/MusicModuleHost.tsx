import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import musicCss from "./music.css?inline";
import { MusicApp } from "./MusicApp";

export function MusicModuleHost({
  onImmersiveChange,
}: {
  onImmersiveChange?: (immersive: boolean) => void;
}) {
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);

  const setHost = useCallback((host: HTMLDivElement | null) => {
    if (!host) return;
    setShadowRoot(host.shadowRoot ?? host.attachShadow({ mode: "open" }));
  }, []);

  useEffect(() => {
    if (!shadowRoot) return;
    const style = document.createElement("style");
    style.dataset.trilhaMusicStyles = "true";
    style.textContent = musicCss;
    shadowRoot.prepend(style);
    return () => style.remove();
  }, [shadowRoot]);

  return (
    <div ref={setHost} data-testid="music-module-host">
      {shadowRoot
        ? createPortal(<MusicApp onImmersiveChange={onImmersiveChange} />, shadowRoot)
        : null}
    </div>
  );
}
