import * as React from "react";
import { cn } from "@/lib/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-[calc(var(--radius)-4px)] border px-1.5 text-[10px] font-medium",
        className
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-1", className)} {...props} />;
}

export { Kbd, KbdGroup };
