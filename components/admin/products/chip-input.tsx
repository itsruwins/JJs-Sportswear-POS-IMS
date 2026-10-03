"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";

type ChipInputProps = {
  id: string;
  values: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  placeholder: string;
  /** How a typed value is tidied before it's added (e.g. title case for colors). */
  format?: (raw: string) => string;
  max?: number;
  invalid?: boolean;
  describedBy?: string;
  removeLabel: (value: string) => string;
};

/** Type a value and press Enter (or comma) to add it; existing values are offered as suggestions. */
export function ChipInput({
  id,
  values,
  onChange,
  suggestions,
  placeholder,
  format = (s) => s.trim(),
  max,
  invalid,
  describedBy,
  removeLabel,
}: ChipInputProps) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  const lower = values.map((v) => v.toLowerCase());
  const available = suggestions.filter((s) => !lower.includes(s.toLowerCase()));
  const full = max !== undefined && values.length >= max;

  const add = (raw: string) => {
    const value = format(raw);
    if (!value || lower.includes(value.toLowerCase()) || full) return;
    // Reuse the catalog's spelling when it's the same word in a different case.
    const known = suggestions.find((s) => s.toLowerCase() === value.toLowerCase());
    onChange([...values, known ?? value]);
    setDraft("");
  };

  return (
    <div
      className={`auth-input auth-input-grow flex min-h-12 flex-wrap items-center gap-1.5 px-2 py-1.5 ${invalid ? "is-invalid" : ""}`}
    >
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-ground py-1 pl-3 pr-1 text-[0.9375rem] font-medium text-ink shadow-[inset_0_0_0_1px_var(--line)]">
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            aria-label={removeLabel(v)}
            className="press grid size-6 place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        list={listId}
        disabled={full}
        onChange={(e) => {
          const next = e.target.value;
          // Picking a suggestion from the list adds it straight away.
          if (available.some((s) => s === next)) add(next);
          else setDraft(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={full ? "" : placeholder}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        className="chip-input-field h-9 min-w-[10rem] flex-1 bg-transparent px-2 text-[1rem] outline-none placeholder:text-ink-2"
      />
      <datalist id={listId}>
        {available.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
