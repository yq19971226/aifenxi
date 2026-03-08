"use client";

import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type ReactNode,
} from "react";

/* ══════════════════════════════════════════════════════════════?   TextField ?wraps the .input CSS class
   ══════════════════════════════════════════════════════════════?*/

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, hint, icon, className = "", ...rest }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-xs font-medium text-zinc-400">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            className={`input ${icon ? "pl-9" : ""} ${
              error ? "!border-red-500/40 focus:!border-red-500/60" : ""
            } ${className}`}
            {...rest}
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {hint && !error && <p className="text-sm text-zinc-500">{hint}</p>}
      </div>
    );
  }
);

TextField.displayName = "TextField";

/* ══════════════════════════════════════════════════════════════?   Toggle ?switch component
   ══════════════════════════════════════════════════════════════?*/

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = "md",
}: ToggleProps) {
  const trackW = size === "sm" ? "w-8" : "w-10";
  const trackH = size === "sm" ? "h-[18px]" : "h-[22px]";
  const thumbSz = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const thumbTranslate = checked
    ? size === "sm"
      ? "translate-x-[14px]"
      : "translate-x-[18px]"
    : "translate-x-[2px]";

  return (
    <label
      className={`inline-flex items-center gap-3 ${
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative ${trackW} ${trackH} rounded-full transition-colors duration-200 ${
          checked ? "bg-emerald-500" : "bg-white/[0.12]"
        }`}
      >
        <span
          className={`absolute top-1/2 -translate-y-1/2 ${thumbSz} rounded-full bg-white shadow-sm transition-transform duration-200 ${thumbTranslate}`}
        />
      </button>
      {(label || description) && (
        <div>
          {label && <span className="text-sm text-zinc-300">{label}</span>}
          {description && (
            <p className="text-xs text-zinc-500">{description}</p>
          )}
        </div>
      )}
    </label>
  );
}

/* ══════════════════════════════════════════════════════════════?   Select ?dropdown
   ══════════════════════════════════════════════════════════════?*/

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  label?: string;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  onChange?: (value: string) => void;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, options, placeholder, error, onChange, className = "", value, ...rest }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-xs font-medium text-zinc-400">
            {label}
          </label>
        )}
        <select
          ref={ref}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className={`input appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10 ${
            error ? "!border-red-500/40" : ""
          } ${className}`}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          }}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    );
  }
);

SelectField.displayName = "SelectField";

/* ══════════════════════════════════════════════════════════════?   Slider ?range input
   ══════════════════════════════════════════════════════════════?*/

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  suffix?: string;
  disabled?: boolean;
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  suffix = "",
  disabled = false,
}: SliderProps) {
  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">{label}</span>
          <span className="text-xs font-mono text-zinc-300">
            {value}
            {suffix}
          </span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full"
      />
    </div>
  );
}

/* ── Usage examples (comments only) ──
 *
 * <TextField label="邮箱" placeholder="user@example.com" icon={<Mail size={14} />} />
 * <TextField error="邮箱格式不正" />
 * <Toggle checked={enabled} onChange={setEnabled} label="启用推" />
 * <SelectField label="角色" options={[{value:'admin',label:'管理?}]} onChange={setRole} />
 * <Slider label="阈" value={70} onChange={setVal} min={0} max={100} suffix="%" />
 */
