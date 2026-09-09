"use client";

type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
};

export default function Switch({ checked, onCheckedChange, ariaLabel, disabled = false }: SwitchProps) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? "bg-slate-900" : "bg-slate-200"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      <span className={`text-[10px] font-bold tracking-[0.16em] ${checked ? "text-slate-800" : "text-slate-500"}`}>
        {checked ? "ON" : "OFF"}
      </span>
    </div>
  );
}
