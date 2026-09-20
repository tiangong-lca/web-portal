"use client";

import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function normalizePath(value: string) {
  const path = value.split("?", 1)[0]!.replace(/\/$/u, "") || "/";
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function NavigationLink({
  children,
  href,
  matchPrefix,
  compactLabel,
}: {
  children: ReactNode;
  href: string;
  matchPrefix?: string;
  compactLabel?: string;
}) {
  const pathname = normalizePath(usePathname());
  const target = normalizePath(matchPrefix ?? href);
  const active = pathname === target || Boolean(matchPrefix && pathname.startsWith(`${target}/`));
  return (
    <Button
      asChild
      className={cn(
        "min-h-11",
        compactLabel && "h-auto w-full min-w-0 px-1 whitespace-normal sm:w-auto sm:px-2.5",
      )}
      size="lg"
      variant={active ? "secondary" : "ghost"}
    >
      <Link
        aria-current={active ? "page" : undefined}
        aria-label={compactLabel && typeof children === "string" ? children : undefined}
        href={href}
        prefetch={false}
      >
        {compactLabel ? (
          <>
            <span className="sm:hidden">{compactLabel}</span>
            <span className="hidden sm:inline">{children}</span>
          </>
        ) : (
          children
        )}
      </Link>
    </Button>
  );
}
