"use client";

import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

interface AuditFilterBarProps {
  activeFilter: string;
}

const FILTERS = [
  { label: "All", value: "all" },
  { label: "Human", value: "human" },
  { label: "AI", value: "ai" },
  { label: "System", value: "system" },
];

export function AuditFilterBar({ activeFilter }: AuditFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  function setFilter(value: string) {
    const url = value === "all" ? pathname : `${pathname}?filter=${value}`;
    router.push(url);
  }

  return (
    <div className="flex items-center gap-1.5">
      {FILTERS.map((f) => (
        <Button
          key={f.value}
          variant={activeFilter === f.value ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setFilter(f.value)}
        >
          {f.label}
        </Button>
      ))}
    </div>
  );
}
