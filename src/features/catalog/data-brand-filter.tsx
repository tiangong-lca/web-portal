"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dataBrandCodes, dataBrandNames } from "@/config/data-brands";
type BrandCode = (typeof dataBrandCodes)[number];
export function DataBrandFilter({
  allowedBrandCodes,
  value,
  onChange,
  label,
  allLabel,
}: {
  allowedBrandCodes: readonly BrandCode[];
  value?: BrandCode;
  onChange: (value: BrandCode | undefined) => void;
  label: string;
  allLabel: string;
}) {
  if (allowedBrandCodes.length < 2) return null;
  return (
    <Select
      value={value ?? "all"}
      onValueChange={(selected) => {
        if (selected === "all") onChange(undefined);
        else if (allowedBrandCodes.some((code) => code === selected))
          onChange(selected as BrandCode);
      }}
    >
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {allowedBrandCodes.map((code) => (
          <SelectItem key={code} value={code}>
            {dataBrandNames[code]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
