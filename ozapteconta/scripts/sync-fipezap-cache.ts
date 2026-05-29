/**
 * Sincroniza cache em disco do FipeZap (Ipeadata → JSON local).
 * Uso: npx ts-node --project tsconfig.seed.json scripts/sync-fipezap-cache.ts
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../backend/.env") });

import { config } from "../backend/src/config";
import { writeDiskJson, fetchJsonOnce } from "../backend/src/services/externalData/externalDataClient";
import { listSupportedFipeZapCities } from "../backend/src/services/fipeZapService";

interface IpeadataValorRow {
  VALDATA: string;
  VALVALOR: number;
}

interface IpeadataValoresResponse {
  value: IpeadataValorRow[];
}

const SERIES: Record<string, { venda: string; locacao?: string }> = {
  brasil: { venda: "FIPE12_VENBR12", locacao: "FIPE12_LOCBR12" },
  "sao-paulo": { venda: "FIPE12_VENSP12", locacao: "FIPE12_LOCSP12" },
  "rio-de-janeiro": { venda: "FIPE12_VENRJ12", locacao: "FIPE12_LOCRJ12" },
  "belo-horizonte": { venda: "FIPE12_VENBH12" },
  curitiba: { venda: "FIPE12_VENCWB12" },
  "porto-alegre": { venda: "FIPE12_VENPOA12" },
};

async function syncSerie(
  citySlug: string,
  segment: "venda" | "locacao",
  serieCodigo: string,
): Promise<boolean> {
  const base = config.externalData.ipeadataBaseUrl.replace(/\/$/, "");
  const url =
    `${base}/ValoresSerie(SERCODIGO='${encodeURIComponent(serieCodigo)}')` +
    "?$top=2&$orderby=VALDATA%20desc";

  try {
    const payload = await fetchJsonOnce<IpeadataValoresResponse>("ipeadata", url);
    const rows = payload?.value;
    if (!Array.isArray(rows) || rows.length < 2) {
      console.warn(`⚠️ ${citySlug}/${segment}: dados insuficientes`);
      return false;
    }

    const latest = rows[0];
    const previous = rows[1];
    const variationPct =
      previous.VALVALOR === 0
        ? 0
        : ((latest.VALVALOR - previous.VALVALOR) / previous.VALVALOR) * 100;

    const date = new Date(latest.VALDATA);
    const referenceMonth = Number.isNaN(date.getTime())
      ? String(latest.VALDATA).slice(0, 7)
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    const filePath = path.join(
      config.externalData.fipeZapDiskCacheDir,
      `${citySlug}_${segment}.json`,
    );

    /* SANITY CHECK: gravação em disco */
    writeDiskJson(filePath, {
      referenceMonth,
      scope: citySlug,
      citySlug: citySlug === "brasil" ? undefined : citySlug,
      segment,
      variationPct,
      indexValue: latest.VALVALOR,
      sourceSlug: "ipeadata",
      fetchedAt: new Date().toISOString(),
    });

    console.log(`✅ ${citySlug}/${segment} → ${referenceMonth} (${variationPct.toFixed(2)}%)`);
    return true;
  } catch (err) {
    console.warn(`❌ ${citySlug}/${segment}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log("🔄 Sync FipeZap cache...");
  const cities = listSupportedFipeZapCities();
  let ok = 0;
  let fail = 0;

  for (const citySlug of cities) {
    const series = SERIES[citySlug];
    if (!series) continue;

    if (await syncSerie(citySlug, "venda", series.venda)) ok += 1;
    else fail += 1;

    if (series.locacao) {
      if (await syncSerie(citySlug, "locacao", series.locacao)) ok += 1;
      else fail += 1;
    }
  }

  console.log(`\nConcluído: ${ok} ok, ${fail} falhas`);
  if (fail > 0 && ok === 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
