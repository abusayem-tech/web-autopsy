import { cn, healthLabel } from "@/lib/utils";

export function HealthPill({ health }: { health?: string }) {
  const h = health || "shaky";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        h === "healthy" && "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
        h === "shaky" && "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
        h === "broken" && "bg-red-50 text-red-700 ring-1 ring-red-200",
      )}
    >
      {healthLabel(h)}
    </span>
  );
}
