import React from "react";

type CardProps = {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  accent?: "danger" | "warn" | "ok" | null;
};

export default function Card({
  children,
  className = "",
  interactive = false,
  accent = null,
}: CardProps) {
  const accentColors = {
    danger: "border-l-status-danger",
    warn: "border-l-status-warn",
    ok: "border-l-status-ok",
  };

  return (
    <div
      className={`
        relative bg-slate-900/60 backdrop-blur-md rounded-2xl
        border border-sky-500/15 p-4 md:p-5 shadow-lg
        shadow-black/20
        ${accent ? `border-l-4 ${accentColors[accent]}` : ""}
        ${interactive ? "transition-all duration-200 hover:border-sky-400/40 hover:bg-slate-800/70 hover:shadow-sky-500/10 hover:shadow-xl cursor-pointer" : ""}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  isLoading?: boolean;
};

export function Button({
  children,
  variant = "primary",
  isLoading = false,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const variantStyles: Record<ButtonVariant, string> = {
    primary:
      "bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold shadow-lg shadow-sky-600/25 border-transparent active:scale-[0.98]",
    secondary:
      "border border-sky-500/20 bg-slate-900/80 hover:bg-slate-800 text-slate-200 active:scale-[0.98]",
    danger:
      "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold shadow-lg shadow-red-600/25 border-transparent active:scale-[0.98]",
    ghost:
      "border-transparent text-slate-400 hover:text-white hover:bg-slate-800/60",
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`
        inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold
        transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-50
        disabled:cursor-not-allowed border ${variantStyles[variant]} ${className}
      `}
      {...props}
    >
      {isLoading ? "Завантаження..." : children}
    </button>
  );
}

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, className = "", id, ...props }: InputProps) {
  const inputId = id || props.name;
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-slate-300">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`
          w-full bg-slate-950/60 border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500
          focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20 transition-all
          ${error ? "border-status-danger/60 focus:border-status-danger" : "border-slate-800"}
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-xs text-status-danger mt-1">{error}</p>}
    </div>
  );
}

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
};

export function Select({ label, error, className = "", id, children, ...props }: SelectProps) {
  const selectId = id || props.name;
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-semibold text-slate-300">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`
          w-full bg-slate-950/60 border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500
          focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20 transition-all
          ${error ? "border-status-danger/60 focus:border-status-danger" : "border-slate-800"}
          ${className}
        `}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-status-danger mt-1">{error}</p>}
    </div>
  );
}

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
};

export function Textarea({ label, error, className = "", id, ...props }: TextareaProps) {
  const textareaId = id || props.name;
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={textareaId} className="block text-xs font-semibold text-slate-300">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={`
          w-full bg-slate-950/60 border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500
          focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20 transition-all
          ${error ? "border-status-danger/60 focus:border-status-danger" : "border-slate-800"}
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-xs text-status-danger mt-1">{error}</p>}
    </div>
  );
}
