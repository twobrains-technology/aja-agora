-- FIX-363: a modalidade "Serviços" foi extinta (nunca deveria ter sido
-- ofertada — cliente simulou carta de serviços mesmo com os chips já
-- restringidos). Apaga a persona "Camila" ANTES de apertar o CHECK, senão a
-- linha existente viola a nova constraint.
DELETE FROM "personas" WHERE "id" = 'servicos';--> statement-breakpoint
ALTER TABLE "personas" DROP CONSTRAINT "personas_category_check";--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_category_check" CHECK ("personas"."category" IS NULL OR "personas"."category" IN ('imovel', 'auto', 'moto'));