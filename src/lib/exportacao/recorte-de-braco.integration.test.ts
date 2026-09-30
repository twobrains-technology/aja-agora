// EXPORTAÇÃO — a coluna do braço do experimento e o recorte por braço (FIX-404).
//
// O que este arquivo protege, e por que contra Postgres real:
//
//   1. **A coluna existe e não é chute.** O arquivo exportado não pode derivar
//      braço por hash (chutar um A/B a partir do id da visita): exportar é
//      afirmar, e o braço tem que vir do metadata gravado. Fonte única, `IN`
//      dos braços do registro.
//   2. **A pessoa é ancorada na IDENTIFICAÇÃO** (D1): a pessoa que se
//      identificou na conversa A e abriu uma conversa B depois continua em A —
//      não vence a exposição mais recente. Quem nunca se identificou cai na
//      última exposição. Isso é SQL com `DISTINCT ON` e ordenação em duas
//      direções: só o banco prova.
//   3. **O arquivo responde o mesmo que a tela** (o recorte `ab=…`): com recorte,
//      a contagem do cartão é o número de linhas do arquivo.
//   4. **Genérico por experimento** (D4): injetando um experimento fictício no
//      registro, o arquivo sai com DUAS colunas — sem tocar no código.
//
// As pessoas semeadas são localizadas pelo `visitanteId` (a primeira visita da
// pessoa), e não pelo `contatoId`: `percurso.ts` lê `p.contact_id` do SQL e o
// mapper procura `contato_id` — defeito PRÉ-EXISTENTE, fora do escopo deste
// bloco, registrado em `.orientacao/pendencia-b4.md`.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXPERIMENTOS, type Experimento, SEM_BRACO } from "@/lib/experimentos/registro";
import { colunaDoBraco } from "./formato";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const ANO = 1970 + Math.floor(Math.random() * 45);
const MES = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const DE = new Date(`${ANO}-${MES}-01T00:00:00Z`);
const ATE = new Date(`${ANO}-${MES}-28T23:59:59Z`);
const DENTRO = new Date(`${ANO}-${MES}-15T12:00:00Z`);

const UA = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36";

/**
 * O experimento REAL, lido do registro — nada aqui escreve o nome da chave do
 * teste do telefone: quem o conhece é `EXPERIMENTOS` (D4).
 */
const EXPERIMENTO = EXPERIMENTOS[0]?.id ?? "";
/** A coluna do braço, como o módulo a nomeia (chave camelCase; o CSV snake_case). */
const COLUNA = colunaDoBraco(EXPERIMENTO);

/** O experimento fictício do teste de D4 — só existe aqui, e isso é o ponto. */
const FICTICIO: Experimento = {
	id: "testeFicticio",
	rotulo: "Teste fictício",
	bracos: ["X", "Y"],
	rotulosDosBracos: { X: "X — primeiro", Y: "Y — segundo" },
	etapaAncora: "identificados",
};
const REGISTRO_COM_FICTICIO: readonly Experimento[] = [...EXPERIMENTOS, FICTICIO];

const SEM_BRACO_NO_EXPORT = "sem variante: fora do teste";

describeIfDb("exportação — coluna do braço e recorte por braço (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let percurso: typeof import("./percurso");
	let conversas: typeof import("./conversas");
	let toques: typeof import("./toques");
	let limpeza: typeof import("./limpeza");

	const visitIds: string[] = [];
	const convIds: string[] = [];
	const contactIds: string[] = [];

	/** A marca da pessoa → o `visitor_id` da PRIMEIRA conversa dela. */
	const visitanteDe = new Map<string, string>();
	/** A marca da pessoa → o id do contato (para os casos que usam conversa). */
	const contatoDe = new Map<string, string>();

	async function semearPessoa(
		marca: string,
		conversas: Array<{
			braco: string | null;
			identificada: boolean;
			em: Date;
			canal?: "web" | "whatsapp";
		}>,
	): Promise<void> {
		const [contato] = await db
			.insert(schema.contacts)
			.values({
				name: `Contato ${marca}`,
				phone: `+55629${String(Math.floor(Math.random() * 1e8)).padStart(9, "0")}`,
			})
			.returning({ id: schema.contacts.id });
		contactIds.push(contato.id);
		contatoDe.set(marca, contato.id);

		for (const alvo of conversas) {
			const [visita] = await db
				.insert(schema.visits)
				.values({
					visitorId: `v-${crypto.randomUUID()}`,
					channel: alvo.canal ?? "web",
					utmSource: "facebook",
					utmCampaign: "exp-ab",
					userAgent: UA,
					createdAt: alvo.em,
				})
				.returning({ id: schema.visits.id, visitorId: schema.visits.visitorId });
			visitIds.push(visita.id);
			if (!visitanteDe.has(marca)) visitanteDe.set(marca, visita.visitorId);

			const [conversa] = await db
				.insert(schema.conversations)
				.values({
					channel: alvo.canal ?? "web",
					visitId: visita.id,
					contactId: contato.id,
					waId: alvo.canal === "whatsapp" ? `55629${Math.floor(Math.random() * 1e8)}` : null,
					metadata: alvo.braco
						? { [EXPERIMENTO]: { variante: alvo.braco } }
						: { algumOutroCampo: true },
					isSimulated: false,
					createdAt: alvo.em,
					updatedAt: alvo.em,
				})
				.returning({ id: schema.conversations.id });
			convIds.push(conversa.id);

			await db.insert(schema.messages).values({
				conversationId: conversa.id,
				role: "user",
				content: "quero uma moto",
				createdAt: alvo.em,
			});

			// Identificada = o FUNIL diz que é (`conversaIdentificada`): WhatsApp
			// conta por si; web conta com telefone/e-mail no lead. Usar o mesmo
			// predicado do painel é o que impede duas populações para o mesmo degrau.
			if (alvo.identificada && alvo.canal !== "whatsapp") {
				await db.insert(schema.leads).values({
					conversationId: conversa.id,
					contactId: contato.id,
					phone: `+55629${Math.floor(Math.random() * 1e8)}`,
					stage: "qualificado",
					isSimulated: false,
					createdAt: alvo.em,
					updatedAt: alvo.em,
				});
			}
		}
	}

	const umMinutoDepois = new Date(DENTRO.getTime() + 60 * 60 * 1000);

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		percurso = await import("./percurso");
		conversas = await import("./conversas");
		toques = await import("./toques");
		limpeza = await import("./limpeza");

		// A identificou e depois abriu B (sem identificar): a ÂNCORA vence.
		await semearPessoa("ancora", [
			{ braco: "A", identificada: true, em: DENTRO },
			{ braco: "B", identificada: false, em: umMinutoDepois },
		]);

		// Nunca identificou: A em t1, B em t2 ⇒ exposição (a última).
		await semearPessoa("exposicao", [
			{ braco: "A", identificada: false, em: DENTRO },
			{ braco: "B", identificada: false, em: umMinutoDepois },
		]);

		// WhatsApp identificado, sem metadata ⇒ fora do teste.
		await semearPessoa("whatsapp", [
			{ braco: null, identificada: true, em: DENTRO, canal: "whatsapp" },
		]);

		// Conversa web pré-teste: sem metadata e não identificada ⇒ fora do teste.
		await semearPessoa("pre-teste", [{ braco: null, identificada: false, em: DENTRO }]);
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db.delete(schema.messages).where(inArray(schema.messages.conversationId, convIds));
			await db.delete(schema.leads).where(inArray(schema.leads.conversationId, convIds));
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
		if (contactIds.length > 0) {
			await db.delete(schema.contacts).where(inArray(schema.contacts.id, contactIds));
		}
	});

	/** As linhas do arquivo que são da pessoa semeada com essa marca. */
	function linhasDaPessoa(linhas: Record<string, string>[], marca: string) {
		const visitante = visitanteDe.get(marca);
		return linhas.filter((l) => l.visitanteId === visitante);
	}

	describe("percurso — a coluna é da PESSOA, ancorada na identificação (D1)", () => {
		it("identificou em A e abriu B depois ⇒ A", async () => {
			const linhas = await percurso.exportarPercurso({ de: DE, ate: ATE });
			const daPessoa = linhasDaPessoa(linhas, "ancora");
			expect(daPessoa).toHaveLength(1);
			expect(daPessoa[0]?.[COLUNA]).toBe("A");
		});

		it("nunca identificou ⇒ a ÚLTIMA exposição (B)", async () => {
			const linhas = await percurso.exportarPercurso({ de: DE, ate: ATE });
			const daPessoa = linhasDaPessoa(linhas, "exposicao");
			expect(daPessoa).toHaveLength(1);
			expect(daPessoa[0]?.[COLUNA]).toBe("B");
		});

		it("só WhatsApp ⇒ a célula sai ESCRITA, nunca vazia", async () => {
			const linhas = await percurso.exportarPercurso({ de: DE, ate: ATE });
			const daPessoa = linhasDaPessoa(linhas, "whatsapp");
			expect(daPessoa).toHaveLength(1);
			expect(daPessoa[0]?.[COLUNA]).toBe(SEM_BRACO_NO_EXPORT);
		});

		it("conversa pré-teste sem metadata ⇒ texto, NUNCA braço por hash", async () => {
			const linhas = await percurso.exportarPercurso({ de: DE, ate: ATE });
			const daPessoa = linhasDaPessoa(linhas, "pre-teste");
			expect(daPessoa).toHaveLength(1);
			expect(daPessoa[0]?.[COLUNA]).toBe(SEM_BRACO_NO_EXPORT);
		});

		it("nenhuma célula vazia em nenhuma linha do arquivo", async () => {
			const linhas = await percurso.exportarPercurso({ de: DE, ate: ATE });
			for (const linha of linhas) {
				for (const valor of Object.values(linha)) expect(valor).not.toBe("");
			}
		});

		it("com recorte A, só quem foi ancorado em A aparece — e a contagem bate com as linhas", async () => {
			const recorte = [{ experimento: EXPERIMENTO, braco: "A" }] as const;
			const linhas = await percurso.exportarPercurso({ de: DE, ate: ATE, recorte });
			expect(linhasDaPessoa(linhas, "ancora")).toHaveLength(1);
			expect(linhasDaPessoa(linhas, "exposicao")).toHaveLength(0);
			expect(linhasDaPessoa(linhas, "whatsapp")).toHaveLength(0);
			expect(linhasDaPessoa(linhas, "pre-teste")).toHaveLength(0);

			const { pessoas } = await percurso.contarPercurso({ de: DE, ate: ATE, recorte });
			expect(pessoas).toBe(linhas.length);
		});

		it("com recorte sem-variante, aparecem as pessoas fora do teste", async () => {
			const recorte = [{ experimento: EXPERIMENTO, braco: SEM_BRACO }] as const;
			const linhas = await percurso.exportarPercurso({ de: DE, ate: ATE, recorte });
			expect(linhasDaPessoa(linhas, "whatsapp")).toHaveLength(1);
			expect(linhasDaPessoa(linhas, "pre-teste")).toHaveLength(1);
			expect(linhasDaPessoa(linhas, "ancora")).toHaveLength(0);
		});

		it("experimento fictício no registro ⇒ DUAS colunas, sem tocar no código (D4)", async () => {
			const linhas = await percurso.exportarPercurso({
				de: DE,
				ate: ATE,
				experimentos: REGISTRO_COM_FICTICIO,
			});
			const daPessoa = linhasDaPessoa(linhas, "ancora");
			expect(daPessoa[0]?.[COLUNA]).toBe("A");
			expect(daPessoa[0]?.varianteTesteFicticio).toBe(SEM_BRACO_NO_EXPORT);
		});

		it("sem recorte, a contagem do cartão continua batendo com o arquivo", async () => {
			const linhas = await percurso.exportarPercurso({ de: DE, ate: ATE });
			const { pessoas } = await percurso.contarPercurso({ de: DE, ate: ATE });
			expect(pessoas).toBe(linhas.length);
		});
	});

	describe("conversas — a coluna é DA CONVERSA (D10)", () => {
		it("a coluna lê o metadata da própria conversa", async () => {
			const linhas = await conversas.exportarConversas({
				de: DE,
				ate: ATE,
				conversationIds: [...convIds],
			});
			expect(linhas.some((l) => l[COLUNA] === "A")).toBe(true);
			expect(linhas.some((l) => l[COLUNA] === "B")).toBe(true);
			expect(linhas.some((l) => l[COLUNA] === SEM_BRACO_NO_EXPORT)).toBe(true);
		});

		it("com recorte A, só as conversas de braço A saem", async () => {
			const recorte = [{ experimento: EXPERIMENTO, braco: "A" }] as const;
			const linhas = await conversas.exportarConversas({
				de: DE,
				ate: ATE,
				conversationIds: [...convIds],
				recorte,
			});
			expect(linhas.length).toBeGreaterThan(0);
			for (const linha of linhas) expect(linha[COLUNA]).toBe("A");

			const { mensagens } = await conversas.contarConversas({
				de: DE,
				ate: ATE,
				conversationIds: [...convIds],
				recorte,
			});
			expect(mensagens).toBe(linhas.length);
		});

		it("experimento fictício ⇒ duas colunas", async () => {
			const linhas = await conversas.exportarConversas({
				de: DE,
				ate: ATE,
				conversationIds: [...convIds],
				experimentos: REGISTRO_COM_FICTICIO,
			});
			expect(Object.keys(linhas[0] ?? {})).toContain(COLUNA);
			expect(Object.keys(linhas[0] ?? {})).toContain("varianteTesteFicticio");
		});
	});

	describe("toques — a coluna é DA CONVERSA (D10)", () => {
		it("a coluna lê o metadata da conversa do toque", async () => {
			const contatoId = contatoDe.get("ancora");
			const conversaDoToque = convIds[0];
			expect(contatoId).toBeTruthy();
			expect(conversaDoToque).toBeTruthy();
			await db.insert(schema.remarketingTouches).values({
				conversationId: conversaDoToque as string,
				contactId: contatoId as string,
				objetivo: "moto",
				step: 1,
				status: "ATIVO",
				nextTouchAt: new Date(DENTRO.getTime() + 86_400_000),
				ultimoToqueEm: new Date(DENTRO.getTime() + 60_000),
				touches30d: 1,
				createdAt: DENTRO,
				updatedAt: DENTRO,
			});

			const linhas = await toques.exportarToquesDaRegua({ de: DE, ate: ATE });
			const linha = linhas.find((l) => l.conversaId === conversaDoToque);
			expect(linha?.[COLUNA]).toBe("A");

			const recorte = [{ experimento: EXPERIMENTO, braco: "A" }] as const;
			const comRecorte = await toques.exportarToquesDaRegua({ de: DE, ate: ATE, recorte });
			expect(comRecorte.some((l) => l.conversaId === conversaDoToque)).toBe(true);
			for (const l of comRecorte) expect(l[COLUNA]).toBe("A");

			const { toques: total } = await toques.contarToques({ de: DE, ate: ATE, recorte });
			expect(total).toBe(comRecorte.length);
		});
	});

	describe("limpeza — NÃO ganha coluna", () => {
		it("nenhuma coluna de braço no arquivo da limpeza", async () => {
			const linhas = await limpeza.exportarCandidatosDeLimpeza({ de: DE, ate: ATE });
			for (const linha of linhas) {
				for (const chave of Object.keys(linha)) {
					expect(chave.startsWith("variante")).toBe(false);
				}
			}
		});
	});
});
