// O TURNO DO VENDEDOR LIVRE — o motor que substitui o funil.
//
//   captura de identidade (servidor) → caixa + skills → beat do pi → cards por
//   resultado → persistência
//
// Não existe `route`, `advance`, `capture`, `emit-card` nem gate: quem decide o
// que dizer, quando buscar e quando fechar é o MODELO, a partir do prompt do
// vendedor e das duas skills. O código só garante FATO — identidade cifrada,
// carta real, proposta real, persistência — e protege o que não pode vazar.
//
// É o único motor: `runTurn` chama daqui direto, sem flag.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, usoDeIa } from "@/db/schema";
import { listShownOffersForConversation } from "@/lib/agent/orchestrator/choose-offer";
import { maskCpfForDisplay } from "@/lib/agent/orchestrator/contract-form-prefill";
import type { TurnEvent, TurnInput } from "@/lib/agent/orchestrator/types";
import { scrubCpf } from "@/lib/agent/orchestrator/vazamento";
import { executarBeat } from "@/lib/agent/pi/converse";
import { persistirTurnoLivre } from "@/lib/agent/pi/persist-livre";
import { montarSystemDoVendedor } from "@/lib/agent/pi/system-do-vendedor";
import { toPiTools } from "@/lib/agent/pi/tools";
import {
	buildToolsLivres,
	type ContextoDasTools,
	type DepsDasToolsLivres,
	NOMES_DAS_TOOLS_LIVRES,
} from "@/lib/agent/pi/tools-livres";
import { estadoInicialDoTurno } from "@/lib/agent/turn/estado";
import { projectToMeta } from "@/lib/agent/turn/projecao";
import {
	isValidCpf,
	loadIdentity,
	maskPhoneForDisplay,
	type StoredIdentity,
	storeIdentity,
} from "@/lib/conversation/identity";
import { loadConversationHistory } from "@/lib/conversation/messages";
import { metaOf } from "@/lib/conversation/meta";

/** Identidade que o cliente digitou nesta fala — capturada no SERVIDOR, nunca
 * pelo modelo. Devolve o texto sem os números, que é o que vai para o banco, para
 * o provedor do modelo e para o admin. */
/** DDDs válidos no Brasil (11–99, sem 20–29 reservados). */
function dddValido(ddd: string): boolean {
	const n = Number(ddd);
	return n >= 11 && n <= 99 && !(n >= 20 && n <= 29);
}

export function capturarIdentidadeDoTexto(
	texto: string,
	atual: StoredIdentity | null,
): {
	identidade: StoredIdentity | null;
	textoLimpo: string;
	recebeuCpf: boolean;
	recebeuCelular: boolean;
} {
	let recebeuCpf = false;
	let recebeuCelular = false;
	let cpf = atual?.cpf ?? null;
	let celular = atual?.celular ?? null;
	let textoLimpo = texto;

	// ── CPF ────────────────────────────────────────────────────────────────
	// Só entra CPF FORMATADO (`111.444.777-35`) ou 11 dígitos que PASSAM no
	// dígito verificador. Um número solto de 11 dígitos é, na maioria das vezes,
	// celular — tratá-lo como CPF apagava o telefone que o cliente acabou de
	// digitar (o regex antigo levava "11987654321" embora como CPF inválido).
	const formatado = textoLimpo.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)?.[0] ?? null;
	const candidatos = [...textoLimpo.matchAll(/\b\d{11}\b/g)].map((m) => m[0]);
	const cpfSolto = candidatos.find((c) => isValidCpf(c)) ?? null;
	const cpfCandidato = formatado ?? cpfSolto;

	if (cpfCandidato) {
		const digitos = cpfCandidato.replace(/\D/g, "");
		if (isValidCpf(digitos)) {
			cpf = digitos;
			recebeuCpf = true;
			textoLimpo = textoLimpo.replace(cpfCandidato, "[CPF recebido e guardado]");
		} else if (formatado) {
			textoLimpo = textoLimpo.replace(cpfCandidato, "[CPF não reconhecido]");
		}
	}

	// ── CELULAR ────────────────────────────────────────────────────────────
	// Procurado DEPOIS de o CPF sair do texto (senão casa com os dígitos dele).
	const formatadoTel =
		textoLimpo.match(/(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-.\s]?\d{4}\b/)?.[0] ?? null;
	const soltos = [...textoLimpo.matchAll(/\b\d{10,11}\b/g)].map((m) => m[0]);
	const telSolto =
		soltos.find((t) => {
			const n = t.length === 11 ? t : null;
			return n !== null && n[2] === "9" && dddValido(n.slice(0, 2)) && !isValidCpf(n);
		}) ??
		soltos.find((t) => t.length === 10 && dddValido(t.slice(0, 2)) && !isValidCpf(t)) ??
		null;
	const teleCandidato = formatadoTel ?? telSolto;

	if (teleCandidato) {
		const digitos = teleCandidato.replace(/\D/g, "");
		const semDdi = digitos.length === 13 && digitos.startsWith("55") ? digitos.slice(2) : digitos;
		// Telefone com separador é telefone, mesmo que os dígitos passem no DV do
		// CPF por coincidência (~1% dos números). A rejeição por CPF só vale para
		// sequência SOLTA de dígitos, onde a ambiguidade é real.
		const ambiguoComCpf = !formatadoTel && isValidCpf(semDdi);
		if (
			(semDdi.length === 10 || semDdi.length === 11) &&
			dddValido(semDdi.slice(0, 2)) &&
			!ambiguoComCpf
		) {
			celular = semDdi;
			recebeuCelular = true;
			textoLimpo = textoLimpo.replace(teleCandidato, "[telefone recebido e guardado]");
		}
	}

	// CPF parcial VALE: o celular pode chegar na mensagem seguinte, e o servidor
	// precisa lembrar do CPF entre turnos (antes, CPF sozinho era descartado e a
	// mensagem dizia "guardado" sem ter guardado nada).
	const identidade = cpf ? { cpf, celular: celular ?? "" } : null;
	return { identidade, textoLimpo, recebeuCpf, recebeuCelular };
}

export function createRunTurnLivre(deps?: {
	provider?: { id: string; baseUrl: string; apiKey: string; model: string };
	/** Fronteira da busca — roteiro nos testes, Bevi real em produção. */
	busca?: DepsDasToolsLivres["buscarGrupos"];
}): (input: TurnInput) => AsyncGenerator<TurnEvent> {
	return async function* runTurnLivreImpl(input: TurnInput): AsyncGenerator<TurnEvent> {
		const { conversationId, channel, userText, isUserTurn, contactName } = input;
		if (!conversationId) throw new Error("[pi-livre] conversationId is required");

		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
		});
		const baseMeta = metaOf(conv);
		const historico = (await loadConversationHistory(conversationId)).map((m) => ({
			role: m.role,
			content: m.content,
		}));

		// Rastro de entrada: sem isto, um turno que "fala mas não busca" não tem
		// como ser diagnosticado do lado do servidor (foi o caso do e2e de 20/10).
		console.log(
			`[pi-livre] entrada conv=${conversationId} canal=${channel} isUserTurn=${isUserTurn} texto="${(userText ?? "").slice(0, 60)}"`,
		);

		// 1. IDENTIDADE — capturada aqui, antes do modelo ver qualquer coisa.
		const identidadeAtual = await loadIdentity(conversationId).catch(() => null);
		const captura = capturarIdentidadeDoTexto(userText ?? "", identidadeAtual);
		if (captura.identidade && (captura.recebeuCpf || captura.recebeuCelular)) {
			await storeIdentity(conversationId, captura.identidade).catch((erro: unknown) => {
				console.error("[pi-livre] identidade não gravada (ignorado):", erro);
			});
		}

		let estado = estadoInicialDoTurno({
			conversationId,
			channel,
			contactName: contactName ?? conv?.contactName ?? null,
			isUserTurn,
			userText: captura.textoLimpo,
			isResumeGreeting: input.isResumeGreeting,
			baseMeta,
			historico,
		});

		// 2. O SYSTEM — conduta (caixa) + skills + linha de fato, num lugar só.
		const { system } = await montarSystemDoVendedor({
			channel,
			contactName: estado.contactName,
			identidade: captura.identidade ?? identidadeAtual,
		});

		// 3. As tools e o beat.
		const identidadeVisivel = captura.identidade ?? identidadeAtual;
		const ctx: ContextoDasTools = {
			conversationId,
			channel,
			userText: isUserTurn ? captura.textoLimpo : null,
			nomeDoCliente: estado.contactName ?? null,
			// Só MÁSCARA: o número em claro não passa pelos cards nem pelo modelo.
			telefoneMascarado: identidadeVisivel?.celular
				? maskPhoneForDisplay(identidadeVisivel.celular) || null
				: null,
			cpfMascarado: identidadeVisivel?.cpf ? maskCpfForDisplay(identidadeVisivel.cpf) : null,
			cards: [],
			cartasNaTela: [],
			gruposRevelados: new Map(),
			falasDoFecho: [],
			pediuHumano: false,
			estadoDepoisDaBusca: null,
		};

		// "O que está na tela" — o modelo precisa dos ids para fechar a proposta.
		const exibidas = await listShownOffersForConversation(conversationId).catch(() => []);
		const naTela = exibidas.length
			? `\n\nCartas na tela desta conversa:\n${exibidas
					.map(
						(o) =>
							`- [na tela: ${o.administradora ?? "administradora"} · carta R$ ${o.creditValue?.toLocaleString("pt-BR") ?? "?"} · id ${o.groupId}]`,
					)
					.join("\n")}`
			: "";

		// Fila de eventos: o beat empurra o texto AO VIVO, o generator drena.
		const fila: TurnEvent[] = [];
		let acordar: (() => void) | null = null;
		const emitir = (evento: TurnEvent) => {
			fila.push(evento);
			acordar?.();
			acordar = null;
		};

		const executar = async () => {
			const beat = await executarBeat({
				system,
				turnMessage: (captura.textoLimpo || "(sem fala)") + naTela,
				historico,
				tools: toPiTools(buildToolsLivres(ctx, { buscarGrupos: deps?.busca }) as never, {
					conversationId,
					so: [...NOMES_DAS_TOOLS_LIVRES],
				}),
				aoDelta: (delta) => {
					// CPF mascarado JÁ na saída: o número que o cliente digitou não pode
					// voltar para ele por eco do modelo.
					const limpo = scrubCpf(delta);
					estado = { ...estado, events: [...estado.events, { type: "text-delta", text: limpo }] };
					emitir({ type: "text-delta", text: limpo });
				},
				aoToolCall: (chamada) => {
					const evento = {
						type: "tool-call" as const,
						toolName: chamada.nome,
						input: (chamada.input ?? {}) as Record<string, unknown>,
						toolCallId: chamada.toolCallId,
					};
					estado = { ...estado, events: [...estado.events, evento] };
					emitir(evento);
				},
				provider: deps?.provider,
			});

			// 4. O que a busca gravou no estado.
			if (ctx.estadoDepoisDaBusca) {
				const b = ctx.estadoDepoisDaBusca;
				estado = {
					...estado,
					funnel: {
						...estado.funnel,
						currentCategory: b.categoria ?? estado.funnel.currentCategory,
						revealCompleted: true,
						qualifyAnswers: {
							...estado.funnel.qualifyAnswers,
							...(b.creditMax ? { creditMax: b.creditMax } : {}),
							...(b.creditMin ? { creditMin: b.creditMin } : {}),
							...(b.parcelaAlvo ? { parcelaAlvo: b.parcelaAlvo } : {}),
							...(b.valorDoBemAlvo ? { valorDoBemAlvo: b.valorDoBemAlvo } : {}),
							...(b.lanceEmbutido !== undefined ? { lanceEmbutido: b.lanceEmbutido } : {}),
						},
					},
				};
			}

			// 5. Cards por RESULTADO — o card de NÚMERO nunca é escolha do modelo;
			// o de ESCOLHA (pergunta + opções) é, e foi validado em `mostrar_card`.
			for (const texto of ctx.falasDoFecho) {
				estado = {
					...estado,
					events: [
						...estado.events,
						{ type: "text-boundary" },
						{ type: "text-delta", text: texto },
					],
				};
			}
			for (const card of ctx.cards) {
				estado = {
					...estado,
					events: [
						...estado.events,
						{
							type: "artifact",
							artifactType: card.type,
							payload: card.payload as never,
							toolCallId: crypto.randomUUID(),
						},
					],
				};
			}
			if (ctx.pediuHumano) {
				estado = {
					...estado,
					events: [...estado.events, { type: "handoff", reason: "pedido do cliente" } as never],
					funnel: { ...estado.funnel, handoffSuggested: true },
				};
			}

			console.log(
				`[pi-livre] saida conv=${conversationId} texto=${beat.texto.length} chamadas=${beat.chamadas.map((c) => c.nome).join(",") || "-"} cards=${ctx.cards.length} erro=${beat.uso.input === 0 && beat.texto.length === 0 ? "sem-tokens" : "ok"}`,
			);

			// 6. Custo do turno (livro-caixa local).
			if (beat.uso.input > 0 || beat.uso.output > 0) {
				void db
					.insert(usoDeIa)
					.values({
						conversationId,
						modelo: process.env.AI_MODEL?.trim() || "qwen3.6-flash",
						tokensInput: beat.uso.input,
						tokensOutput: beat.uso.output,
					})
					.catch((erro: unknown) => console.error("[uso-de-ia] não registrado (ignorado):", erro));
			}

			// 7. Persistência. Cards saem DEPOIS de gravar a meta.
			await persistirTurnoLivre({ estado });
			for (const ev of estado.events) {
				if (ev.type === "tool-call" || ev.type === "text-delta") continue;
				emitir(ev);
			}

			// Modelo sem nada a dizer não pode virar turno mudo no canal.
			const falou = estado.events.some(
				(ev) => ev.type === "text-delta" && ev.text.trim().length > 0,
			);
			if (!falou) {
				emitir({
					type: "text-delta",
					text:
						ctx.cards.length > 0
							? "Achei essas opções pra você. Alguma te interessa?"
							: "Desculpa, me perdi aqui. Pode me contar de novo o que você quer?",
				});
			}

			void projectToMeta(estado);
		};

		let fechado = false;
		let erro: unknown = null;
		void executar()
			.catch((e) => {
				erro = e;
			})
			.finally(() => {
				fechado = true;
				acordar?.();
				acordar = null;
			});

		while (!fechado || fila.length > 0) {
			if (fila.length === 0) {
				await new Promise<void>((ok) => {
					acordar = ok;
				});
				continue;
			}
			yield fila.shift() as TurnEvent;
		}

		if (erro) throw erro;
		yield { type: "finish", reason: "complete" };
	};
}

export const runTurnLivre = createRunTurnLivre();
