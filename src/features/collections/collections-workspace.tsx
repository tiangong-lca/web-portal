"use client";
import "./collections-workspace.css";
import { CatalogResultRow, CatalogResultList } from "@/features/catalog/catalog-result-row";
import { DatasetVersionTag } from "@/features/catalog/dataset-tags";
import { CatalogCopyIdentity } from "@/features/catalog/catalog-copy-identity";

import { DownloadIcon, EyeIcon, LinkIcon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PendingFeedback } from "@/components/shell/navigation-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isExactDatasetRef } from "@/features/catalog/exact-ref";
import { localePath, type PortalLocale } from "@/i18n/routing";
import { collectionsStorageKey, maxCollectionImportBytes } from "./storage";
import {
  collectionMemberKey,
  collectionsStorageKeyV2,
  decodeCollectionFragmentV2,
  decodeDisclosedCollectionFragmentV2,
  emptyCollectionStateV2,
  encodeCollectionFragmentV2,
  encodeDisclosedCollectionFragmentV2,
  mergeCollectionMembers,
  parseCollectionJsonV2,
  parseMemberFragment,
  type CollectionMemberV2,
  type CollectionStateV2,
  type DatasetIdentity,
} from "./storage-v2";
import { useMemberSummaries } from "./use-member-summaries";

export type CollectionLabels = (typeof import("@/i18n/messages/en.json"))["Collections"];
type CommonLabels = {
  process: string;
  flow: string;
  search: string;
  details: string;
  retry: string;
  previous: string;
  next: string;
  notProvided: string;
};
type ImportPreview = { state: CollectionStateV2; source: "file" | "link"; filename?: string };

function download(raw: string, filename: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.download = filename;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}
function fill(template: string, values: Record<string, number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key]?.toString() ?? match);
}
function mergeDisclosed(current: CollectionStateV2, shared: CollectionStateV2): CollectionStateV2 {
  const keys = new Set(current.members.map(collectionMemberKey));
  const members = [
    ...current.members,
    ...shared.members.filter((member) => !keys.has(collectionMemberKey(member))),
  ];
  return parseCollectionJsonV2(
    JSON.stringify({
      ...current,
      researchName: current.researchName || shared.researchName,
      purpose: current.purpose || shared.purpose,
      members,
    }),
  );
}

/** @import import { CollectionsWorkspace } from "@/features/collections/collections-workspace"; */
export function CollectionsWorkspace({
  labels,
  common,
  locale,
}: {
  labels: CollectionLabels;
  common: CommonLabels;
  locale: PortalLocale;
}) {
  const versionLabel = useTranslations("Search")("version");
  const [state, setState] = useState<CollectionStateV2>(emptyCollectionStateV2);
  const [newRef, setNewRef] = useState("");
  const [newKind, setNewKind] = useState<DatasetIdentity["kind"]>(null);
  const [formError, setFormError] = useState<"invalidRef" | "memberLimit" | null>(null);
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [corrupt, setCorrupt] = useState<{ key: string; raw: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<ImportPreview | null>(null);
  const [disclosure, setDisclosure] = useState<CollectionStateV2 | null>(null);
  const [page, setPage] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const storageSnapshot = useRef<CollectionStateV2 | null>(null);
  const storageBlocked = useRef(false);
  const pageIndex = Math.min(page, Math.max(0, Math.ceil(state.members.length / 10) - 1));
  const visibleMembers = state.members.slice(pageIndex * 10, pageIndex * 10 + 10);
  const { summaries, retry } = useMemberSummaries(visibleMembers, locale);

  // oxlint-disable react-hooks/set-state-in-effect -- Local storage and fragments are browser-only inputs, never read during SSR.
  useEffect(() => {
    let restored = emptyCollectionStateV2;
    let raw: string | null = null;
    let key = collectionsStorageKeyV2;
    try {
      raw = localStorage.getItem(key);
      if (raw === null) {
        key = collectionsStorageKey;
        raw = localStorage.getItem(key);
      }
    } catch {
      setReadFailed(true);
    }
    if (raw !== null) {
      try {
        restored = parseCollectionJsonV2(raw);
      } catch {
        setCorrupt({ key, raw });
        storageBlocked.current = true;
      }
    }
    storageSnapshot.current = restored;
    setState(restored);
    const receiveFragment = () => {
      if (storageBlocked.current) return;
      const hash = window.location.hash;
      try {
        if (hash.startsWith("#collection-notes="))
          setPendingImport({ state: decodeDisclosedCollectionFragmentV2(hash), source: "link" });
        else if (hash.startsWith("#collection=") || hash.startsWith("#member=")) {
          const identities = hash.startsWith("#member=")
            ? [parseMemberFragment(hash)]
            : decodeCollectionFragmentV2(hash);
          const merged = mergeCollectionMembers(storageSnapshot.current ?? restored, identities);
          storageSnapshot.current = merged;
          setState(merged);
        }
      } catch (error) {
        setActionError(
          error instanceof Error && error.message === "collection_member_limit"
            ? labels.memberLimit
            : labels.invalidLink,
        );
      }
    };
    receiveFragment();
    setHydrated(true);
    window.addEventListener("hashchange", receiveFragment);
    return () => window.removeEventListener("hashchange", receiveFragment);
  }, [labels.invalidLink, labels.memberLimit]);
  useEffect(() => {
    if (!hydrated) return;
    storageSnapshot.current = state;
    if (corrupt || readFailed) return;
    try {
      localStorage.setItem(collectionsStorageKeyV2, JSON.stringify(state));
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }, [state, hydrated, corrupt, readFailed]);
  // oxlint-enable react-hooks/set-state-in-effect

  const updateMember = (
    key: string,
    patch: Partial<Pick<CollectionMemberV2, "note" | "status" | "kind">>,
  ) => {
    const next = {
      ...state,
      members: state.members.map((member) =>
        collectionMemberKey(member) === key ? { ...member, ...patch } : member,
      ),
    };
    if (new Set(next.members.map(collectionMemberKey)).size !== next.members.length) {
      setActionError(labels.resolveConflict);
      return;
    }
    setState(next);
    setActionError("");
  };
  const copyShare = async (withNotes: CollectionStateV2 | null) => {
    let fragment: string;
    try {
      fragment = withNotes
        ? encodeDisclosedCollectionFragmentV2(withNotes)
        : encodeCollectionFragmentV2(state.members);
    } catch {
      setActionError(labels.shareLimit);
      return;
    }
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${window.location.pathname}${fragment}`,
      );
      setMessage(withNotes ? labels.sharedWithNotes : labels.shared);
      setActionError("");
      setDisclosure(null);
    } catch {
      setActionError(labels.clipboardError);
    }
  };
  let proposedImport: CollectionStateV2 | null = null;
  if (pendingImport) {
    try {
      proposedImport =
        pendingImport.source === "file"
          ? pendingImport.state
          : mergeDisclosed(state, pendingImport.state);
    } catch {
      /* A valid link may exceed local capacity; current data stays intact. */
    }
  }
  const previewState = (preview: CollectionStateV2) => (
    <div className="flex flex-col gap-3">
      <dl className="grid gap-3 sm:grid-cols-2">
        {[
          [labels.researchName, preview.researchName],
          [labels.purpose, preview.purpose],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground text-sm">{label}</dt>
            <dd className="break-words whitespace-pre-wrap">{value || common.notProvided}</dd>
          </div>
        ))}
      </dl>
      <p className="font-medium">{fill(labels.versionCount, { count: preview.members.length })}</p>
      <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto">
        {(preview.members.length <= 20 ? preview.members : preview.members.slice(0, 10)).map(
          (member) => (
            <li className="rounded-lg border p-3 text-sm" key={collectionMemberKey(member)}>
              <p>{member.kind ? common[member.kind] : labels.unknownKind}</p>
              <p className="font-mono text-xs break-all">{member.ref}</p>
              <p>
                {labels.status}: {labels[member.status]}
              </p>
              <p className="break-words whitespace-pre-wrap">
                {labels.note}: {member.note || common.notProvided}
              </p>
            </li>
          ),
        )}
      </ul>
      {preview.members.length > 20 ? (
        <p className="text-muted-foreground text-sm">
          {fill(labels.previewLimit, { count: preview.members.length })}
        </p>
      ) : null}
      <details>
        <summary className="text-link min-h-11 cursor-pointer py-3 text-sm">
          {labels.technicalPreview}
        </summary>
        <pre className="bg-muted max-h-80 overflow-auto rounded-lg p-3 text-xs break-words whitespace-pre-wrap">
          {JSON.stringify(preview, null, 2)}
        </pre>
      </details>
    </div>
  );

  return (
    <div className="collections-workspace">
      {readFailed || saveFailed || corrupt ? (
        <Alert variant="destructive">
          <AlertTitle>
            {corrupt
              ? labels.corruptError
              : readFailed
                ? labels.storageReadError
                : labels.storageError}
          </AlertTitle>
        </Alert>
      ) : null}
      {corrupt ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => download(corrupt.raw, "tiangong-portal-unreadable-shortlist.json")}
              type="button"
              variant="outline"
            >
              <DownloadIcon data-icon="inline-start" />
              {labels.downloadCorrupt}
            </Button>
            <Button onClick={() => setConfirmClear(true)} type="button" variant="destructive">
              {labels.clearCorrupt}
            </Button>
          </div>
          {confirmClear ? (
            <Alert variant="destructive">
              <AlertTitle>{labels.clearConfirm}</AlertTitle>
              <AlertDescription>
                <p>{labels.clearConfirmDescription}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      try {
                        localStorage.removeItem(corrupt.key);
                        storageBlocked.current = false;
                        setCorrupt(null);
                        setConfirmClear(false);
                        setState(emptyCollectionStateV2);
                      } catch {
                        setActionError(labels.storageError);
                      }
                    }}
                    type="button"
                    variant="destructive"
                  >
                    {labels.clearConfirm}
                  </Button>
                  <Button onClick={() => setConfirmClear(false)} type="button" variant="outline">
                    {labels.shareCancel}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}
        </section>
      ) : null}

      <fieldset className="flex min-w-0 flex-col gap-6" disabled={!hydrated || Boolean(corrupt)}>
        <details className="collection-details">
          <summary>{state.researchName || labels.detailsTitle}</summary>
          <Card>
            <CardHeader>
              <CardTitle>{labels.detailsTitle}</CardTitle>
              <CardDescription>{labels.detailsDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="collection-name">{labels.researchName}</FieldLabel>
                  <Input
                    id="collection-name"
                    maxLength={128}
                    onChange={(event) => setState({ ...state, researchName: event.target.value })}
                    value={state.researchName}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="collection-purpose">{labels.purpose}</FieldLabel>
                  <Textarea
                    id="collection-purpose"
                    maxLength={512}
                    onChange={(event) => setState({ ...state, purpose: event.target.value })}
                    value={state.purpose}
                  />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </details>
      </fieldset>
      <Card className="collection-tools collection-backup">
        <CardHeader>
          <CardTitle>{labels.backupTitle}</CardTitle>
          <CardDescription>{labels.backupDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!hydrated || Boolean(corrupt)}
              onClick={() =>
                download(JSON.stringify(state, null, 2), "tiangong-portal-shortlist.json")
              }
              type="button"
              variant="outline"
            >
              <DownloadIcon data-icon="inline-start" />
              {labels.export}
            </Button>
            <Button
              disabled={!hydrated || importing}
              aria-busy={importing}
              className="portal-pending-control"
              data-pending={importing || undefined}
              onClick={() => fileInput.current?.click()}
              type="button"
              variant="outline"
            >
              <UploadIcon data-icon="inline-start" />
              {labels.import}
              <PendingFeedback pending={importing} />
            </Button>
          </div>
          <input
            disabled={importing}
            accept="application/json,.json"
            aria-label={labels.import}
            className="hidden"
            id="collection-import"
            onChange={async (event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              if (!file) return;
              try {
                if (file.size > maxCollectionImportBytes) {
                  setActionError(labels.importTooLarge);
                  return;
                }
                setImporting(true);
                const imported = parseCollectionJsonV2(await file.text());
                setPendingImport({ state: imported, source: "file", filename: file.name });
                setActionError("");
              } catch {
                setActionError(labels.error);
              } finally {
                setImporting(false);
                input.value = "";
              }
            }}
            ref={fileInput}
            type="file"
          />
          {pendingImport ? (
            <section
              aria-label={labels.importTitle}
              className="flex flex-col gap-4 rounded-lg border p-4"
            >
              <h2 className="font-heading text-lg font-semibold">{labels.importTitle}</h2>
              {pendingImport.filename ? (
                <p className="text-muted-foreground text-sm break-all">{pendingImport.filename}</p>
              ) : null}
              <p className="text-sm">
                {pendingImport.source === "file"
                  ? labels.importDescription
                  : labels.mergeDescription}
              </p>
              {proposedImport ? (
                previewState(proposedImport)
              ) : (
                <Alert variant="destructive">
                  <AlertDescription>{labels.memberLimit}</AlertDescription>
                </Alert>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!proposedImport}
                  onClick={() => {
                    if (!proposedImport) return;
                    try {
                      setState(proposedImport);
                      setPendingImport(null);
                      storageBlocked.current = false;
                      setCorrupt(null);
                      setPage(0);
                      setMessage(labels.imported);
                      setActionError("");
                    } catch {
                      setActionError(labels.memberLimit);
                    }
                  }}
                  type="button"
                >
                  {pendingImport.source === "file" ? labels.importConfirm : labels.mergeConfirm}
                </Button>
                <Button onClick={() => setPendingImport(null)} type="button" variant="outline">
                  {labels.shareCancel}
                </Button>
              </div>
            </section>
          ) : null}
        </CardContent>
      </Card>

      <Card className="collection-tools collection-share">
        <CardHeader>
          <CardTitle>{labels.shareTitle}</CardTitle>
          <CardDescription>{labels.shareDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={state.members.length === 0}
              onClick={() => {
                void copyShare(null);
              }}
              type="button"
              variant="outline"
            >
              <LinkIcon data-icon="inline-start" />
              {labels.share}
            </Button>
            <Button
              disabled={state.members.length === 0}
              onClick={() => {
                setDisclosure(state);
                setActionError("");
              }}
              type="button"
              variant="outline"
            >
              <EyeIcon data-icon="inline-start" />
              {labels.shareWithNotes}
            </Button>
          </div>
          {disclosure ? (
            <section
              aria-label={labels.sharePreview}
              className="flex flex-col gap-4 rounded-lg border p-4"
            >
              <h2 className="font-heading text-lg font-semibold">{labels.sharePreview}</h2>
              <p className="text-sm">{labels.shareDisclosure}</p>
              {previewState(disclosure)}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    void copyShare(disclosure);
                  }}
                  type="button"
                >
                  {labels.shareConfirm}
                </Button>
                <Button onClick={() => setDisclosure(null)} type="button" variant="outline">
                  {labels.shareCancel}
                </Button>
              </div>
            </section>
          ) : null}
        </CardContent>
      </Card>
      <fieldset className="flex min-w-0 flex-col gap-6" disabled={!hydrated || Boolean(corrupt)}>
        <details className="collection-add-shell">
          <summary>
            <PlusIcon aria-hidden="true" />
            {labels.add}
          </summary>
          <form
            className="collection-add flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const ref = newRef.trim();
              if (!isExactDatasetRef(ref)) {
                setFormError("invalidRef");
                return;
              }
              try {
                setState(mergeCollectionMembers(state, [{ kind: newKind, ref }]));
                setNewRef("");
                setFormError(null);
                setPage(0);
              } catch {
                setFormError("memberLimit");
              }
            }}
          >
            <FieldLabel htmlFor="collection-member">{labels.memberRef}</FieldLabel>
            <div className="grid gap-2 sm:grid-cols-[max-content_minmax(0,1fr)_auto] sm:items-center">
              <select
                aria-label={labels.kind}
                className="border-input bg-background h-11 min-w-0 rounded-lg border px-3 text-sm"
                onChange={(event) =>
                  setNewKind(
                    event.target.value === "process" || event.target.value === "flow"
                      ? event.target.value
                      : null,
                  )
                }
                value={newKind ?? "unknown"}
              >
                <option value="unknown">{labels.kind}</option>
                <option value="process">{common.process}</option>
                <option value="flow">{common.flow}</option>
              </select>
              <Input
                aria-describedby="collection-member-help"
                aria-invalid={Boolean(formError)}
                className="min-w-0"
                id="collection-member"
                maxLength={46}
                onBlur={() => {
                  if (formError === "invalidRef" && isExactDatasetRef(newRef.trim())) {
                    setFormError(null);
                  }
                }}
                onChange={(event) => setNewRef(event.target.value)}
                placeholder={labels.memberPlaceholder}
                value={newRef}
              />
              <Button type="submit">
                <PlusIcon data-icon="inline-start" />
                {labels.add}
              </Button>
            </div>
            {formError ? (
              <FieldError id="collection-member-help">{labels[formError]}</FieldError>
            ) : (
              <FieldDescription id="collection-member-help">{labels.memberHelp}</FieldDescription>
            )}
          </form>
        </details>

        {state.members.length === 0 && (!hydrated || corrupt || readFailed) ? null : state.members
            .length === 0 ? (
          <Alert className="collection-empty">
            <AlertDescription>
              <p>{labels.empty}</p>
              <Link className="collection-empty-action" href={localePath(locale, "search")}>
                {common.search}
              </Link>
            </AlertDescription>
          </Alert>
        ) : (
          <section className="collection-members flex flex-col gap-3">
            <h2 className="sr-only">{labels.title}</h2>
            <p className="text-muted-foreground text-sm">
              {fill(labels.visibleRange, {
                from: pageIndex * 10 + 1,
                to: Math.min(pageIndex * 10 + 10, state.members.length),
                count: state.members.length,
              })}
            </p>
            <CatalogResultList>
              {visibleMembers.map((member) => {
                const key = collectionMemberKey(member);
                const summary = summaries[key];
                const match = summary?.status === "resolved" ? summary.matches[0] : undefined;
                const knownKind = member.kind ?? match?.kind;
                const href = knownKind
                  ? localePath(locale, `${knownKind}/${encodeURIComponent(member.ref)}`)
                  : undefined;
                return (
                  <CatalogResultRow
                    key={key}
                    title={
                      match && href ? (
                        <Link href={href} prefetch={false}>
                          {match.name}
                        </Link>
                      ) : (
                        <span className="text-base">
                          {summary?.status === "ambiguous"
                            ? labels.ambiguous
                            : summary?.status === "unavailable"
                              ? labels.noPublicVersion
                              : summary?.status === "temporarily_unavailable"
                                ? labels.summaryFailure
                                : labels.summaryLoading}
                        </span>
                      )
                    }
                    tags={
                      <>
                        <DatasetVersionTag
                          version={member.ref.split("@")[1] ?? ""}
                          label={versionLabel}
                        />
                        <Badge variant="outline">
                          {knownKind ? common[knownKind] : labels.unknownKind}
                        </Badge>
                      </>
                    }
                    action={
                      <div className="catalog-result-actions">
                        <CatalogCopyIdentity reference={member.ref} />
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={labels.remove}
                          title={labels.remove}
                          onClick={() =>
                            setState({
                              ...state,
                              members: state.members.filter(
                                (entry) => collectionMemberKey(entry) !== key,
                              ),
                            })
                          }
                        >
                          <Trash2Icon aria-hidden="true" />
                        </Button>
                      </div>
                    }
                  >
                    <div className="collection-record-editors">
                      {!member.kind && summary?.matches.length ? (
                        <div className="collection-record-resolution flex flex-wrap gap-2">
                          {summary.matches.map((option) => (
                            <Button
                              key={option.kind}
                              onClick={() => updateMember(key, { kind: option.kind })}
                              type="button"
                              variant="outline"
                            >
                              {labels.confirmKind}: {common[option.kind]}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                      {summary?.status === "temporarily_unavailable" ? (
                        <Button
                          className="collection-record-resolution min-h-11 self-start"
                          onClick={retry}
                          type="button"
                          variant="outline"
                        >
                          {common.retry}
                        </Button>
                      ) : null}
                      <Field>
                        <FieldLabel htmlFor={`status-${key}`}>{labels.status}</FieldLabel>
                        <select
                          className="border-input bg-background h-11 w-full rounded-lg border px-3 text-sm sm:max-w-xs"
                          id={`status-${key}`}
                          onChange={(event) => {
                            const status = event.target.value;
                            if (
                              status === "candidate" ||
                              status === "selected" ||
                              status === "excluded"
                            )
                              updateMember(key, { status });
                          }}
                          value={member.status}
                        >
                          {(["candidate", "selected", "excluded"] as const).map((status) => (
                            <option key={status} value={status}>
                              {labels[status]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`note-${key}`}>{labels.note}</FieldLabel>
                        <Textarea
                          id={`note-${key}`}
                          maxLength={512}
                          onChange={(event) => updateMember(key, { note: event.target.value })}
                          value={member.note}
                        />
                      </Field>
                    </div>
                  </CatalogResultRow>
                );
              })}
            </CatalogResultList>
            {state.members.length > 10 ? (
              <nav aria-label={labels.title} className="flex justify-between gap-3">
                <Button
                  disabled={pageIndex === 0}
                  onClick={() => setPage(pageIndex - 1)}
                  type="button"
                  variant="outline"
                >
                  {common.previous}
                </Button>
                <Button
                  disabled={(pageIndex + 1) * 10 >= state.members.length}
                  onClick={() => setPage(pageIndex + 1)}
                  type="button"
                  variant="outline"
                >
                  {common.next}
                </Button>
              </nav>
            ) : null}
          </section>
        )}
      </fieldset>

      {actionError ? (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}
      <output className="text-muted-foreground min-h-5 text-sm">
        {message || (hydrated && !readFailed && !saveFailed && !corrupt ? labels.saved : "")}
      </output>
    </div>
  );
}
