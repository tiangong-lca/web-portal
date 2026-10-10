import "server-only";

import {
  readPortalDataBrandScope,
  assertPortalDataBrandScopeMatches,
  type PortalDataBrandScope,
} from "@/config/data-brands";

import { z } from "zod";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

const supabaseOriginSchema = z
  .url()
  .transform((value) => new URL(value))
  .refine(
    (url) =>
      url.protocol === "https:" || (url.protocol === "http:" && loopbackHosts.has(url.hostname)),
    "Supabase URL must use HTTPS (except loopback development)",
  )
  .refine(
    (url) =>
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "",
    "Supabase URL must be a credential-free origin",
  )
  .transform((url) => url.origin);

const publishableKeySchema = z
  .string()
  .trim()
  .min(16)
  .max(4096)
  .refine((value) => !/\s/u.test(value), "Publishable key must not contain whitespace")
  .refine(
    (value) => value.startsWith("sb_publishable_") && value.length > "sb_publishable_".length,
    "Only Supabase publishable keys are allowed",
  );

const rawEnvironmentSchema = z.strictObject({
  supabaseUrl: supabaseOriginSchema,
  publishableKey: publishableKeySchema,
  timeoutMilliseconds: z.coerce.number().int().min(250).max(8000).default(8000),
});

export type PortalDataEnvironment = z.infer<typeof rawEnvironmentSchema> & {
  dataBrandScope: PortalDataBrandScope;
};

export function readPortalDataEnvironment(
  environment: Record<string, string | undefined> = process.env,
): PortalDataEnvironment {
  const dataBrandScope = readPortalServerBrandScope(environment);
  return {
    ...rawEnvironmentSchema.parse({
      supabaseUrl: environment.SUPABASE_URL,
      publishableKey: environment.SUPABASE_PUBLISHABLE_KEY,
      timeoutMilliseconds: environment.PORTAL_SUPABASE_TIMEOUT_MS,
    }),
    dataBrandScope,
  };
}

export function readPortalServerBrandScope(
  environment: Record<string, string | undefined> = process.env,
): PortalDataBrandScope {
  const expectedIdentity = process.env.PORTAL_DATA_SCOPE_IDENTITY;
  return expectedIdentity
    ? assertPortalDataBrandScopeMatches(expectedIdentity, environment)
    : readPortalDataBrandScope(environment);
}
