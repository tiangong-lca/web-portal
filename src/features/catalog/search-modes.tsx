"use client";

import "./search-workspace.css";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { ScanSearch, TextSearch } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
const ModeContext = createContext<{
  mode: string;
  change: (value: string) => void;
  labels: { mode: string; keyword: string; description: string };
} | null>(null);

/** @import import { SearchModeControl } from "@/features/catalog/search-modes"; */
export function SearchModeControl() {
  const context = useContext(ModeContext);
  if (!context) return null;
  const { mode, change, labels } = context;
  const label = mode === "keyword" ? labels.keyword : labels.description;
  const Icon = mode === "keyword" ? TextSearch : ScanSearch;
  return (
    <Select value={mode} onValueChange={change}>
      <SelectTrigger
        className="catalog-mode-trigger"
        aria-label={`${labels.mode}: ${label}`}
        title={`${labels.mode}: ${label}`}
      >
        <Icon aria-hidden="true" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="keyword">{labels.keyword}</SelectItem>
          <SelectItem value="description">{labels.description}</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
function isSharedDescription() {
  return window.location.hash.startsWith("#hybrid=") || window.location.hash === "#description";
}

/** @import import { SearchModes } from "@/features/catalog/search-modes"; */
export function SearchModes({
  keyword,
  description,
  labels,
  descriptionBlocked,
}: {
  descriptionBlocked?: { message: string; href: string; label: string };
  keyword: ReactNode;
  description: ReactNode;
  labels: { mode: string; keyword: string; description: string };
}) {
  const [choice, setChoice] = useState<"keyword" | "description" | null>(null);
  const sharedDescription = useSyncExternalStore(subscribe, isSharedDescription, () => false);
  const mode = choice ?? (sharedDescription ? "description" : "keyword");
  return (
    <ModeContext.Provider
      value={{
        mode,
        labels,
        change: (value) => {
          if (value === "keyword" || value === "description") setChoice(value);
        },
      }}
    >
      <div className="catalog-search-modes flex flex-col gap-6">
        <div
          hidden={mode !== "keyword"}
          className={cn("flex flex-col gap-6", mode !== "keyword" && "hidden")}
        >
          {keyword}
        </div>
        <div hidden={mode !== "description"} className={cn(mode !== "description" && "hidden")}>
          {descriptionBlocked ? (
            <Alert>
              <AlertDescription>
                <p>{descriptionBlocked.message}</p>
                <Button asChild variant="outline">
                  <Link href={descriptionBlocked.href} prefetch={false}>
                    {descriptionBlocked.label}
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            description
          )}
        </div>
      </div>
    </ModeContext.Provider>
  );
}
