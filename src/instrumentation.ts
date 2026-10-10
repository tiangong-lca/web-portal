import { assertPortalDataBrandScopeMatches } from "./config/data-brands";

/** Reject drift before this deployment instance can accept requests. */
export function register() {
  const identity = process.env.PORTAL_DATA_SCOPE_IDENTITY;
  if (!identity) throw new Error("Portal build has no data brand scope identity.");
  assertPortalDataBrandScopeMatches(identity, process.env);
}
