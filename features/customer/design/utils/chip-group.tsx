'use client';

import {label} from '../reusable/design-reusable';

export function ChipGroup<T extends string>({ name, options, value, onPick }: { name: string; options: readonly T[] | { id: T; label: string }[]; value: T; onPick: (v: T) => void }) {
    const list = (options as readonly (T | { id: T; label: string })[]).map((o) => (typeof o === "string" ? { id: o, label: o } : o));
    return (
      <fieldset>
        <legend className={label}>{name}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {list.map((o) => (
            <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onPick(o.id)} className="shop-chip press h-9 px-3.5 text-[0.875rem]">
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }