"use client";
import { useTransition } from "react";
import { PendingFeedback } from "@/components/shell/navigation-feedback";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CatalogSort({
  value,
  label,
  options,
}: {
  value: string;
  label: string;
  options: { value: string; label: string; href: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const option = options.find((item) => item.value === next);
        if (option) startTransition(() => router.push(option.href));
      }}
    >
      <SelectTrigger
        aria-label={label}
        aria-busy={pending}
        data-pending={pending || undefined}
        className="catalog-sort portal-pending-control"
      >
        <PendingFeedback pending={pending} />
        <SelectValue>{options.find((option) => option.value === value)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
