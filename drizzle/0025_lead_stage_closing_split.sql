-- FIX-43: split do fechamento em 3 raias finais (na_administradora →
-- aguardando_pagamento → fechado_ganho), refletindo a mesa manual + boleto,
-- alimentadas por polling (FIX-44). Posicionadas ANTES de fechado_ganho pra
-- manter a ordem lógica do enum. Idempotente (IF NOT EXISTS).
ALTER TYPE "lead_stage" ADD VALUE IF NOT EXISTS 'na_administradora' BEFORE 'fechado_ganho';--> statement-breakpoint
ALTER TYPE "lead_stage" ADD VALUE IF NOT EXISTS 'aguardando_pagamento' BEFORE 'fechado_ganho';
