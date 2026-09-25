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
        relative bg-surface rounded-xl
        border border-blue-900/20 p-4
        ${accent ? `border-l-[3px] ${accentColors[accent]}` : ""}
        ${interactive ? "transition-all duration-200 hover:border-blue-800/40 hover:bg-surface-hover cursor-pointer" : ""}
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
      "bg-brand-blue hover:bg-brand-blue-light text-white font-bold shadow-glow-sm border-transparent",
    secondary:
      "border border-blue-900/30 bg-surface-raised hover:bg-surface-hover text-slate-200",
    danger:
      "bg-status-danger hover:bg-red-600 text-white font-bold border-transparent",
    ghost:
      "border-transparent text-slate-400 hover:text-white hover:bg-surface-hover",
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`
        inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium
        transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue/40 disabled:opacity-50
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
        <label htmlFor={inputId} className="block text-xs font-medium text-slate-400">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`
          w-full bg-surface border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500
          focus:outline-none focus:border-brand-blue/60 focus:ring-1 focus:ring-brand-blue/30 transition-colors
          ${error ? "border-status-danger/60 focus:border-status-danger" : "border-blue-900/25"}
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
        <label htmlFor={selectId} className="block text-xs font-medium text-slate-400">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`
          w-full bg-surface border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500
          focus:outline-none focus:border-brand-blue/60 focus:ring-1 focus:ring-brand-blue/30 transition-colors
          ${error ? "border-status-danger/60 focus:border-status-danger" : "border-blue-900/25"}
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
        <label htmlFor={textareaId} className="block text-xs font-medium text-slate-400">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={`
          w-full bg-surface border rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-500
          focus:outline-none focus:border-brand-blue/60 focus:ring-1 focus:ring-brand-blue/30 transition-colors
          ${error ? "border-status-danger/60 focus:border-status-danger" : "border-blue-900/25"}
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-xs text-status-danger mt-1">{error}</p>}
    </div>
  );
}
