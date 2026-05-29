CREATE TABLE IF NOT EXISTS "vehicle_silhouette_cache" (
    "id" SERIAL PRIMARY KEY,
    "brandSlug" VARCHAR(50) NOT NULL,
    "modelSlug" VARCHAR(120) NOT NULL,
    "vehicleType" VARCHAR(20) NOT NULL,
    "silhouetteKey" VARCHAR(30) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_silhouette_cache_brandSlug_modelSlug_vehicleType_key"
  ON "vehicle_silhouette_cache"("brandSlug", "modelSlug", "vehicleType");
CREATE INDEX IF NOT EXISTS "vehicle_silhouette_cache_vehicleType_silhouetteKey_idx"
  ON "vehicle_silhouette_cache"("vehicleType", "silhouetteKey");
