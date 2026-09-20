/**
 * The pinned Database navigation contract snapshot.
 *
 * The Chinese layer binds three administrative parents from evidence rather than
 * from a code shape. One half of that evidence is the canonical node the Database
 * publishes; this module reads it, verifies the bytes against the snapshot
 * manifest, and exposes both the nodes and the receipt the layers record.
 *
 * The snapshot is a build input, not a runtime dependency: nothing here is
 * fetched, and the Portal never reads a sibling checkout.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sha256Hex } from "./sources.mjs";

export const CONTRACT_ROOT = "contracts/database-engine/portal";
export const CONTRACT_MANIFEST = `${CONTRACT_ROOT}/manifest.json`;
export const NAVIGATION_VOCABULARY = `${CONTRACT_ROOT}/navigation-vocabulary.json`;

/**
 * Read the snapshot and prove the vocabulary is the file the manifest describes.
 * A drifted or half-synced snapshot fails here rather than silently weakening a
 * binding gate.
 */
export function loadNavigationContract(root) {
  const manifest = JSON.parse(readFileSync(join(root, CONTRACT_MANIFEST), "utf8"));
  if (manifest.schemaVersion !== "portal.database-contract-snapshot.v1") {
    throw new Error(`Unexpected contract snapshot schema: ${manifest.schemaVersion}`);
  }
  const declared = manifest.files?.find((file) => file.path === "navigation-vocabulary.json");
  if (!declared) throw new Error("The contract snapshot does not list the navigation vocabulary.");
  const bytes = readFileSync(join(root, NAVIGATION_VOCABULARY));
  const verified = sha256Hex(bytes);
  if (verified !== declared.sha256 || bytes.byteLength !== declared.bytes) {
    throw new Error(
      `The navigation vocabulary does not match the contract snapshot: ${verified} != ${declared.sha256}. Re-run the contract sync.`,
    );
  }
  const vocabulary = JSON.parse(bytes.toString("utf8"));
  const nodes = new Map(vocabulary.nodes.map((node) => [node.nodeId, node]));
  return {
    nodes,
    nodeById: (nodeId) => nodes.get(nodeId) ?? null,
    receipt: {
      schemaVersion: manifest.schemaVersion,
      sourceRepository: manifest.sourceRepository,
      sourceCommit: manifest.sourceCommit,
      vocabulary: {
        byteLength: declared.bytes,
        path: NAVIGATION_VOCABULARY,
        sha256: declared.sha256,
      },
    },
  };
}
