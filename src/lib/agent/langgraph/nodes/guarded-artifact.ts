// FIX-361 — helper compartilhado: toda emissão de card passa por
// `evaluateArtifactGuards` (artifact-guard.ts, reusado tal-e-qual) ANTES de
// virar `TurnEvent`. Segunda linha de defesa (a allowlist primária é o
// `nextGate`/`decideShowGate` que decide o gate ativo) — pega o residual de
// pós-fechamento, re-reveal, duplicação intra-turno e o hold de
// reco-consent que nenhum desses dois cobre sozinho.
import {
	evaluateArtifactGuards,
	type ArtifactGuardInput,
} from "@/lib/agent/orchestrator/artifact-guard";

export type GuardContext = Omit<ArtifactGuardInput, "artifactType">;

/** Avalia o guard pro `artifactType`; loga (mesmo formato de `logLine`,
 * contrato de grep de produção) e devolve se a emissão é permitida. */
export function artifactAllowed(
	ctx: GuardContext,
	artifactType: ArtifactGuardInput["artifactType"],
): boolean {
	const verdict = evaluateArtifactGuards({ ...ctx, artifactType });
	if (!verdict.allow) {
		console.log(verdict.logLine);
		return false;
	}
	return true;
}
