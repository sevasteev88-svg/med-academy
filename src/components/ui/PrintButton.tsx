"use client";

export default function PrintButton({ label = "📥 Завантажити PDF" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="border border-slate-800 text-slate-400 hover:bg-surface-hover font-semibold py-2.5 px-5 rounded-lg text-sm transition-colors print:hidden"
    >
      {label}
    </button>
  );
}
