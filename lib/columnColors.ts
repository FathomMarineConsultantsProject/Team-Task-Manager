export const COLUMN_COLOR_KEYS = [
  "slate",
  "blue",
  "indigo",
  "purple",
  "pink",
  "red",
  "orange",
  "amber",
  "cyan",
  "green",
] as const;

export type ColumnColorKey = (typeof COLUMN_COLOR_KEYS)[number];

export const COLUMN_COLORS: Record<
  ColumnColorKey,
  { label: string; swatch: string; border: string; text: string; tint: string; indicator: string }
> = {
  slate: { label: "Slate", swatch: "bg-slate-500", border: "border-slate-300", text: "text-slate-700", tint: "bg-slate-50/80", indicator: "bg-slate-500" },
  blue: { label: "Blue", swatch: "bg-blue-500", border: "border-blue-200", text: "text-blue-700", tint: "bg-blue-50/80", indicator: "bg-blue-500" },
  indigo: { label: "Indigo", swatch: "bg-indigo-500", border: "border-indigo-200", text: "text-indigo-700", tint: "bg-indigo-50/80", indicator: "bg-indigo-500" },
  purple: { label: "Purple", swatch: "bg-purple-500", border: "border-purple-200", text: "text-purple-700", tint: "bg-purple-50/80", indicator: "bg-purple-500" },
  pink: { label: "Pink", swatch: "bg-pink-500", border: "border-pink-200", text: "text-pink-700", tint: "bg-pink-50/80", indicator: "bg-pink-500" },
  red: { label: "Red", swatch: "bg-red-500", border: "border-red-200", text: "text-red-700", tint: "bg-red-50/80", indicator: "bg-red-500" },
  orange: { label: "Orange", swatch: "bg-orange-500", border: "border-orange-200", text: "text-orange-700", tint: "bg-orange-50/80", indicator: "bg-orange-500" },
  amber: { label: "Amber", swatch: "bg-amber-500", border: "border-amber-200", text: "text-amber-700", tint: "bg-amber-50/80", indicator: "bg-amber-500" },
  cyan: { label: "Cyan", swatch: "bg-cyan-500", border: "border-cyan-200", text: "text-cyan-700", tint: "bg-cyan-50/80", indicator: "bg-cyan-500" },
  green: { label: "Green", swatch: "bg-emerald-500", border: "border-emerald-200", text: "text-emerald-700", tint: "bg-emerald-50/80", indicator: "bg-emerald-500" },
};

export const isColumnColorKey = (value: unknown): value is ColumnColorKey =>
  typeof value === "string" && COLUMN_COLOR_KEYS.includes(value as ColumnColorKey);

