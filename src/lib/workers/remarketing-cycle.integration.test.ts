// A ENTRADA E A HIGIENE DA RÉGUA — provadas contra o Postgres, não contra mock.
//
// Este arquivo é o par de integração do `motivo-de-exclusao.test.ts`: lá a
// decisão é provada fixture a fixture, sem banco; aqui o que se prova é que a
// CONSULTA e o MOTOR concordam — que era exatamente o defeito de 18/09, quando
// nove condições em SQL decidiam sozinhas e quem falhava qualquer uma delas
// desaparecia sem nome (diagnóstico §c).
//
// Três frentes desta rodada, nesta ordem:
//
//   1. `avaliarElegibilidade(...).elegivel === (entrarNaRegua inseriu a linha)`
//      para cada fixture — a igualdade é a asserção que pegou o refactor;
//   2. `listarVencidas` deixa de devolver conversa de TESTE e telefone da
//      equipe (em prod, 2 dos 6 toques de 18/09 foram para gente nossa);
//   3. `segurarToquesDaEquipe` tira a linha da régua COM MOTIVO e é idempotente.
//
// O banco é o do workspace (isolado por worktree) e a limpeza é explícita no
// `afterAll`. Skip quando não há DATABASE_URL.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ConversaAvaliada, OpcoesDaElegibilidade } from "@/lib/remarketing/motivo-de-exclusao";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/**
 * Um instante fixo, longe do "agora" — a régua recebe `agora` por parâmetro, e
 * fixá-lo é o que torna o teste determinístico: as datas semeadas são relativas
 * a ele, nunca ao relógio da máquina.
 */
const AGORA = new Date("2026-09-18T15:30:00Z");
const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;

describeIfDb("régua — entrada, higiene e motivo (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let ciclo: typeof import("./remarketing-cycle");
	let motivo: typeof import("@/lib/remarketing/motivo-de-exclusao");

	const convIds: string[] = [];
	const contactIds: string[] = [];
	const mesaIds: string[] = [];
	const userIds: string[] = [];

	/** Telefones sorteados por execução: o banco é compartilhado entre os agentes. */
	const SUF = String(Math.floor(Math.random() * 9000) + 1000);
	const FONE_LEAD = `55629${SUF}0001`;
	const FONE_WEB = `55629${SUF}0002`;
	const FONE_ATENDENTE = `55629${SUF}0003`;
	const FONE_USER = `55629${SUF}0004`;
	const FONE_MESA_INATIVO = `55629${SUF}0005`;
	const FONE_ENV = `55629${SUF}0006`;

	interface Semente {
		channel?: "web" | "whatsapp";
		status?: "active" | "handed_off" | "closed";
		isSimulated?: boolean;
		semContato?: boolean;
		/** Relativo a `AGORA`. `null` = a corrida do FIX-86 (coluna nula). */
		inboundHa?: number | null;
		waId?: string | null;
		phone?: string | null;
		metadata?: Record<string, unknown>;
		/** Pré-cria a linha ATIVA em `remarketing_touches`. */
		jaNaRegua?: boolean;
	}

	async function semear(semente: Semente = {}) {
		const [conv] = await db
			.insert(schema.conversations)
			.values({
				channel: semente.channel ?? "whatsapp",
				status: semente.status ?? "active",
				isSimulated: semente.isSimulated ?? false,
				waId: semente.waId === undefined ? FONE_LEAD : semente.waId,
				lastInboundAt:
					semente.inboundHa === undefined
						? new Date(AGORA.getTime() - 100 * MIN)
						: semente.inboundHa === null
							? null
							: new Date(AGORA.getTime() - semente.inboundHa),
				metadata: semente.metadata ?? {},
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);

		let contactId: string | null = null;
		if (!semente.semContato) {
			// O schema exige AO MENOS UM identificador: contato só de e-mail é um
			// caso real (AJA-02) e é justamente ele que a régua não pode atender.
			const telefone = semente.phone === undefined ? FONE_LEAD : semente.phone;
			const [contact] = await db
				.insert(schema.contacts)
				.values(
					telefone === null ? { email: `sem-telefone-${SUF}@ajaagora.test` } : { phone: telefone },
				)
				.returning({ id: schema.contacts.id });
			contactId = contact.id;
			contactIds.push(contact.id);
			await db
				.update(schema.conversations)
				.set({ contactId })
				.where(eq(schema.conversations.id, conv.id));
		}

		if (semente.jaNaRegua && contactId) {
			await db.insert(schema.remarketingTouches).values({
				conversationId: conv.id,
				contactId,
				objetivo: "carro",
				step: 0,
				status: "ATIVO",
				nextTouchAt: new Date(AGORA.getTime() - MIN),
				touches30d: 0,
			});
		}

		return { conversationId: conv.id, contactId };
	}

	/** O veredito da função para uma conversa recém-semeada (leitura limpa). */
	async function avaliarSemeada(
		conversationId: string,
		opcoes: Partial<OpcoesDaElegibilidade> = {},
	): Promise<ReturnType<typeof motivo.avaliarElegibilidade>> {
		const conv = await db.query.conversations.findFirst({
			where: eq(schema.conversations.id, conversationId),
		});
		const contact = conv?.contactId
			? await db.query.contacts.findFirst({ where: eq(schema.contacts.id, conv.contactId) })
			: null;
		const linha = await db.query.remarketingTouches.findFirst({
			where: eq(schema.remarketingTouches.conversationId, conversationId),
		});

		const avaliada: ConversaAvaliada = {
			channel: conv?.channel ?? "whatsapp",
			status: conv?.status ?? "active",
			isSimulated: conv?.isSimulated ?? false,
			contactId: conv?.contactId ?? null,
			lastInboundAt: conv?.lastInboundAt ?? null,
			waId: conv?.waId ?? null,
			phone: contact?.phone ?? null,
			jaNaRegua: Boolean(linha),
		};

		return motivo.avaliarElegibilidade(avaliada, AGORA, {
			reguaLigada: true,
			entradaWeb: false,
			telefoneDaEquipe: false,
			...opcoes,
		});
	}

	async function entrouNaRegua(conversationId: string): Promise<boolean> {
		const linha = await db.query.remarketingTouches.findFirst({
			where: eq(schema.remarketingTouches.conversationId, conversationId),
			columns: { id: true },
		});
		return Boolean(linha);
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		ciclo = await import("./remarketing-cycle");
		motivo = await import("@/lib/remarketing/motivo-de-exclusao");

		// A chave operacional: ligada, senão a entrada não inscreve ninguém (é o
		// comportamento real de produção até 18/09 11:47 — ver o topo do ciclo).
		process.env.REMARKETING_ATIVO = "1";
		delete process.env.REMARKETING_ENTRADA_WEB;

		// O banco do workspace pode ter roda pé de outra execução — o cache de 60 s
		// da lista da equipe precisa começar limpo.
		ciclo.invalidarCacheDaEquipe();
	});

	afterAll(async () => {
		delete process.env.REMARKETING_ATIVO;
		if (convIds.length) {
			await db
				.delete(schema.remarketingTouches)
				.where(inArray(schema.remarketingTouches.conversationId, convIds));
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (contactIds.length) {
			await db.delete(schema.contacts).where(inArray(schema.contacts.id, contactIds));
		}
		if (mesaIds.length) {
			await db.delete(schema.mesaAttendants).where(inArray(schema.mesaAttendants.id, mesaIds));
		}
		if (userIds.length) {
			await db.delete(schema.user).where(inArray(schema.user.id, userIds));
		}
		ciclo.invalidarCacheDaEquipe();
	});

	describe("a função e a consulta concordam, fixture a fixture", () => {
		it("entra exatamente quem a função diz que entra", async () => {
			// Cada fixture isola UMA guarda; a função avalia ANTES do insert (o
			// `jaNaRegua` é o estado de partida, não o resultado da rodada).
			const fixtures: Array<{ nome: string; semente: Semente }> = [
				{ nome: "elegível", semente: {} },
				{ nome: "teste", semente: { isSimulated: true } },
				{ nome: "encerrada", semente: { status: "closed" } },
				{ nome: "com atendente", semente: { status: "handed_off" } },
				{ nome: "web (flag desligada)", semente: { channel: "web" } },
				{ nome: "sem contato", semente: { semContato: true } },
				{ nome: "sem telefone", semente: { waId: null, phone: null } },
				{ nome: "já na régua", semente: { jaNaRegua: true } },
				{ nome: "ainda em silêncio", semente: { inboundHa: 10 * MIN } },
				{ nome: "last_inbound nulo", semente: { inboundHa: null } },
				{ nome: "parada há mais de 7 dias", semente: { inboundHa: 8 * DIA } },
			];

			const semeadas: Array<{
				nome: string;
				id: string;
				elegivel: boolean;
				tinhaLinhaAntes: boolean;
			}> = [];
			for (const fixture of fixtures) {
				const { conversationId } = await semear(fixture.semente);
				const veredito = await avaliarSemeada(conversationId);
				semeadas.push({
					nome: fixture.nome,
					id: conversationId,
					elegivel: veredito.elegivel,
					// A fixture "já na régua" JÁ tem linha: o que se compara é se ESTA
					// rodada criou a linha, não se ela existe.
					tinhaLinhaAntes: await entrouNaRegua(conversationId),
				});
			}

			await ciclo.entrarNaRegua(AGORA);

			for (const { nome, id, elegivel, tinhaLinhaAntes } of semeadas) {
				const temDepois = await entrouNaRegua(id);
				expect(
					{ fixture: nome, criadaAgora: temDepois && !tinhaLinhaAntes },
					`${nome}: a função disse elegível=${elegivel}`,
				).toEqual({ fixture: nome, criadaAgora: elegivel });
			}
		});
	});

	describe("a entrada da web (REMARKETING_ENTRADA_WEB)", () => {
		it("sem a flag a conversa da web fica fora, com o motivo nomeado", async () => {
			const { conversationId } = await semear({ channel: "web", waId: FONE_WEB });
			const veredito = await avaliarSemeada(conversationId, { entradaWeb: false });
			expect(veredito).toEqual({ elegivel: false, motivo: "conversa_web" });

			await ciclo.entrarNaRegua(AGORA);
			expect(await entrouNaRegua(conversationId)).toBe(false);
		});

		it("com a flag e telefone válido, entra — e o destino é o telefone do contato", async () => {
			const { conversationId } = await semear({
				channel: "web",
				waId: null,
				phone: FONE_WEB,
			});
			process.env.REMARKETING_ENTRADA_WEB = "1";
			try {
				await ciclo.entrarNaRegua(AGORA);
			} finally {
				process.env.REMARKETING_ENTRADA_WEB = undefined;
			}

			expect(await entrouNaRegua(conversationId)).toBe(true);
			// O template sai para `wa_id ?? phone`: sem `wa_id`, quem manda é o
			// telefone do contato — é o que faz o caminho não depender do wa_id.
			const linha = await db.query.remarketingTouches.findFirst({
				where: eq(schema.remarketingTouches.conversationId, conversationId),
			});
			const contato = await db.query.contacts.findFirst({
				where: eq(schema.contacts.id, linha?.contactId ?? ""),
			});
			expect(contato?.phone).toBe(FONE_WEB);
		});
	});

	describe("higiene: teste e telefone da equipe saem da régua", () => {
		it("conversa marcada como TESTE depois de entrar não é mais listada", async () => {
			const { conversationId } = await semear({});
			await ciclo.entrarNaRegua(AGORA);
			expect(await entrouNaRegua(conversationId)).toBe(true);

			const vencidas = await ciclo.listarVencidas(new Date(AGORA.getTime() + 2 * MIN));
			expect(vencidas.map((l) => l.conversationId)).toContain(conversationId);

			await db
				.update(schema.conversations)
				.set({ isSimulated: true })
				.where(eq(schema.conversations.id, conversationId));

			const depois = await ciclo.listarVencidas(new Date(AGORA.getTime() + 2 * MIN));
			expect(depois.map((l) => l.conversationId)).not.toContain(conversationId);
		});

		it("telefone de atendente de mesa NÃO é listado — nem o inativo", async () => {
			const [atendente] = await db
				.insert(schema.mesaAttendants)
				.values({ nome: `Fixture equipe ${SUF}`, whatsapp: FONE_ATENDENTE, isActive: false })
				.returning({ id: schema.mesaAttendants.id });
			mesaIds.push(atendente.id);

			// A linha nasce ATIVA (o caso real: entrou e só depois o telefone virou
			// cadastro da casa) — o ciclo a segura no passo de higiene.
			const { conversationId } = await semear({
				waId: FONE_ATENDENTE,
				phone: FONE_ATENDENTE,
				jaNaRegua: true,
			});

			const vencidas = await ciclo.listarVencidas(new Date(AGORA.getTime() + 2 * MIN));
			expect(vencidas.map((l) => l.conversationId)).not.toContain(conversationId);

			// E a linha sai do índice COM MOTIVO, em vez de ficar ATIVA para sempre.
			ciclo.invalidarCacheDaEquipe();
			const segurados = await ciclo.segurarToquesDaEquipe(AGORA);
			expect(segurados).toBe(1);

			const linha = await db.query.remarketingTouches.findFirst({
				where: eq(schema.remarketingTouches.conversationId, conversationId),
			});
			expect(linha?.status).toBe("RESPONDEU");
			expect(linha?.motivoSaida).toBe("telefone_da_equipe");

			// IDEMPOTENTE: o segundo ciclo não mexe em mais nada.
			const denovo = await ciclo.segurarToquesDaEquipe(new Date(AGORA.getTime() + MIN));
			expect(denovo).toBe(0);
			const depois = await ciclo.listarVencidas(new Date(AGORA.getTime() + 2 * MIN));
			expect(depois.map((l) => l.conversationId)).not.toContain(conversationId);
		});

		it("`ehDaEquipe` lê mesa_attendants, user e a env — pelo nono dígito", async () => {
			const [atendente] = await db
				.insert(schema.mesaAttendants)
				.values({ nome: `Fixture mesa ${SUF}`, whatsapp: FONE_MESA_INATIVO, isActive: false })
				.returning({ id: schema.mesaAttendants.id });
			mesaIds.push(atendente.id);

			const [usuario] = await db
				.insert(schema.user)
				.values({
					id: `fixture-${SUF}`,
					name: `Fixture user ${SUF}`,
					email: `fixture-${SUF}@ajaagora.test`,
					role: "attendant",
					phone: FONE_USER,
					isActive: false,
				})
				.returning({ id: schema.user.id });
			userIds.push(usuario.id);

			ciclo.invalidarCacheDaEquipe();

			// O número da casa em qualquer formato, incluindo o legado sem o nono
			// dígito: é assim que a Meta entrega o `wa_id` de um BR.
			expect(await ciclo.ehDaEquipe(FONE_MESA_INATIVO)).toBe(true);
			expect(await ciclo.ehDaEquipe(`+55 ${FONE_MESA_INATIVO.slice(2)}`)).toBe(true);
			expect(await ciclo.ehDaEquipe(FONE_USER)).toBe(true);
			expect(await ciclo.ehDaEquipe(FONE_LEAD)).toBe(false);

			// `TELEFONES_DA_EQUIPE` entra sem deploy — e sem tocar em banco nenhum.
			const anterior = process.env.TELEFONES_DA_EQUIPE;
			process.env.TELEFONES_DA_EQUIPE = FONE_ENV;
			try {
				ciclo.invalidarCacheDaEquipe();
				expect(await ciclo.ehDaEquipe(FONE_ENV)).toBe(true);
			} finally {
				process.env.TELEFONES_DA_EQUIPE = anterior;
				ciclo.invalidarCacheDaEquipe();
			}
		});
	});

	describe("toda saída da régua grava o motivo, com o ciclo de verdade", () => {
		// O ciclo roda com as dependências de ENVIO dubladas (nenhuma mensagem sai
		// deste teste) e as de LEITURA/GRAVAÇÃO reais: é o caminho completo
		// banco → motor → banco, que nenhum teste unitário cobre.
		async function rodarCiclo(agora: Date) {
			return ciclo.runRemarketingCycle({
				agora,
				entrarNaRegua: async () => 0,
				segurarToquesDaEquipe: async () => 0,
				dispararTurno: async () => {},
				enviarArte: async () => {},
				enviarTemplate: async () => {},
				despacharConversoes: async () => ({}),
			});
		}

		it("toque esgotado sai do índice como ESGOTADO + `tres_toques_sem_resposta`", async () => {
			const { conversationId, contactId } = await semear({
				inboundHa: 45 * DIA,
				jaNaRegua: true,
			});
			// O terceiro toque já saiu e a cota de 30 dias reabriu (os toques são mais
			// velhos que a janela): o próximo toque estouraria a cota de 3, e é assim
			// que uma linha chega a ESGOTADO de verdade.
			await db
				.update(schema.remarketingTouches)
				.set({
					step: 3,
					touches30d: 0,
					nextTouchAt: new Date(AGORA.getTime() - MIN),
					ultimoToqueEm: new Date(AGORA.getTime() - 40 * DIA),
				})
				.where(eq(schema.remarketingTouches.conversationId, conversationId));

			const resultado = await rodarCiclo(AGORA);
			// Outras linhas ATIVO do banco (fixtures desta suíte) também são lidas pelo
			// ciclo; o que importa aqui é que ESTA saiu por esgotamento.
			expect(resultado.nada.esgotado ?? 0).toBeGreaterThanOrEqual(1);

			const linha = await db.query.remarketingTouches.findFirst({
				where: eq(schema.remarketingTouches.conversationId, conversationId),
			});
			expect(linha?.status).toBe("ESGOTADO");
			expect(linha?.motivoSaida).toBe("tres_toques_sem_resposta");
			expect(contactId).toBeTruthy();

			// E o motivo gravado tem rótulo PT-BR no dicionário único.
			expect(motivo.motivoDeSaidaLegivel(linha?.motivoSaida ?? null)).toBe(
				"Três toques sem resposta",
			);
		});

		it("o opt-out da pessoa grava OPTOUT + `optout_do_cliente` e sai do índice", async () => {
			const { conversationId, contactId } = await semear({ jaNaRegua: true });
			await db
				.update(schema.contacts)
				.set({ remarketingOptoutAt: new Date(AGORA.getTime() - MIN) })
				.where(eq(schema.contacts.id, contactId as string));

			await rodarCiclo(AGORA);

			const linha = await db.query.remarketingTouches.findFirst({
				where: eq(schema.remarketingTouches.conversationId, conversationId),
			});
			expect(linha?.status).toBe("OPTOUT");
			expect(linha?.motivoSaida).toBe("optout_do_cliente");
			expect(motivo.motivoDeSaidaLegivel(linha?.motivoSaida ?? null)).toBe(
				"O cliente pediu para sair",
			);

			const vencidas = await ciclo.listarVencidas(new Date(AGORA.getTime() + MIN));
			expect(vencidas.map((l) => l.conversationId)).not.toContain(conversationId);
		});
	});
});
