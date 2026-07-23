import { useEffect, useState } from "react";
import { FloatingButton } from "./FloatingButton";
import { Popover } from "./SlideOver";
import { DiscoverPanel } from "./DiscoverPanel";

export function InpageApp() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <>
      <FloatingButton isOpen={isOpen} onClick={() => setIsOpen((v) => !v)} />
      <Popover isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <DiscoverPanel />
      </Popover>
    </>
  );
}
