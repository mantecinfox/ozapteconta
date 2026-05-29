-- Prioridade numerada para fallback de IA (texto e áudio)
ALTER TABLE ai_provider_config
  ADD COLUMN IF NOT EXISTS text_priority INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audio_priority INTEGER NOT NULL DEFAULT 0;

-- Migrar isDefault → text_priority = 1
UPDATE ai_provider_config
SET text_priority = 1, enabled = TRUE
WHERE is_default = TRUE AND text_priority = 0;

-- Demais habilitados: 2, 3, 4… por id
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY id ASC) + 1 AS next_priority
  FROM ai_provider_config
  WHERE enabled = TRUE
    AND is_default = FALSE
    AND text_priority = 0
)
UPDATE ai_provider_config AS cfg
SET text_priority = ranked.next_priority
FROM ranked
WHERE cfg.id = ranked.id;

-- Áudio: is_audio_default → audio_priority = 1
UPDATE ai_provider_config
SET audio_priority = 1
WHERE is_audio_default = TRUE AND audio_priority = 0;
