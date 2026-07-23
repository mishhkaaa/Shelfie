import { useState } from "react";
import { api } from "../api/client";
import { buildUrlFromConstraints } from "../adapter/urlSchema";
import type { Constraints } from "../api/types";

interface ShareButtonProps {
  profileId: string;
  name: string;
  constraints: Constraints;
}

// Shared between the side panel (ProfileList, for your own profiles) and
// the in-page Discover popover (for public profiles you found) — both
// bundles get their own copy at build time (same as adapter/mergeConstraints
// already does), but there's only one implementation to keep in sync. No
// store access needed here at all (the side panel and in-page bundle use
// two entirely separate Zustand stores) — everything this needs is passed
// in as props, and it talks to the backend directly.
export function ShareButton({ profileId, name, constraints }: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSend = () => {
    setIsSending(true);
    setResult(null);
    const link = buildUrlFromConstraints(constraints);
    api
      .shareProfile(profileId, link, phone.trim() || undefined)
      .then((res) => {
        setResult({ ok: res.sent, text: res.sent ? "Sent! 🎉" : res.detail || "Couldn't send." });
      })
      .catch(() => setResult({ ok: false, text: "Couldn't reach the backend." }))
      .finally(() => setIsSending(false));
  };

  if (!isOpen) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        className="text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded font-semibold"
        title={`Share "${name}" via WhatsApp`}
      >
        📤 Share
      </button>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="flex flex-col gap-1 bg-gray-50 p-2 rounded border mt-1">
      <input
        type="text"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+91XXXXXXXXXX (optional, uses default)"
        className="text-[11px] border rounded px-1 py-1"
      />
      <div className="flex gap-1">
        <button
          onClick={handleSend}
          disabled={isSending}
          className="flex-1 text-[11px] bg-green-600 text-white px-2 py-1 rounded font-semibold disabled:opacity-50"
        >
          {isSending ? "Sending…" : "📱 Send via WhatsApp"}
        </button>
        <button
          onClick={() => {
            setIsOpen(false);
            setResult(null);
          }}
          className="text-[11px] text-gray-500 hover:text-gray-800 px-2"
        >
          Cancel
        </button>
      </div>
      {result && <p className={`text-[10px] ${result.ok ? "text-green-700" : "text-red-700"}`}>{result.text}</p>}
    </div>
  );
}
