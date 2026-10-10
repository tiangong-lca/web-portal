import { describe, expect, it, vi } from "vitest";

import hmacFixture from "../fixtures/hmac/portal-hmac-v1.json";
import fixture from "../fixtures/portal/catalog-v1.json";

import {
  PortalLciaInputError,
  portalDataProductFunctionPath,
  queryPublishedLciaRaw,
} from "@/server/lcia/client";
import { readPortalLciaEnvironment } from "@/server/lcia/environment";

const environment = {
  supabaseUrl: "https://project.supabase.co",
  publishableKey: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
  timeoutMilliseconds: 1000,
  dataBrandScope: {
    allowedBrandCodes: ["tiangong_lca"] as const,
    identity: "portal-display-scope.v1:tiangong_lca",
  },
  edgeOrigin: "https://project.supabase.co",
  edgeTimeoutMilliseconds: 1000,
  keyId: hmacFixture.keyId,
  secret: hmacFixture.secret,
};
const input = {
  mode: "process_all_impacts",
  processRefs: [{ id: "11111111-1111-1111-1111-111111111111", version: "01.00.000" }],
  impactCategoryId: null,
  cursor: null,
  limit: 20,
};
const correlationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("Portal signed LCIA client", () => {
  it("signs and forwards one exact raw body without bearer credentials", async () => {
    const rawText = `  ${JSON.stringify(input)}\n`;
    const rawBody = new TextEncoder().encode(rawText);
    const fetchImplementation = vi.fn<typeof fetch>(async (..._arguments) =>
      Response.json(fixture.lcia),
    );

    const result = await queryPublishedLciaRaw(rawBody, {
      environment,
      fetchImplementation,
      now: () => hmacFixture.timestamp * 1000,
      nonce: () => hmacFixture.nonce,
      correlationId,
    });

    expect(result.status).toBe("available");
    expect(result.data?.rows[0]?.value).toBe("12.5");
    expect(typeof result.data?.rows[0]?.value).toBe("string");

    const [target, init] = fetchImplementation.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(target instanceof URL ? target.href : new Request(target).url).toBe(
      `https://project.supabase.co${portalDataProductFunctionPath}`,
    );
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe(
      JSON.stringify({
        ...input,
        schemaVersion: "portal.published-lcia-request.v2",
        allowedBrandCodes: ["tiangong_lca"],
      }),
    );
    expect(headers.get("apikey")).toBe(environment.publishableKey);
    expect(headers.get("x-portal-key-id")).toBe(environment.keyId);
    expect(headers.get("x-portal-body-sha256")).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(headers.get("x-portal-signature")).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(headers.get("x-portal-correlation-id")).toBe(correlationId);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
    expect(JSON.stringify(init)).not.toContain(environment.secret);
  });

  it("models a missing publication as unavailable, never numeric zero", async () => {
    const result = await queryPublishedLciaRaw(new TextEncoder().encode(JSON.stringify(input)), {
      environment,
      fetchImplementation: vi.fn<typeof fetch>(async () => Response.json(null)),
      nonce: () => hmacFixture.nonce,
    });

    expect(result).toEqual({ status: "unavailable", data: null });
    expect(JSON.stringify(result)).not.toContain('"value":0');
  });

  it("fails closed to a temporary-unavailable state on guard or contract failure", async () => {
    const rawBody = new TextEncoder().encode(JSON.stringify(input));
    expect(
      await queryPublishedLciaRaw(rawBody, {
        environment,
        fetchImplementation: vi.fn<typeof fetch>(async () =>
          Response.json({ code: "guard_unavailable" }, { status: 503 }),
        ),
        nonce: () => hmacFixture.nonce,
      }),
    ).toEqual({ status: "temporarily_unavailable", data: null });

    expect(
      await queryPublishedLciaRaw(rawBody, {
        environment,
        fetchImplementation: vi.fn<typeof fetch>(async () =>
          Response.json({ ...fixture.lcia, locator: "private" }),
        ),
        nonce: () => hmacFixture.nonce,
      }),
    ).toEqual({ status: "temporarily_unavailable", data: null });

    expect(
      await queryPublishedLciaRaw(rawBody, {
        environment,
        fetchImplementation: vi.fn<typeof fetch>(async () =>
          Response.json({ ...fixture.lcia, mode: "processes_one_impact" }),
        ),
        nonce: () => hmacFixture.nonce,
      }),
    ).toEqual({ status: "temporarily_unavailable", data: null });
  });

  it("rejects malformed input before making any upstream request", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    await expect(
      queryPublishedLciaRaw(
        new TextEncoder().encode(
          JSON.stringify({ ...input, processRefs: [], actor: "forged-service-role" }),
        ),
        { environment, fetchImplementation, nonce: () => hmacFixture.nonce },
      ),
    ).rejects.toBeInstanceOf(PortalLciaInputError);
    await expect(
      queryPublishedLciaRaw(
        new TextEncoder().encode(
          JSON.stringify({ mode: input.mode, processRefs: input.processRefs }),
        ),
        { environment, fetchImplementation, nonce: () => hmacFixture.nonce },
      ),
    ).rejects.toBeInstanceOf(PortalLciaInputError);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("validates the complete LCIA signer environment", () => {
    expect(() =>
      readPortalLciaEnvironment({
        PORTAL_DATA_BRANDS: "tiangong_lca",
        SUPABASE_URL: environment.supabaseUrl,
        SUPABASE_PUBLISHABLE_KEY: environment.publishableKey,
        PORTAL_EDGE_KEY_ID: environment.keyId,
        PORTAL_EDGE_HMAC_SECRET: "c2hvcnQ",
      }),
    ).toThrow("at least 256 bits");

    expect(() =>
      readPortalLciaEnvironment({
        PORTAL_DATA_BRANDS: "tiangong_lca",
        SUPABASE_URL: environment.supabaseUrl,
        SUPABASE_PUBLISHABLE_KEY: environment.publishableKey,
        PORTAL_EDGE_KEY_ID: "_preview",
        PORTAL_EDGE_HMAC_SECRET: environment.secret,
      }),
    ).toThrow("Invalid string");
  });
});
