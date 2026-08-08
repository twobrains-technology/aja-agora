// Asserts determinísticos do golden-set (`pnpm eval`). A regra do CLAUDE.md
// manda: invariante verificável vira código (trajetória de artifacts/gates,
// HTTP, contaminação); prosa é do modelo — qualidade de fala é papel do juiz
// LLM (Evaluator no Langfuse), NUNCA daqui.

/** Marcadores de fallback degradado — HTTP 200 que significa "a LLM nunca
 * respondeu" (guard herdado do driver r9). Presença = cenário CONTAMINADO. */
export const DEFAULT_CONTAMINATION_MARKERS: readonly string[] = [
	"Acho que me perdi por aqui",
	"me perdi por aqui",
];

export type GoldenTurnResult = {
	userMsg: string;
	agentText: string;
	artifactTypes: string[];
	httpStatus: number | null;
	error: string | null;
};

export type GoldenTurnAsserts = {
	/** Todos precisam aparecer nos artifacts do turno (subset match). */
	expectArtifacts?: string[];
	/** Nenhum pode aparecer. */
	forbidArtifacts?: string[];
};

export type GoldenExpectations = {
	/** Somam-se aos DEFAULT_CONTAMINATION_MARKERS (checados em TODO turno). */
	forbidTextMarkers?: string[];
	/** Paralelo ao array de turnos; `null`/ausente = turno livre. */
	turns?: Array<GoldenTurnAsserts | null | undefined>;
};

export type ScenarioVerdict = { pass: boolean; failures: string[] };

export function checkScenario(
	turns: GoldenTurnResult[],
	expected: GoldenExpectations,
): ScenarioVerdict {
	const failures: string[] = [];
	const markers = [...DEFAULT_CONTAMINATION_MARKERS, ...(expected.forbidTextMarkers ?? [])];

	turns.forEach((t, i) => {
		const rotulo = `turno ${i + 1} ("${t.userMsg.slice(0, 40)}")`;
		if (t.error) failures.push(`${rotulo}: erro de transporte — ${t.error}`);
		else if (t.httpStatus !== 200) failures.push(`${rotulo}: HTTP ${t.httpStatus}`);

		const marker = markers.find((m) => t.agentText.includes(m));
		if (marker) failures.push(`${rotulo}: CONTAMINADO (fallback degradado: "${marker}")`);

		const asserts = expected.turns?.[i];
		if (!asserts) return;
		for (const esperado of asserts.expectArtifacts ?? []) {
			if (!t.artifactTypes.includes(esperado)) {
				failures.push(
					`${rotulo}: esperava artifact "${esperado}", veio [${t.artifactTypes.join(", ")}]`,
				);
			}
		}
		for (const proibido of asserts.forbidArtifacts ?? []) {
			if (t.artifactTypes.includes(proibido)) {
				failures.push(`${rotulo}: artifact PROIBIDO "${proibido}" apareceu`);
			}
		}
	});

	return { pass: failures.length === 0, failures };
}
