// O SYSTEM DO TURNO — só o prompt do vendedor.
//
// Este arquivo tinha 1.400 linhas de persona, especialista por categoria, regra
// dura de captura de nome e "não diga X". Em 20/10/2026 tudo isso saiu: a
// conduta é uma só e vive em `prompt-do-vendedor.ts`. Aqui ficam apenas os
// apelidos que o resto do código ainda importa, apontando para o MESMO texto —
// para que exista uma única fonte.
/** Compatibilidade: as sondas de avaliação chamavam este nome. É o mesmo texto. */
export {
	PROMPT_DO_VENDEDOR as SYSTEM_PROMPT,
	PROMPT_DO_VENDEDOR as SPECIALIST_BASE_PROMPT,
} from "./prompt-do-vendedor";

import type { InferSelectModel } from "drizzle-orm";
import type { personas } from "@/db/schema";

export type PersonaRow = InferSelectModel<typeof personas>;
export type ExpertiseLevel = "leigo" | "expert" | "neutro";
export type PromptBlocks = { stable: string; dynamic: string };
