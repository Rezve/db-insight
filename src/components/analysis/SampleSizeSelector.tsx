"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { SampleSize } from "@/types/analysis";

interface SampleSizeSelectorProps {
  value: SampleSize;
  onChange: (value: SampleSize) => void;
}

const options: { value: SampleSize; label: string; description: string }[] = [
  { value: "small", label: "Small", description: "TOP 1,000 rows" },
  { value: "medium", label: "Medium", description: "TOP 10,000 rows" },
  { value: "full", label: "Full scan", description: "All rows (may be slow)" },
];

export default function SampleSizeSelector({ value, onChange }: SampleSizeSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground font-medium">Sample:</span>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as SampleSize)}
        className="flex items-center gap-4"
      >
        {options.map((opt) => (
          <div key={opt.value} className="flex items-center gap-1.5">
            <RadioGroupItem value={opt.value} id={`sample-${opt.value}`} />
            <Label htmlFor={`sample-${opt.value}`} className="cursor-pointer text-sm">
              {opt.label}
              <span className="ml-1 text-xs text-muted-foreground">({opt.description})</span>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
