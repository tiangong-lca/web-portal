import type { BrandCode } from "../../contracts/database-engine/portal/generated/portal.common-types.v2";

const dataBrandCodes = [
  "tiangong_lca",
  "bafu",
  "uslci",
  "worldsteel",
] as const satisfies readonly BrandCode[];
const validCodes: ReadonlySet<string> = new Set(dataBrandCodes);

export type PortalDataBrandScope = Readonly<{
  allowedBrandCodes: readonly BrandCode[];
  identity: string;
}>;

/** Shared by build validation and server readiness; never derives from visual branding. */
export function readPortalDataBrandScope(
  environment: Readonly<Record<string, string | undefined>>,
): PortalDataBrandScope {
  const configured = environment.PORTAL_DATA_BRANDS;
  if (configured === undefined || configured.length === 0 || configured.length > 1024) {
    throw new Error("PORTAL_DATA_BRANDS must explicitly select supported data brands.");
  }
  const tokens = configured.split(",").map((token) => token.trim());
  if (tokens.some((token) => !validCodes.has(token))) {
    // Do not echo arbitrary environment values into build or runtime logs.
    throw new Error("PORTAL_DATA_BRANDS contains an empty or unsupported brand code.");
  }
  const allowedBrandCodes = Object.freeze([...new Set(tokens as BrandCode[])].sort());
  return Object.freeze({
    allowedBrandCodes,
    identity: `portal-display-scope.v1:${allowedBrandCodes.join(",")}`,
  });
}

/** A compiled deployment must not start serving under a different runtime scope. */
export function assertPortalDataBrandScopeMatches(
  expectedIdentity: string,
  environment: Readonly<Record<string, string | undefined>>,
): PortalDataBrandScope {
  const scope = readPortalDataBrandScope(environment);
  if (scope.identity !== expectedIdentity) {
    throw new Error("Portal data brand scope changed; rebuild and redeploy this instance.");
  }
  return scope;
}
