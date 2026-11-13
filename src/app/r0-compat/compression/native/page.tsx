import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import {
  compressionProbeEnabled,
  compressionProbeText,
  observedAcceptEncoding,
} from "@/server/r0-compat/compression";

async function DeferredCompressionEvidence() {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return <p data-compression-complete>Deferred transport evidence complete.</p>;
}

export default async function CompressionNativeProbe() {
  await connection();
  if (!compressionProbeEnabled()) notFound();
  const encoding = observedAcceptEncoding((await headers()).get("accept-encoding"));
  return (
    <main>
      <h1>Native HTML transport qualification</h1>
      <output data-compression-accept-encoding>{encoding}</output>
      <p data-compression-shell>{compressionProbeText}</p>
      <Suspense fallback={<p>Waiting for synthetic evidence.</p>}>
        <DeferredCompressionEvidence />
      </Suspense>
    </main>
  );
}
