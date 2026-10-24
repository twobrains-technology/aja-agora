// QUEM PODE PEDIR CADA UM DOS 22 CARDS — e onde o payload de cada um nasce.
//
// O turno livre continua sem funil: quem conduz a conversa é o modelo. Mas card
// não é fala — o payload tem shape, e shape errado na tela é card quebrado ou
// card mentindo. Este módulo é o único lugar onde o destino é decidido:
//
//  · ESCOLHA (`quick_reply`, `value_picker`, `topic_picker`) — o payload é a
//    PERGUNTA e as opções, escritas pelo modelo e validadas aqui. Número neste
//    caminho é faixa de intenção ("até 80 mil"), nunca oferta.
//  · FATO (os outros 14 emitíveis) — o payload sai de dado real (carta,
//    proposta, estado da conversa), montado no servidor. `mostrar_card` recusa:
//    um card de número pedido pelo modelo seria número inventado.
//  · FORA DO MOTOR (5) — nascem do handler de confirmação ou de um experimento
//    A/B; emitir no turno duplicaria o beat ou quebraria a medição.

import type { ArtifactType } from "@/lib/chat/types";

export type DestinoDoCard =
	| { classe: "emitivel"; origem: "escolha" | "fato" }
	| { classe: "fora-do-motor"; motivo: string };

/** Os 22 tipos de `ArtifactByType`. O tipo `Record<ArtifactType, …>` é o
 * contrato: um tipo novo em `src/lib/chat/types.ts` **quebra o typecheck** aqui
 * até ganhar destino — é assim que card novo não some do motor em silêncio. */
export const DESTINO_DOS_CARDS: Record<ArtifactType, DestinoDoCard> = {
	comparison_table: { classe: "emitivel", origem: "fato" },
	real_offer: { classe: "emitivel", origem: "fato" },
	group_card: { classe: "emitivel", origem: "fato" },
	recommendation_card: { classe: "emitivel", origem: "fato" },
	simulation_result: { classe: "emitivel", origem: "fato" },
	financing_comparison: { classe: "emitivel", origem: "fato" },
	contemplation_dial: { classe: "emitivel", origem: "fato" },
	embedded_bid: { classe: "emitivel", origem: "fato" },
	two_paths: { classe: "emitivel", origem: "fato" },
	scarcity: { classe: "emitivel", origem: "fato" },
	lead_form: { classe: "emitivel", origem: "fato" },
	contract_form: { classe: "emitivel", origem: "fato" },
	whatsapp_optin: { classe: "emitivel", origem: "fato" },
	decision_prompt: { classe: "emitivel", origem: "fato" },
	quick_reply: { classe: "emitivel", origem: "escolha" },
	value_picker: { classe: "emitivel", origem: "escolha" },
	topic_picker: { classe: "emitivel", origem: "escolha" },
	signature_handoff: {
		classe: "fora-do-motor",
		motivo:
			"Nasce no handler de confirmação, depois de confirmOffer — antes dela não existe proposalUrl, que o card exige.",
	},
	atendimento_handoff: {
		classe: "fora-do-motor",
		motivo: "O fecho é do handler de confirmação; emitir no turno duplicaria o beat.",
	},
	telefone_do_desbloqueio: {
		classe: "fora-do-motor",
		motivo:
			"Quem decide é o experimento A/B do telefone (desbloqueio-do-telefone.ts); escolha do modelo quebraria a medição.",
	},
	document_upload: {
		classe: "fora-do-motor",
		motivo:
			"Retirado do fecho por decisão de 21/07/2026: quem pede documento é o atendente da adesão.",
	},
	scenarios: {
		classe: "fora-do-motor",
		motivo:
			"Os 3 cenários exigem projeção de prazo sem fonte real; fabricar o número violaria a regra de que número só sai de tool.",
	},
};

export const TIPOS_DE_ESCOLHA = ["quick_reply", "value_picker", "topic_picker"] as const;

export type TipoDeEscolha = (typeof TIPOS_DE_ESCOLHA)[number];

/** Card é decisão, não menu. Mesmo teto de `MAX_OPCOES_NA_COMPARACAO`: mais
 * opções que isso, o modelo oferece na conversa. Número num lugar só. */
export const MAX_OPCOES_NO_CARD = 4;

/** Teto de sanidade do `value_picker`: ali os números são a PERGUNTA (faixa de
 * intenção), e carta de consórcio não passa disso. */
const MAX_VALOR_DO_PICKER = 1_000_000;

const CATEGORIAS_DO_PICKER = ["imovel", "auto", "moto"] as const;

const TETO_DE_TEXTO = 200;

type ResultadoDaValidacao =
	| { ok: true; payload: Record<string, unknown> }
	| { ok: false; erro: string };

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
	return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function textoUtil(valor: unknown): string | null {
	if (typeof valor !== "string") return null;
	const limpo = valor.trim();
	return limpo.length === 0 ? null : limpo.slice(0, TETO_DE_TEXTO);
}

function ehNumero(valor: unknown): valor is number {
	return typeof valor === "number" && Number.isFinite(valor);
}

function recusa(erro: string): ResultadoDaValidacao {
	return { ok: false, erro };
}

function recusaDeTipo(tipo: string): ResultadoDaValidacao {
	const foraDoMotor = (DESTINO_DOS_CARDS as Record<string, DestinoDoCard | undefined>)[tipo];
	if (foraDoMotor?.classe === "fora-do-motor") {
		return recusa(
			`Card NÃO mostrado: "${tipo}" não sai do turno. ${foraDoMotor.motivo} Diga o que precisa em texto e siga a conversa.`,
		);
	}
	return recusa(
		`Card NÃO mostrado: "${tipo}" não é card de escolha. Card com número sai de dado de tool — use buscar_cartas ou fazer_proposta e ele aparece sozinho. Os tipos aceitos em mostrar_card são ${TIPOS_DE_ESCOLHA.join(", ")}.`,
	);
}

function validarQuickReply(payload: unknown): ResultadoDaValidacao {
	if (!ehObjeto(payload)) {
		return recusa("Card NÃO mostrado: quick_reply precisa de payload { options: [...] }.");
	}
	const bruto = payload.options;
	if (!Array.isArray(bruto) || bruto.length === 0) {
		return recusa(
			'Card NÃO mostrado: `options` vazio. Escreva de 1 a 4 opções, cada uma com `label` (o texto do botão, ex.: "Até 80 mil").',
		);
	}
	if (bruto.length > MAX_OPCOES_NO_CARD) {
		return recusa(
			`Card NÃO mostrado: quick_reply aceita no máximo ${MAX_OPCOES_NO_CARD} opções — card é decisão, não menu. Ofereça as demais na conversa.`,
		);
	}
	const options: Array<Record<string, unknown>> = [];
	for (const [indice, opcao] of bruto.entries()) {
		if (!ehObjeto(opcao)) {
			return recusa(`Card NÃO mostrado: a opção ${indice + 1} de quick_reply não é um objeto.`);
		}
		const label = textoUtil(opcao.label);
		if (!label) {
			return recusa(
				`Card NÃO mostrado: a opção ${indice + 1} de quick_reply está sem \`label\` — é ele que vira o botão.`,
			);
		}
		const normalizada: Record<string, unknown> = { label };
		const value = textoUtil(opcao.value);
		if (value) normalizada.value = value;
		const emoji = textoUtil(opcao.emoji);
		if (emoji) normalizada.emoji = emoji;
		options.push(normalizada);
	}
	return { ok: true, payload: { options } };
}

function validarValuePicker(payload: unknown): ResultadoDaValidacao {
	if (!ehObjeto(payload)) {
		return recusa(
			"Card NÃO mostrado: value_picker precisa de payload { category, fields: [...] }.",
		);
	}
	const categoria = payload.category;
	if (!CATEGORIAS_DO_PICKER.includes(categoria as (typeof CATEGORIAS_DO_PICKER)[number])) {
		return recusa(
			`Card NÃO mostrado: \`category\` de value_picker tem que ser ${CATEGORIAS_DO_PICKER.join(", ")} — não existe faixa de valor para "${String(categoria)}".`,
		);
	}
	const bruto = payload.fields;
	if (!Array.isArray(bruto) || bruto.length === 0) {
		return recusa(
			"Card NÃO mostrado: `fields` vazio. Escreva de 1 a 4 faixas, cada uma com `id`, `label`, `min`, `max` e `default`.",
		);
	}
	if (bruto.length > MAX_OPCOES_NO_CARD) {
		return recusa(
			`Card NÃO mostrado: value_picker aceita no máximo ${MAX_OPCOES_NO_CARD} campos — card é decisão, não menu.`,
		);
	}
	const fields: Array<Record<string, unknown>> = [];
	for (const [indice, campo] of bruto.entries()) {
		const onde = `o campo ${indice + 1} de value_picker`;
		if (!ehObjeto(campo)) return recusa(`Card NÃO mostrado: ${onde} não é um objeto.`);
		const id = textoUtil(campo.id);
		if (!id) return recusa(`Card NÃO mostrado: ${onde} está sem \`id\`.`);
		const label = textoUtil(campo.label);
		if (!label) return recusa(`Card NÃO mostrado: ${onde} está sem \`label\`.`);
		if (!ehNumero(campo.min) || campo.min <= 0) {
			return recusa(`Card NÃO mostrado: \`min\` de ${onde} tem que ser um número maior que zero.`);
		}
		if (!ehNumero(campo.max) || campo.max <= campo.min) {
			return recusa(`Card NÃO mostrado: \`max\` de ${onde} tem que ser maior que \`min\`.`);
		}
		if (campo.max > MAX_VALOR_DO_PICKER) {
			return recusa(
				`Card NÃO mostrado: \`max\` de ${onde} passa de ${MAX_VALOR_DO_PICKER} — essa faixa não é pergunta de consórcio.`,
			);
		}
		if (!ehNumero(campo.default) || campo.default < campo.min || campo.default > campo.max) {
			return recusa(
				`Card NÃO mostrado: \`default\` de ${onde} tem que estar entre ${campo.min} e ${campo.max}.`,
			);
		}
		// `step` ausente vira 0: o componente cai no passo padrão (VALUE_STEP).
		const step = ehNumero(campo.step) && campo.step > 0 ? campo.step : 0;
		const normalizado: Record<string, unknown> = {
			id,
			label,
			min: campo.min,
			max: campo.max,
			step,
			default: campo.default,
		};
		const sufixo = textoUtil(campo.suffix);
		if (sufixo) normalizado.suffix = sufixo;
		if (campo.format === "currency" || campo.format === "months") normalizado.format = campo.format;
		fields.push(normalizado);
	}
	return { ok: true, payload: { category: categoria, fields } };
}

function validarTopicPicker(payload: unknown): ResultadoDaValidacao {
	if (!ehObjeto(payload)) {
		return recusa(
			"Card NÃO mostrado: topic_picker precisa de payload { topics: [...], includeBackButton: true|false }.",
		);
	}
	const bruto = payload.topics;
	if (!Array.isArray(bruto) || bruto.length === 0) {
		return recusa("Card NÃO mostrado: `topics` vazio. Escreva de 1 a 4 tópicos.");
	}
	if (bruto.length > MAX_OPCOES_NO_CARD) {
		return recusa(
			`Card NÃO mostrado: topic_picker aceita no máximo ${MAX_OPCOES_NO_CARD} tópicos — card é decisão, não menu.`,
		);
	}
	const topics: string[] = [];
	for (const [indice, topico] of bruto.entries()) {
		const texto = textoUtil(topico);
		if (!texto) return recusa(`Card NÃO mostrado: o tópico ${indice + 1} está vazio.`);
		topics.push(texto);
	}
	if (typeof payload.includeBackButton !== "boolean") {
		return recusa(
			"Card NÃO mostrado: topic_picker exige `includeBackButton` (true quando o cliente pode voltar à pergunta anterior e false quando não).",
		);
	}
	const validado: Record<string, unknown> = {
		topics,
		includeBackButton: payload.includeBackButton,
	};
	const prompt = textoUtil(payload.prompt);
	if (prompt) validado.prompt = prompt;
	return { ok: true, payload: validado };
}

/** Valida o payload de UM card de escolha e devolve o payload já normalizado
 * (só as chaves que o componente lê — `groupId`/`replyId` são do servidor). */
export function validarCardDeEscolha(tipo: string, payload: unknown): ResultadoDaValidacao {
	switch (tipo) {
		case "quick_reply":
			return validarQuickReply(payload);
		case "value_picker":
			return validarValuePicker(payload);
		case "topic_picker":
			return validarTopicPicker(payload);
		default:
			return recusaDeTipo(tipo);
	}
}

/** Porta única do `mostrar_card`: aprova o card de escolha ou devolve a recusa
 * em texto, que é o que ensina o modelo a pedir o certo. */
export function cardDeEscolha(
	tipo: string,
	payload: unknown,
):
	| { ok: true; card: { type: ArtifactType; payload: Record<string, unknown> } }
	| { ok: false; erro: string } {
	const validado = validarCardDeEscolha(tipo, payload);
	if (!validado.ok) return validado;
	return { ok: true, card: { type: tipo as ArtifactType, payload: validado.payload } };
}
