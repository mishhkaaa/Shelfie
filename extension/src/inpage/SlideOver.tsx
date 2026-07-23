import type { ReactNode } from "react";

interface PopoverProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

// A simple toggleable popup anchored above the floating button — not a
// persistent side panel. Pressing the floating button again (or Escape)
// closes it; there is no backdrop capturing clicks, so it can never end up
// "stuck open" blocking the rest of the page the way the previous
// slide-over + backdrop combination did.
export function Popover({ isOpen, onClose, children }: PopoverProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed bottom-[13rem] right-5 z-[2147482999] w-[380px] max-w-[92vw] max-h-[70vh] bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden border border-gray-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
        <h1 className="text-sm font-bold text-myntra-dark">🗂 Shelfie Discover</h1>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-800 text-lg leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
          title="Close"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
