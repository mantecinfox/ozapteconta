import { describe, it, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  ExternalDataError,
  fetchJsonWithFallback,
  type JsonFetchSource,
} from "../externalData/externalDataClient";

describe("externalDataClient.fetchJsonWithFallback", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("retorna primeira fonte válida", async () => {
    mock.method(globalThis, "fetch", async (url: string) => {
      if (String(url).includes("fail")) {
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => [{ data: "01/04/2026", valor: "0.67" }],
      };
    });

    const sources: JsonFetchSource<{ value: number; referenceDate: string }>[] = [
      {
        slug: "fail_source",
        url: "https://example.com/fail",
        parse: () => null,
      },
      {
        slug: "ok_source",
        url: "https://example.com/ok",
        parse: (payload) => {
          const rows = payload as Array<{ valor: string; data: string }>;
          return { value: parseFloat(rows[0].valor), referenceDate: rows[0].data };
        },
      },
    ];

    const result = await fetchJsonWithFallback(sources);
    assert.equal(result.sourceSlug, "ok_source");
    assert.equal(result.payload.value, 0.67);
  });

  it("lança ExternalDataError quando todas falham", async () => {
    mock.method(globalThis, "fetch", async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));

    const sources: JsonFetchSource<number>[] = [
      { slug: "a", url: "https://example.com/a", parse: () => 1 },
    ];

    await assert.rejects(
      () => fetchJsonWithFallback(sources),
      (err: unknown) => err instanceof ExternalDataError,
    );
  });
});
