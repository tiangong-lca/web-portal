import { createHash } from "node:crypto";

import { expect, test, type APIRequestContext } from "@playwright/test";

import environmentFixture from "../fixtures/portal/r1-environments.json" with { type: "json" };

const fixtureOrigin = `http://127.0.0.1:${process.env.PORTAL_FIXTURE_PORT ?? "4328"}`;

type FixtureLciaReceipt = {
  schemaVersion: "portal.r1-fixture-lcia-receipt.v1";
  receipt: { correlationId: string };
};

type FixtureRpcReceipt = {
  schemaVersion: "portal.r1-fixture-rpc-receipt.v1";
  count: number;
  receipt: { bodySha256: string; name: string };
};

async function fixtureRpcReceipt(
  request: APIRequestContext,
  name: string,
  bodySha256: string,
): Promise<FixtureRpcReceipt> {
  const response = await request.get(
    `${fixtureOrigin}/receipts/rpc/${encodeURIComponent(name)}/${bodySha256}`,
  );
  expect(response.ok()).toBe(true);
  return (await response.json()) as FixtureRpcReceipt;
}

async function fixtureLciaReceipt(
  request: APIRequestContext,
  correlationId: string,
): Promise<FixtureLciaReceipt> {
  const response = await request.get(
    `${fixtureOrigin}/receipts/lcia/${encodeURIComponent(correlationId)}`,
  );
  expect(response.ok()).toBe(true);
  return (await response.json()) as FixtureLciaReceipt;
}

test("deduplicates the exact public detail envelope within one render", async ({
  page,
  request,
}) => {
  const probeId = `8${crypto.randomUUID().slice(1)}`;
  const response = await page.goto(`/zh-CN/process/${probeId}@01.00.000`);

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Electricity, medium voltage",
  );
  const expectedBody = JSON.stringify({
    p_kind: "process",
    p_id: probeId,
    p_version: "01.00.000",
    p_allowed_brands: ["tiangong_lca"],
  });
  const bodySha256 = createHash("sha256").update(expectedBody).digest("hex");
  const receipt = await fixtureRpcReceipt(request, "portal_get_dataset_v2", bodySha256);
  expect(receipt).toMatchObject({
    schemaVersion: "portal.r1-fixture-rpc-receipt.v1",
    count: 1,
    receipt: { bodySha256, name: "portal_get_dataset_v2" },
  });
});

test("routes signed LCIA through the isolated Preview fixture", async ({ page, request }) => {
  const fixtureHealth = await request.get(`${fixtureOrigin}/health`);
  expect(fixtureHealth.ok()).toBe(true);
  expect(await fixtureHealth.json()).toEqual({
    schemaVersion: "portal.r1-fixture-health.v1",
    environment: "preview",
  });

  await page.goto("/zh-CN");
  const result = await page.evaluate(
    async (body) => {
      const response = await fetch("/internal/lcia", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      });
      return {
        status: response.status,
        payload: (await response.json()) as unknown,
        correlationId: response.headers.get("x-portal-correlation-id"),
      };
    },
    {
      mode: "process_all_impacts",
      processRefs: [{ id: "11111111-1111-1111-1111-111111111111", version: "01.00.000" }],
      impactCategoryId: null,
      cursor: null,
      limit: 20,
    },
  );

  expect(result.status, JSON.stringify(result.payload)).toBe(200);
  expect(result.payload).toMatchObject({
    schemaVersion: "portal.lcia-bff.v1",
    status: "available",
    data: {
      schemaVersion: "portal.published-lcia-page.v1",
      rows: [{ value: "12.5", evidenceStatus: "verified" }],
    },
  });
  expect(result.correlationId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
  );
  const receipt = await fixtureLciaReceipt(request, result.correlationId!);
  expect(receipt.receipt.correlationId).toBe(result.correlationId);
  expect(JSON.stringify(result.payload)).not.toContain(environmentFixture.preview.hmacSecret);
  expect(JSON.stringify(result.payload)).not.toContain("service_role");
});

test("keeps concurrent LCIA receipts addressable by correlation ID", async ({ request }) => {
  const correlationIds = [crypto.randomUUID(), crypto.randomUUID()];
  const body = {
    mode: "process_all_impacts",
    processRefs: [{ id: "11111111-1111-1111-1111-111111111111", version: "01.00.000" }],
    impactCategoryId: null,
    cursor: null,
    limit: 20,
  };

  const responses = await Promise.all(
    correlationIds.map((correlationId) =>
      request.post("/internal/lcia", {
        data: body,
        headers: { "x-portal-correlation-id": correlationId },
      }),
    ),
  );
  expect(responses.map((response) => response.status())).toEqual([200, 200]);

  const receipts = await Promise.all(
    correlationIds.map((correlationId) => fixtureLciaReceipt(request, correlationId)),
  );
  expect(receipts.map((receipt) => receipt.receipt.correlationId)).toEqual(correlationIds);
});
