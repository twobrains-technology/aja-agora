// EXPORTAR PERCURSO — uma linha por pessoa (integration-db).
//
// O que protege: quem chegou pela campanha e NÃO falou continua no arquivo
// (`incluirSemConversa`), o mascaramento é o padrão, e o vínculo ausente sai
// escrito. Janela sorteada por execução, como o resto da suíte.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PassoDoPercurso } from "@/lib/admin/percurso-types";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const ANO = 1970 + Math.floor(Math.random() * 45);
const MES = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const DE = new Date(`${ANO}-${MES}-01T00:00:00Z`);
const ATE = new Date(`${ANO}-${MES}-28T23:59:59Z`);
const DENTRO = new Date(`${ANO}-${MES}-15T12:00:00Z`);

const UA = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36";

describeIfDb("exportação — percurso por pessoa (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let percurso: typeof import("./percurso");

	const visitIds: string[] = [];
	const convIds: string[] = [];

	async function semear(
		args: { comConversa: boolean; nome?: string; telefone?: string; email?: string } = {
			comConversa: true,
		},
	): Promise<string> {
		const [visita] = await db
			.insert(schema.visits)
			.values({
				visitorId: `v-${crypto.randomUUID()}`,
				channel: "web",
				landingPath: "/motos",
				utmSource: "facebook",
				utmCampaign: "exp-a",
				userAgent: UA,
				createdAt: DENTRO,
			})
			.returning({ id: schema.visits.id });
		visitIds.push(visita.id);
		if (!args.comConversa) return visita.id;

		const [conversa] = await db
			.insert(schema.conversations)
			.values({
				channel: "web",
				visitId: visita.id,
				isSimulated: false,
				createdAt: DENTRO,
				updatedAt: DENTRO,
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);

		await db.insert(schema.messages).values({
			conversationId: conversa.id,
			role: "user",
			content: "quero uma moto",
			createdAt: DENTRO,
		});

		if (args.nome) {
			await db.insert(schema.leads).values({
				conversationId: conversa.id,
				name: args.nome,
				phone: args.telefone ?? null,
				email: args.email ?? null,
				stage: "qualificado",
				isSimulated: false,
				createdAt: DENTRO,
				updatedAt: DENTRO,
			});
		}
		return visita.id;
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		percurso = await import("./percurso");
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	it("inclui quem chegou e não falou", async () => {
		const soChegou = await semear({ comConversa: false });
		const linhas = await percurso.exportarPercurso({ de: DE, ate: ATE });
		const achou = linhas.find((l) => l.visitanteId && linhas.length > 0 && l.passo === "so_chegou");
		expect(achou).toBeTruthy();
		expect(
			linhas.some((l) => l.dadosIndisponiveis.includes("sem vínculo: pessoa sem conversa")),
		).toBe(true);
		expect(soChegou).toBeTruthy();
	});

	it("mascara telefone, e-mail e nome por padrão", async () => {
		await semear({
			comConversa: true,
			nome: "Maria Graciete Souza",
			telefone: "+5562988887777",
			email: "maria@dominio.com",
		});
		const linhas = await percurso.exportarPercurso({ de: DE, ate: ATE });
		const linha = linhas.find((l) => l.nome === "Maria");
		expect(linha).toBeTruthy();
		expect(linha?.telefone).toBe("55629***7777");
		expect(linha?.email).toBe("m***@dominio.com");
	});

	it("com mascarar:false entrega o dado completo, só sob pedido explícito", async () => {
		const linhas = await percurso.exportarPercurso({ de: DE, ate: ATE, mascarar: false });
		const linha = linhas.find((l) => l.nome === "Maria Graciete Souza");
		expect(linha).toBeTruthy();
		expect(linha?.telefone).toBe("+5562988887777");
		expect(linha?.email).toBe("maria@dominio.com");
	});

	it("nenhuma célula vazia, e a pessoa sem nome declara o vínculo", async () => {
		await semear({ comConversa: true });
		const linhas = await percurso.exportarPercurso({ de: DE, ate: ATE });
		for (const linha of linhas) {
			for (const valor of Object.values(linha)) expect(valor).not.toBe("");
		}
		expect(linhas.some((l) => l.nome === "indisponível: nome não capturado")).toBe(true);
	});

	it("a contagem de pessoas bate com o número de linhas", async () => {
		const { pessoas } = await percurso.contarPercurso({ de: DE, ate: ATE });
		const linhas = await percurso.exportarPercurso({ de: DE, ate: ATE });
		// A contagem usa a MESMA definição de chave da query; divergência aqui é o
		// bug clássico de dois SQL parecidos.
		expect(linhas.length).toBe(pessoas);
	});

	// ── FIX-383: A EXPORTAÇÃO LEVA O FILTRO DA TELA ────────────────────────
	//
	// O pedido da cliente (23/09): *"Só preciso ter um diagnóstico por etapa"*.
	// Exportar com um degrau selecionado devolvia TODOS os degraus — o arquivo
	// respondia por outro recorte que a lista. Aqui o arquivo e a lista são
	// comparados chave a chave, na mesma janela: nem uma linha a mais, nem a menos.
	describe("o arquivo leva o recorte da lista (FIX-383)", () => {
		const ANO_F = 2065 + Math.floor(Math.random() * 10);
		const MES_F = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
		const DE_F = new Date(`${ANO_F}-${MES_F}-01T00:00:00Z`);
		const ATE_F = new Date(`${ANO_F}-${MES_F}-28T23:59:59Z`);
		const DIA_F = new Date(`${ANO_F}-${MES_F}-15T12:00:00Z`);

		const visitas: Record<string, string> = {};

		/** Semeia uma pessoa parada no degrau pedido, no visitante indicado. */
		async function semearNivel(
			chave: "so_chegou" | "iniciou_conversa" | "se_identificou" | "viu_oferta",
		): Promise<void> {
			const visitorId = `v-${chave}-${crypto.randomUUID()}`;
			visitas[chave] = visitorId;
			const [visita] = await db
				.insert(schema.visits)
				.values({
					visitorId,
					channel: "web",
					landingPath: "/motos",
					utmSource: "facebook",
					utmCampaign: "filtro",
					userAgent: UA,
					createdAt: DIA_F,
				})
				.returning({ id: schema.visits.id });
			visitIds.push(visita.id);
			if (chave === "so_chegou") return;

			await db.insert(schema.pageEvents).values({
				visitId: visita.id,
				type: "click",
				path: "/motos",
				viewportWidth: 390,
				viewportHeight: 844,
				device: "mobile",
				createdAt: DIA_F,
			});
			const [conversa] = await db
				.insert(schema.conversations)
				.values({
					channel: "web",
					visitId: visita.id,
					isSimulated: false,
					createdAt: DIA_F,
					updatedAt: DIA_F,
				})
				.returning({ id: schema.conversations.id });
			convIds.push(conversa.id);
			const [mensagem] = await db
				.insert(schema.messages)
				.values({
					conversationId: conversa.id,
					role: "user",
					content: "quero uma moto",
					createdAt: DIA_F,
				})
				.returning({ id: schema.messages.id });
			if (chave === "iniciou_conversa") return;

			await db.insert(schema.leads).values({
				conversationId: conversa.id,
				name: "Cliente Filtro",
				phone: "+5511900001111",
				stage: "qualificado",
				isSimulated: false,
				createdAt: DIA_F,
				updatedAt: DIA_F,
			});
			if (chave === "se_identificou") return;

			await db.insert(schema.artifacts).values({
				messageId: mensagem.id,
				type: "real_offer",
				payload: {},
				createdAt: DIA_F,
			});
		}

		beforeAll(async () => {
			await semearNivel("so_chegou");
			await semearNivel("iniciou_conversa");
			await semearNivel("se_identificou");
			await semearNivel("viu_oferta");
		});

		it("exportar com o degrau devolve exatamente as linhas da lista filtrada", async () => {
			const { listarPercurso } = await import("@/lib/admin/percurso-queries");
			for (const passo of [
				"iniciou_conversa",
				"se_identificou",
				"viu_oferta",
			] as const satisfies readonly PassoDoPercurso[]) {
				const lista = await listarPercurso({
					from: DE_F,
					to: ATE_F,
					passo,
					modo: "parou",
					limit: 200,
				});
				const arquivo = await percurso.exportarPercurso({
					de: DE_F,
					ate: ATE_F,
					passo,
					modo: "parou",
				});

				const chavesDaLista = lista.pessoas.map((p) => p.visitorId).sort();
				const chavesDoArquivo = arquivo.map((l) => l.visitanteId).sort();
				expect(chavesDoArquivo).toEqual(chavesDaLista);
				expect(chavesDoArquivo).toEqual([visitas[passo]]);
			}
		});

		it("sem o filtro, o arquivo traz o recorte inteiro", async () => {
			const linhas = await percurso.exportarPercurso({ de: DE_F, ate: ATE_F });
			expect(linhas).toHaveLength(4);
		});
	});
});
