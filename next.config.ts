import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { readBrandConfig } from "./src/config/brand";
import {
  buildContentSecurityPolicy,
  contentSecurityPolicyHeader,
} from "./src/config/content-security-policy";
import { resolvePortalBuildSha } from "./src/config/deployment-build";

const isDevelopment = process.env.NODE_ENV !== "production";
const enforceContentSecurityPolicy = process.env.PORTAL_CSP_MODE === "enforce";
const strictCspProbe = process.env.PORTAL_EXPECT_STRICT_CSP === "1";
const allowFrameworkInline =
  !strictCspProbe && (process.env.PORTAL_CSP_PROFILE ?? "performance") === "performance";
const brandConfig = readBrandConfig(process.env);
const contentSecurityPolicy = buildContentSecurityPolicy({
  allowFrameworkInline,
  brandAssetOrigin: brandConfig.assetOrigin ? new URL(brandConfig.assetOrigin).origin : undefined,
  isDevelopment,
});
const cspHeader = contentSecurityPolicyHeader(contentSecurityPolicy, enforceContentSecurityPolicy);
const deploymentSha = resolvePortalBuildSha(process.env);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    PORTAL_BUILD_SHA: deploymentSha,
  },
  compiler: {
    async runAfterProductionCompile({ projectDir, distDir }) {
      // Turbopack's worker entrypoint emits an empty map despite browser maps being off.
      // Enforce the existing no-public-source-maps policy without changing private server maps.
      const publicOutput = resolve(projectDir, distDir, "static");
      const assets = await readdir(publicOutput, { recursive: true });
      await Promise.all(
        assets
          .filter((asset) => asset.endsWith(".map"))
          .map((asset) => rm(resolve(publicOutput, asset))),
      );
    },
  },
  experimental: {
    globalNotFound: true,
    sri: {
      algorithm: "sha256",
    },
  },
  async headers() {
    return [
      {
        source: "/maps/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/(.*)",
        headers: [
          cspHeader,
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/r0-compat/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Portal-Routing", value: "edgeone-native-v1" },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
