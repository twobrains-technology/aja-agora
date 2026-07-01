import type { ConversationMetadata } from "@/lib/agent/personas";
import type { UserIntent } from "@/lib/agent/qualify-state";
import type { ArtifactType } from "@/lib/chat/types";
import { revealValueTargetChanged } from "./tool-policy";
import { shouldEmitWhatsappOptin } from "./whatsapp-optin-guard";

/**
 * FIX-20 (bloco G) — segunda linha de defesa dos artifacts, em tabela
 * declarativa. Cada regra abaixo era um if inline no case tool-call do
 * runner (crescimento orgânico: cada bug de produção de 2026-06-02 a 06-05
 * adicionou um ramo). Todas compartilham a mesma assinatura lógica
 * `(meta, artifactType, contexto do turno) → suprimir|permitir` — é uma
 * tabela de regras, agora explícita.
 *
 * ── Onde este arquivo fica na governança (FIX-180, 2026-07-01) ──
 * A GOVERNANÇA PRIMÁRIA é a allowlist POSITIVA (Lei 2), em duas dimensões:
 *   1. ESTADO → AÇÃO: `tool-policy.ts` (`allowedTools`/`phaseFromMeta`) — tool
 *      fora de fase nem entra no request (fail-closed) + belt `prepareStep.activeTools`.
 *   2. AÇÃO → PRECONDIÇÃO (de dado): `action-policy.ts` (`evaluateActionPrecondition`) —
 *      tool de risco só age sobre grupo/administradora exibido (generaliza FIX-179).
 *
 * ESTE arquivo é a DEFESA-EM-PROFUNDIDADE (2ª linha) — NÃO a governança primária.
 * Segura: (a) o residual das regras de ESTADO que a tool-policy já cobre (é o 2º
 * cinto de whatsapp-optin/post-closure/premature-contract/value-picker-order); e
 * (b) o que é GENUINAMENTE PÓS-FATO e não representável como precondição pré-ação:
 *   - `single-option`: depende do `discoveryCount` (resultado da tool NO turno).
 *   - `reveal-loop`: parte é estado, parte é heurística de intent (userIntent +
 *     isUserTurn + revealValueTargetChanged).
 * Estes DOIS ficam aqui de propósito (não migram pra allowlist). Furo da policy
 * cuja tool estava fora de fase gera [tool-policy-violation] no runner.
 *
 * A ORDEM do array é semântica (primeira regra que aplica vence e assina o
 * log) e é travada por teste em artifact-guard.test.ts. Os formatos de
 * logLine são contrato — cassettes e grep de produção dependem deles.
 */
export type ArtifactGuardInput = {
	meta: ConversationMetadata;
	artifactType: ArtifactType;
	userIntent: UserIntent;
	isUserTurn: boolean;
	/** Tamanho da descoberta DESTE turno (tool-results de search/recommend);
	 * null = nenhuma descoberta rodou no turno. */
	discoveryCount: number | null;
	conversationId: string;
	/** Types dos artifacts já emitidos NESTE turno (reservado pra regras
	 * futuras de duplicação intra-turno — nenhuma regra atual consome). */
	turnArtifactTypes?: string[];
};

export type ArtifactGuardVerdict =
	| { allow: true }
	| { allow: false; rule: string; logLine: string };

type ArtifactGuardRule = {
	name: string;
	/** true = SUPRIMIR o artifact deste tool-call. */
	applies: (input: ArtifactGuardInput) => boolean;
	logLine: (input: ArtifactGuardInput) => string;
};

/** Família de artifacts de descoberta/simulação/decisão — morta no estado
 * terminal (FIX-11): pós-fechamento NENHUM deles volta, em qualquer intent. */
const POST_CLOSURE_FAMILY = new Set<ArtifactType>([
	"recommendation_card",
	"simulation_result",
	"comparison_table",
	"group_card",
	"contemplation_dial",
	"decision_prompt",
]);

export const ARTIFACT_GUARD_RULES: ArtifactGuardRule[] = [
	// PF-07: modelo pode chamar o optin 2x em conversa longa apesar do prompt.
	// BUG-OPTIN-ENGOLE-GATES (2026-06-04): optin no MEIO da qualificação
	// suprimia os gates lance-value/lance-embutido/identify. Pré-reveal ou
	// duplicado → suprime (regra determinística em whatsapp-optin-guard.ts).
	{
		name: "whatsapp-optin",
		applies: ({ artifactType, meta }) =>
			artifactType === "whatsapp_optin" && !shouldEmitWhatsappOptin(meta),
		logLine: ({ conversationId }) =>
			`[whatsapp-optin] guard: suprimindo artifact (pré-reveal ou duplicado) (conv=${conversationId})`,
	},
	// FIX-11 (rodada 2026-06-05 tarde): pós-fechamento, "qual status da
	// proposta?" re-rodava a descoberta e emitia recommendation_card +
	// simulation_result de OUTRA administradora (BANCO DO BRASIL pra quem JÁ
	// contratou CANOPUS). Estado terminal vale pra TODA a família de
	// descoberta/simulação/decisão, em qualquer intent.
	{
		name: "post-closure",
		applies: ({ meta, artifactType }) =>
			meta.contractClosed === true && POST_CLOSURE_FAMILY.has(artifactType),
		logLine: ({ artifactType, conversationId, userIntent }) =>
			`[post-closure] guard: suprimindo ${artifactType} pós-fechamento — estado terminal (conv=${conversationId}, intent=${userIntent})`,
	},
	// FIX-12 (rodada 2026-06-05 tarde): no gate identify o modelo chamou
	// present_contract_form (passo 5) — submit criou proposta REAL na Bevi
	// (CPF + bureau) sem o usuário ter visto UMA opção. contract_form SÓ passa
	// com reveal feito (revealCompleted !== true → suprime); antes disso,
	// identidade é assunto do gate identify do SERVIDOR. Com o artifact
	// suprimido o turno fica sem artifact e a avaliação de gates do runner
	// reconduz ao identify naturalmente.
	{
		name: "premature-contract",
		applies: ({ artifactType, meta }) =>
			artifactType === "contract_form" && meta.revealCompleted !== true,
		logLine: ({ conversationId, userIntent }) =>
			`[contract-gate] guard: suprimindo contract_form PRÉ-reveal — identidade é assunto do gate identify (conv=${conversationId}, intent=${userIntent})`,
	},
	// BUG-REVEAL-LOOP (2026-06-02): pós-reveal, num turno de usuário o agent
	// re-emitia os cards de DESCOBERTA a cada afirmativo ("ta otimo", "bora") —
	// loop que nunca cruzava pro passo 5. Chave em revealCompleted (não
	// searchDispatched): a flag liga em QUALQUER reveal, inclusive free-run do
	// próprio agent (comparison_table 5× no run real). O reveal original é o 1º
	// (revealCompleted ainda false) → passa. simulation_result só é suprimido
	// fora de what-if (providing_info = usuário pediu novo valor → re-simular é
	// legítimo). Inclui os dups do hardening (QA crítico 2026-06-02 + E2E real
	// 2026-06-04): decision_prompt re-emitido pós-decisionDispatched e
	// contract_form re-apresentado pós-Parabéns (contractClosed terminal).
	{
		name: "reveal-loop",
		applies: ({ meta, artifactType, userIntent, isUserTurn }) => {
			// FIX-68: trocou de FAIXA DE VALOR (valor-alvo ≠ o descoberto) → os cards
			// da NOVA faixa são re-descoberta legítima, não re-reveal. Não suprime —
			// a tool-policy já reabilitou search/recommend nesse caso. O afirmativo
			// curto na MESMA faixa (revealValueTargetChanged=false) continua caindo no
			// guard (BUG-REVEAL-LOOP intacto).
			const revealLoopActive =
				meta.revealCompleted === true && isUserTurn && !revealValueTargetChanged(meta);
			const isRereveal =
				revealLoopActive &&
				(artifactType === "comparison_table" ||
					artifactType === "recommendation_card" ||
					artifactType === "group_card" ||
					(artifactType === "simulation_result" && userIntent !== "providing_info"));
			const isDecisionDup =
				meta.decisionDispatched === true && isUserTurn && artifactType === "decision_prompt";
			const isContractDup = meta.contractClosed === true && artifactType === "contract_form";
			return isRereveal || isDecisionDup || isContractDup;
		},
		logLine: ({ artifactType, conversationId, userIntent }) =>
			`[reveal-loop] guard: suprimindo ${artifactType} re-emitido pós-reveal (conv=${conversationId}, intent=${userIntent})`,
	},
	// FIX-7 (single-option guard): descoberta retornou opção ÚNICA →
	// recommendation_card duplicaria o grupo do detalhamento. Suprime; o
	// simulation_result vira o card único do reveal.
	{
		name: "single-option",
		applies: ({ artifactType, discoveryCount }) =>
			artifactType === "recommendation_card" && discoveryCount === 1,
		logLine: ({ conversationId }) =>
			`[single-option] guard: suprimindo recommendation_card — descoberta retornou opção única (conv=${conversationId})`,
	},
	// FIX-53 (jornada2_revisão.docx — Bernardo, 2026-06-19): "Precisa pedir os
	// dados, antes do valor" + "Voltou a pedir o valor". O credit gate (value
	// picker server-emitido) já respeita a ordem nova via qualify-state; esta é
	// a 2ª linha de defesa se o MODELO chamar present_value_picker fora de ordem.
	// PRÉ-reveal, suprime o value_picker quando: (a) a identidade ainda não foi
	// coletada (dados ANTES do valor) OU (b) o valor já foi coletado (anti-
	// repetição — confirma em 1 frase e segue, nunca re-mostra o picker). PÓS-
	// reveal o picker é legítimo (ajuste de valor) — não cai aqui.
	{
		name: "value-picker-order",
		applies: ({ artifactType, meta }) =>
			artifactType === "value_picker" &&
			meta.revealCompleted !== true &&
			(meta.identityCollected !== true || meta.qualifyAnswers?.creditMax !== undefined),
		logLine: ({ meta, conversationId }) =>
			`[value-picker-order] guard: suprimindo value_picker pré-reveal — ${
				meta.identityCollected !== true ? "identidade ainda não coletada (dados antes do valor)" : "valor já coletado (anti-repetição)"
			} (conv=${conversationId})`,
	},
];

/** Avalia as regras NA ORDEM; a primeira que aplicar suprime e assina o log. */
export function evaluateArtifactGuards(input: ArtifactGuardInput): ArtifactGuardVerdict {
	for (const rule of ARTIFACT_GUARD_RULES) {
		if (rule.applies(input)) {
			return { allow: false, rule: rule.name, logLine: rule.logLine(input) };
		}
	}
	return { allow: true };
}
