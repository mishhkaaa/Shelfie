interface FloatingButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

export function FloatingButton({ isOpen, onClick }: FloatingButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-44 right-5 z-[2147483000] w-14 h-14 rounded-full bg-myntra-brand text-white shadow-lg flex items-center justify-center text-2xl font-bold hover:bg-myntra-hover transition"
      title="Shelfie Discover"
    >
      {isOpen ? "✕" : "🗂"}
    </button>
  );
}
