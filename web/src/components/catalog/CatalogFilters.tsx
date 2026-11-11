import { Chip } from "@/components/ui";
import {
  EQUIPMENT,
  LP,
  REWARD,
  type CatalogFilterState,
} from "./filterState";

interface Props {
  value: CatalogFilterState;
  onChange: (next: CatalogFilterState) => void;
}

/** Three groups of toggle chips: equipment, light-pollution tolerance, reward. */
export function CatalogFilters({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <ChipGroup
        label="Equipment"
        options={EQUIPMENT}
        selected={value.equipment}
        onChange={(equipment) => onChange({ ...value, equipment })}
      />
      <ChipGroup
        label="Light pollution tolerance"
        options={LP}
        selected={value.lp}
        onChange={(lp) => onChange({ ...value, lp })}
      />
      <ChipGroup
        label="Visual reward"
        options={REWARD}
        selected={value.reward}
        onChange={(reward) => onChange({ ...value, reward })}
      />
    </div>
  );
}

function ChipGroup<T extends string>({
  label, options, selected, onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      <span className="text-label text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip
            key={o.value}
            pressed={selected.has(o.value)}
            onPressedChange={(on) => {
              const next = new Set(selected);
              if (on) next.add(o.value);
              else next.delete(o.value);
              onChange(next);
            }}
          >
            {o.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
