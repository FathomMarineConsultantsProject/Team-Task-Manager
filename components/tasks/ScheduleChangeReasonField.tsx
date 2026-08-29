"use client";

type Props = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string | null;
};

export default function ScheduleChangeReasonField({ value, onChange, required = false, disabled = false, error }: Props) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      Reason for schedule change {required ? "(required)" : "(optional)"}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        disabled={disabled}
        aria-required={required}
        aria-invalid={Boolean(error)}
        className={`mt-2 w-full rounded-lg border p-3 text-sm font-normal normal-case tracking-normal text-slate-800 disabled:bg-slate-50 ${error ? "border-red-300" : "border-slate-200"}`}
        placeholder="Why is this schedule changing?"
      />
      {error ? <span role="alert" className="mt-1 block text-sm font-medium text-red-600">{error}</span> : null}
    </label>
  );
}

