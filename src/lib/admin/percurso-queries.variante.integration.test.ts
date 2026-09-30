// O RECORTE POR BRAÇO no PERCURSO (integration-db) — FIX-404.
//
// O que este arquivo protege é a pergunta do dono lida na tela que dá UMA
// posição por pessoa: *"a etapa que o cliente avançou, ele veio por qual A/B?"*.
// A pessoa é atribuída ao braço da conversa em que ela SE IDENTIFICOU (a âncora
// do experimento) e, quando nunca se identificou, ao braço da ÚLTIMA conversa com
// braço do período (exposição).
//
// Os dois números que não podem quebrar:
//   1. **fechamento** — `A + B + sem variante = total`, no total e em cada
//      profundidade da escada. É o que prova que cada pessoa ocupa UM balde só.
//   2. **`sem variante` inclui quem só chegou** — quem clicou no anúncio e nunca
//      abriu conversa não tem metadata nenhum; se ele sumisse do balde, o
//      denominador da tela encolheria justamente na faixa que a tela existe para
//      mostrar.
//
// A janela é sorteada por execução, como no teste irmão deste arquivo: o banco é
// compartilhado entre os agentes, e duas execuções na mesma janela se enxergam.
//
// Skip se DATABASE_URL ausente.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXPERIMENTOS, type RecorteAB, SEM_BRACO } from "@/lib/experimentos/registro";
import { ORDEM_DOS_PASSOS, type PassoDoPercurso } from "./percurso-types";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const ANO = 1970 + Math.floor(Math.random() * 45);
const MES = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const JANELA_DE = new Date(`${ANO}-${MES}-01T00:00:00Z`);
const JANELA_ATE = new Date(`${ANO}-${MES}-28T23:59:59Z`);

function quando(dia: number): Date {
	return new Date(`${ANO}-${MES}-${String(dia).padStart(2, "0")}T12:00:00Z`);
}

/** O experimento do registro vivo (hoje um). Nada aqui conhece o nome da chave:
 *  ele vem do registro, que é a fonte única. */
const EXPERIMENTO = EXPERIMENTOS[0];

/** O recorte de um braço só, na forma que a rota monta. */
function soBraco(braco: string): RecorteAB {
	return [{ experimento: EXPERIMENTO.id, braco }];
}

const TODAS: RecorteAB = [];

/**
 * A pessoa que só chegou — chega na lista de `sem variante` e é quem prova que o
 * balde não exige conversa.
 */
const SO_CHEGOU = `v-so-chegou-${crypto.randomUUID()}`;
/** Identificou em A e abriu B DEPOIS: a âncora vence a exposição mais recente. */
const IDENTIFICOU_EM_A = `v-a-${crypto.randomUUID()}`;
/** Identificou em A e REidentificou em B: vale a PRIMEIRA transição. */
const REIDENTIFICOU = `v-re-${crypto.randomUUID()}`;
/** Nunca identificou: A em t1 e B em t2 ⇒ a ÚLTIMA exposição (B). */
const NUNCA_IDENTIFICOU = `v-b-${crypto.randomUUID()}`;
/** Identificou no web (B) e continuou no WhatsApp ⇒ B (WhatsApp não tem braço). */
const WEB_DEPOIS_WHATS = `v-wa-${crypto.randomUUID()}`;
/** Só WhatsApp: nasce identificado, fora do teste ⇒ sem variante. */
const SO_WHATSAPP = `v-zap-${crypto.randomUUID()}`;

const CASOS = {
	A: [IDENTIFICOU_EM_A, REIDENTIFICOU],
	B: [NUNCA_IDENTIFICOU, WEB_DEPOIS_WHATS],
	[SEM_BRACO]: [SO_CHEGOU, SO_WHATSAPP],
} as const;

describeIfDb("percurso — recorte por braço do experimento (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let queries: typeof import("./percurso-queries");

	const visitIds: string[] = [];
	const convIds: string[] = [];
	const leadIds: string[] = [];

	const UA_GENTE =
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

	/** Uma visita de gente, no canal dado. Toda pessoa desta suíte começa aqui —
	 *  inclusive quem nunca abriu conversa. */
	async function semearVisita(
		visitorId: string,
		instante: Date,
		canal: "web" | "whatsapp" = "web",
	): Promise<string> {
		const [visita] = await db
			.insert(schema.visits)
			.values({
				visitorId,
				channel: canal,
				landingPath: "/motos",
				createdAt: instante,
				userAgent: UA_GENTE,
			})
			.returning({ id: schema.visits.id });
		visitIds.push(visita.id);
		return visita.id;
	}

	/**
	 * Uma conversa da pessoa, com (ou sem) o braço gravado no metadata e com (ou
	 * sem) a identificação.
	 *
	 * `identificou` semeia o FATO como o funil o lê (`conversaIdentificada`): no
	 * WhatsApp, o `wa_id` do canal; na web, o telefone no lead. Nada de reescrever
	 * o critério aqui — é o mesmo predicado de `sinais-do-funil`.
	 */
	async function semearConversa(opcoes: {
		visitorId: string;
		instante: Date;
		braco?: string | null;
		identificou?: boolean;
		canal?: "web" | "whatsapp";
	}): Promise<void> {
		const canal = opcoes.canal ?? "web";
		const visitaId = await semearVisita(opcoes.visitorId, opcoes.instante, canal);

		const metadata =
			opcoes.braco === undefined || opcoes.braco === null
				? null
				: { [EXPERIMENTO.id]: { variante: opcoes.braco } };

		const [conversa] = await db
			.insert(schema.conversations)
			.values({
				channel: canal,
				visitId: visitaId,
				isSimulated: false,
				waId: canal === "whatsapp" ? `55${Math.floor(Math.random() * 1e11)}` : null,
				metadata,
				createdAt: opcoes.instante,
				updatedAt: opcoes.instante,
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);

		if (opcoes.identificou) {
			const [lead] = await db
				.insert(schema.leads)
				.values({
					conversationId: conversa.id,
					name: "Cliente Teste",
					// PII falsa — telefone reservado de teste.
					phone: `+5511900${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
					stage: "qualificado",
					isSimulated: false,
					createdAt: opcoes.instante,
					updatedAt: opcoes.instante,
				})
				.returning({ id: schema.leads.id });
			leadIds.push(lead.id);
		}
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		queries = await import("./percurso-queries");

		// Só chegou: a visita existe, a conversa nunca nasceu.
		await semearVisita(SO_CHEGOU, quando(5));

		// Identificou em A (dia 6) e abriu B depois (dia 7): a âncora vence.
		await semearConversa({
			visitorId: IDENTIFICOU_EM_A,
			instante: quando(6),
			braco: "A",
			identificou: true,
		});
		await semearConversa({ visitorId: IDENTIFICOU_EM_A, instante: quando(7), braco: "B" });

		// Reidentificou: A (dia 8) e B (dia 9), as duas identificadas.
		await semearConversa({
			visitorId: REIDENTIFICOU,
			instante: quando(8),
			braco: "A",
			identificou: true,
		});
		await semearConversa({
			visitorId: REIDENTIFICOU,
			instante: quando(9),
			braco: "B",
			identificou: true,
		});

		// Nunca identificou: A (dia 10) e B (dia 11) ⇒ última exposição.
		await semearConversa({ visitorId: NUNCA_IDENTIFICOU, instante: quando(10), braco: "A" });
		await semearConversa({ visitorId: NUNCA_IDENTIFICOU, instante: quando(11), braco: "B" });

		// Identificou no web com braço B (dia 12) e continuou no WhatsApp (dia 13).
		await semearConversa({
			visitorId: WEB_DEPOIS_WHATS,
			instante: quando(12),
			braco: "B",
			identificou: true,
		});
		await semearConversa({ visitorId: WEB_DEPOIS_WHATS, instante: quando(13), canal: "whatsapp" });

		// Só WhatsApp: identificado pelo canal, sem metadata nenhum.
		await semearConversa({ visitorId: SO_WHATSAPP, instante: quando(14), canal: "whatsapp" });
	});

	afterAll(async () => {
		if (leadIds.length > 0) {
			await db.delete(schema.leads).where(inArray(schema.leads.id, leadIds));
		}
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	function ler(recorte: RecorteAB) {
		return queries.listarPercurso({
			from: JANELA_DE,
			to: JANELA_ATE,
			recorte,
			limit: 200,
			offset: 0,
		});
	}

	it("põe cada pessoa no balde da conversa em que ela se identificou", async () => {
		const [a, b, sem] = await Promise.all([
			ler(soBraco("A")),
			ler(soBraco("B")),
			ler(soBraco(SEM_BRACO)),
		]);

		const chaves = (r: { pessoas: Array<{ chave: string }> }) =>
			new Set(r.pessoas.map((p) => p.chave));

		// Âncora vence exposição; a PRIMEIRA identificação vence a segunda;
		// WhatsApp não é candidata e não reseta quem veio do web.
		expect(chaves(a)).toEqual(new Set(CASOS.A));
		expect(chaves(b)).toEqual(new Set(CASOS.B));
		expect(chaves(sem)).toEqual(new Set(CASOS[SEM_BRACO]));
	});

	it("fecha A + B + sem variante = total, no total e em cada profundidade", async () => {
		const todas = await ler(TODAS);
		const [a, b, sem] = await Promise.all([
			ler(soBraco("A")),
			ler(soBraco("B")),
			ler(soBraco(SEM_BRACO)),
		]);

		expect(todas.totalDePessoas).toBe(Object.values(CASOS).flat().length);
		expect(a.totalDePessoas + b.totalDePessoas + sem.totalDePessoas).toBe(todas.totalDePessoas);
		expect(a.total + b.total + sem.total).toBe(todas.total);

		const porPasso = (
			r: { resumo: Array<{ alcancaram: number; pessoas: number }> },
			indice: number,
		) => r.resumo[indice];

		ORDEM_DOS_PASSOS.forEach((passo: PassoDoPercurso, indice: number) => {
			expect(
				porPasso(a, indice).alcancaram +
					porPasso(b, indice).alcancaram +
					porPasso(sem, indice).alcancaram,
				`alcancaram de ${passo}`,
			).toBe(porPasso(todas, indice).alcancaram);
			expect(
				porPasso(a, indice).pessoas + porPasso(b, indice).pessoas + porPasso(sem, indice).pessoas,
				`posição no degrau ${passo}`,
			).toBe(porPasso(todas, indice).pessoas);
		});
	});

	it("`sem variante` inclui quem só chegou e nunca abriu conversa", async () => {
		const sem = await ler(soBraco(SEM_BRACO));
		expect(sem.pessoas.map((p) => p.chave)).toContain(SO_CHEGOU);

		const a = await ler(soBraco("A"));
		const b = await ler(soBraco("B"));
		expect(a.pessoas.map((p) => p.chave)).not.toContain(SO_CHEGOU);
		expect(b.pessoas.map((p) => p.chave)).not.toContain(SO_CHEGOU);
	});

	it("recorte vazio não move número nenhum (C4)", async () => {
		const semRecorte = await queries.listarPercurso({
			from: JANELA_DE,
			to: JANELA_ATE,
			limit: 200,
		});
		const comVazio = await ler(TODAS);

		expect(comVazio).toEqual(semRecorte);
	});
});
