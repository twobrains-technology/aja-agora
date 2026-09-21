// A PESSOA, não a conversa (L1, 21/09/2026).
//
// O defeito medido em produção: web `a1b2c3d4` (telefone `62991234567`) disse
// "sua proposta já está registrada"; dois minutos depois o WhatsApp `e5f6a7b8`
// (telefone `5562991234567`) respondeu "ainda não aparece nenhuma proposta
// registrada aqui pra mim". Mesma pessoa, e a única proposta real (ITAÚ, 18/08)
// estava numa TERCEIRA conversa (`c9d0e1f2`).
//
// O que estes testes provam é o FATO de estado — não a fala: que a proposta
// registrada em outra conversa do mesmo telefone é encontrada, que o telefone
// casa nas três grafias, e que sem nada o dossiê diz o que FALTA em vez de
// ficar mudo. Zero rede/DB: as fontes entram por deps, como o gateway do FIX-14.

import { describe, expect, it, vi } from "vitest";
import { blocoDaPessoa } from "@/lib/agent/langgraph/nodes/contexto-da-tela";
import {
	avisarTelefoneCompartilhado,
	chaveDeTelefone,
	dossieDaPessoa,
	escolherContato,
	type FontesDaPessoa,
	mesmoTelefone,
	montarDossie,
	variantesDeTelefone,
} from "./pessoa";

/** O par de grafias do MESMO celular, com números sintéticos (DDD 62): o
 * formato com o 9º dígito e o antigo, sem ele. */
const TELEFONE_WEB = "62991234567"; // celular com o 9º dígito (11 dígitos)
const TELEFONE_WA = "5562991234567"; // waId do WhatsApp (com o DDI 55)
const TELEFONE_E164 = "+5562991234567"; // normalizePhoneBR de memory/identity
const TELEFONE_SEM_NOVE = "6291234567"; // formato antigo (10 dígitos)

const CONVERSA_WHATSAPP = "e5f6a7b8-0000-4000-8000-000000000000";
const CONVERSA_WEB = "a1b2c3d4-0000-4000-8000-000000000000";
const CONVERSA_DA_PROPOSTA = "c9d0e1f2-0000-4000-8000-000000000000"; // OUTRA conversa

const CONTATO = { id: "ct-1", name: "Kairo", phone: TELEFONE_SEM_NOVE };

const PROPOSTA_ITAU = {
	proposalId: "0a1b2c3d4e5f60718293a4b5",
	conversationId: CONVERSA_DA_PROPOSTA,
	administradora: "ITAÚ",
	grupo: "g-1188",
	creditValue: "132000.00",
	monthlyPayment: "3375.00",
	termMonths: 120,
	proposalStatus: "simulacao",
	createdAt: new Date("2026-08-18T13:00:00.000Z"),
};

const CONVERSAS = [
	{
		id: CONVERSA_WHATSAPP,
		channel: "whatsapp",
		createdAt: new Date("2026-09-21T15:00:00.000Z"),
		metadata: {},
	},
	{
		id: CONVERSA_WEB,
		channel: "web",
		createdAt: new Date("2026-09-21T14:58:00.000Z"),
		metadata: {
			escolha: {
				administradora: "Âncora",
				creditValue: 80_000,
				termMonths: 120,
				monthlyPayment: 700,
				origem: "mencao",
			},
		},
	},
];

/** O `brl` do contexto usa o espaço NÃO separável do locale pt-BR (`R$ 80.000,00`)
 * — normalizar aqui evita que o teste dependa do code point. */
const semNbsp = (s: string): string => s.replace(/\u00a0/g, " ");

/** Fontes dublês: contato por telefone (só casa nas grafias tolerantes). */
function fontes(over: Partial<FontesDaPessoa> = {}): FontesDaPessoa {
	return {
		contatoPorTelefone: async (telefone) =>
			variantesDeTelefone(telefone).includes(TELEFONE_SEM_NOVE) ? CONTATO : null,
		propostasPorContato: async () => [PROPOSTA_ITAU],
		conversasPorContato: async () => CONVERSAS,
		estagiosPorContato: async () => ["proposta_enviada"],
		...over,
	};
}

describe("chaveDeTelefone — as três grafias são a MESMA pessoa", () => {
	it("casa com/sem 55 e com/sem o 9º dígito", () => {
		const chaves = [TELEFONE_WEB, TELEFONE_WA, TELEFONE_E164, TELEFONE_SEM_NOVE].map(
			chaveDeTelefone,
		);
		expect(new Set(chaves).size).toBe(1);
		expect(chaves[0]).toBe(TELEFONE_SEM_NOVE);
	});

	it("mesmoTelefone responde pelas grafias e recusa outro número", () => {
		expect(mesmoTelefone(TELEFONE_WA, TELEFONE_E164)).toBe(true);
		expect(mesmoTelefone(TELEFONE_WEB, "62999998888")).toBe(false);
		// "55" em 10 dígitos é DDD (Santa Maria-RS), não código de país.
		expect(chaveDeTelefone("5532223333")).toBe("5532223333");
	});

	it("entrada vazia/inválida devolve null em vez de chute", () => {
		expect(chaveDeTelefone("")).toBeNull();
		expect(chaveDeTelefone(null)).toBeNull();
		expect(chaveDeTelefone("123")).toBeNull();
	});

	it("variantes cobre as formas GRAVADAS em contacts.phone (com e sem o 9)", () => {
		// O waId do WhatsApp pode vir SEM o 9º dígito e a web usa o número COM o 9 —
		// as duas formas entram na consulta.
		expect(new Set(variantesDeTelefone(TELEFONE_WA))).toEqual(
			new Set([TELEFONE_WEB, TELEFONE_SEM_NOVE, `+55${TELEFONE_WEB}`, `+55${TELEFONE_SEM_NOVE}`]),
		);
	});
});

describe("contato por telefone — telefones distintos não colidem e o empate é determinístico", () => {
	it("números quase iguais de assinantes diferentes não compartilham variante", () => {
		// Um dígito de diferença no FINAL: vizinhos, não o mesmo assinante.
		const vizinho = "62991234568";
		const minhas = variantesDeTelefone(TELEFONE_WEB);
		const dele = variantesDeTelefone(vizinho);
		expect(minhas.length).toBeGreaterThan(0);
		expect(dele.length).toBeGreaterThan(0);
		expect(minhas.filter((v) => dele.includes(v))).toEqual([]);
		expect(mesmoTelefone(TELEFONE_WEB, vizinho)).toBe(false);
		// O 9º dígito NÃO é colisão: é o mesmo assinante na grafia antiga.
		expect(minhas).toContain(TELEFONE_SEM_NOVE);
	});

	it("mesmo telefone em dois contatos: o mais recente vence, na mesma ordem ou trocada", () => {
		const antigo = {
			id: "ct-antigo",
			name: "Antigo",
			phone: TELEFONE_SEM_NOVE,
			createdAt: new Date("2026-01-01T00:00:00.000Z"),
		};
		const novo = {
			id: "ct-novo",
			name: "Novo",
			phone: TELEFONE_WEB,
			createdAt: new Date("2026-09-01T00:00:00.000Z"),
		};
		const primeira = escolherContato([antigo, novo]);
		const segunda = escolherContato([novo, antigo]);
		expect(primeira?.contato.id).toBe("ct-novo");
		expect(segunda?.contato.id).toBe("ct-novo");
		// Os dois casaram o MESMO telefone — é ambiguidade, e o aviso sai.
		expect(primeira?.quantos).toBe(2);
		expect(segunda?.quantos).toBe(2);
	});

	it("createdAt empatado: o desempate é estável (mesmo resultado duas vezes)", () => {
		const quando = new Date("2026-09-01T00:00:00.000Z");
		const a = { id: "ct-a", name: "A", phone: TELEFONE_SEM_NOVE, createdAt: quando };
		const b = { id: "ct-b", name: "B", phone: TELEFONE_WEB, createdAt: quando };
		const r1 = escolherContato([a, b])?.contato.id;
		const r2 = escolherContato([b, a])?.contato.id;
		expect(r1).toBeDefined();
		expect(r1).toBe(r2);
	});

	it("contato único não é ambiguidade", () => {
		const so = {
			id: "ct-so",
			name: "Só",
			phone: TELEFONE_SEM_NOVE,
			createdAt: new Date("2026-09-01T00:00:00.000Z"),
		};
		expect(escolherContato([so])?.quantos).toBe(1);
		expect(escolherContato([])).toBeNull();
	});

	it("o aviso de telefone compartilhado NÃO vaza o número (LGPD)", () => {
		const espiao = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			avisarTelefoneCompartilhado(2, TELEFONE_WEB);
			const linha = espiao.mock.calls.flat().join(" ");
			expect(linha).toContain("2 contatos");
			expect(linha).not.toContain(TELEFONE_WEB);
			expect(linha).not.toContain(TELEFONE_SEM_NOVE);
			expect(linha).not.toContain(TELEFONE_WA);
			expect(linha).not.toMatch(/\d{4}/); // nenhum bloco do número
		} finally {
			espiao.mockRestore();
		}
	});
});

describe("dossiê da pessoa — a proposta em OUTRA conversa aparece", () => {
	it("acha a proposta registrada em outra conversa do mesmo telefone", async () => {
		const dossie = await dossieDaPessoa(TELEFONE_WA, fontes());

		// O que o agente via na conversa ATUAL — vazio. É o defeito, medido.
		const porConversaAtual = [PROPOSTA_ITAU].filter((p) => p.conversationId === CONVERSA_WHATSAPP);
		expect(porConversaAtual).toHaveLength(0);

		// O que a PESSOA tem — a proposta real, e em qual conversa ela nasceu.
		expect(dossie.simulacoes).toHaveLength(1);
		expect(dossie.simulacoes[0]).toMatchObject({
			administradora: "ITAÚ",
			grupo: "g-1188",
			creditValue: 132_000,
			monthlyPayment: 3_375,
			termMonths: 120,
			status: "simulacao",
			conversaId: CONVERSA_DA_PROPOSTA,
			canal: null, // a conversa da proposta não veio no recorte — dito como tal
		});
		expect(dossie.contatoId).toBe("ct-1");
		expect(dossie.estagiosDoFunil).toEqual(["proposta_enviada"]);
		expect(dossie.semHistorico).toBe(false);
	});

	it("o bloco DIZ os números e ONDE a proposta está — não a nega", async () => {
		const dossie = await dossieDaPessoa(TELEFONE_E164, fontes());
		const bloco = blocoDaPessoa(dossie) ?? "";

		expect(bloco).toContain("ITAÚ");
		expect(bloco).toContain("132.000,00");
		expect(bloco).toContain("3.375,00");
		expect(bloco).toContain(CONVERSA_DA_PROPOSTA.slice(0, 8));
		// A escolha registrada no site vai junto (é o que a web já disse ao cliente).
		expect(bloco).toContain("Âncora");
		expect(bloco).toContain("80.000,00");
		expect(bloco).toContain("proposta_enviada");
		// E o status "simulacao" tem tradução: falta concluir a documentação.
		expect(bloco).toContain("CONCLUIR A DOCUMENTAÇÃO");
	});

	it("todas as grafias do telefone chegam ao MESMO dossiê", async () => {
		for (const grafia of [TELEFONE_WEB, TELEFONE_WA, TELEFONE_E164, TELEFONE_SEM_NOVE]) {
			const dossie = await dossieDaPessoa(grafia, fontes());
			expect(dossie.contatoId, `grafia '${grafia}' não resolveu o contato`).toBe("ct-1");
			expect(dossie.simulacoes).toHaveLength(1);
		}
	});

	it("propostas fora de ordem no banco saem mais recente primeiro", () => {
		const antiga = { ...PROPOSTA_ITAU, proposalId: "p-antiga", createdAt: new Date("2026-06-01") };
		const dossie = montarDossie({
			telefone: TELEFONE_WA,
			contato: CONTATO,
			propostas: [antiga, PROPOSTA_ITAU],
			conversas: CONVERSAS,
			estagios: ["qualificado", "qualificado"],
		});
		expect(dossie.simulacoes.map((s) => s.proposalId)).toEqual([
			"0a1b2c3d4e5f60718293a4b5",
			"p-antiga",
		]);
		expect(dossie.estagiosDoFunil).toEqual(["qualificado"]);
	});
});

describe("dossiê da pessoa — sem nada, o que FALTA (nunca vazio genérico)", () => {
	it("telefone sem nada registrado: diz que não há nada e manda começar do zero", async () => {
		const dossie = await dossieDaPessoa(
			"62988887777",
			fontes({ contatoPorTelefone: async () => null }),
		);
		expect(dossie.semHistorico).toBe(true);

		const bloco = blocoDaPessoa(dossie) ?? "";
		expect(bloco.length).toBeGreaterThan(50);
		expect(bloco).toMatch(/Não há NADA registrado por este telefone/);
		expect(bloco).toMatch(/O QUE FALTA: tudo/);
		// A armadilha que matou o atendimento: afirmar proposta inexistente.
		expect(bloco).toMatch(/não afirme que existe proposta em andamento/i);
	});

	it("escolha registrada SEM proposta: o que falta é concluir o cadastro", async () => {
		const dossie = await dossieDaPessoa(
			TELEFONE_WEB,
			fontes({ propostasPorContato: async () => [] }),
		);
		const bloco = semNbsp(blocoDaPessoa(dossie) ?? "");

		expect(bloco).toContain("NENHUMA proposta registrada até agora");
		expect(bloco).toMatch(/JÁ ESCOLHEU Âncora, carta de R\$ 80\.000,00/);
		expect(bloco).toMatch(/faltou CONCLUIR O CADASTRO/);
		// Nunca oferecer refazer tudo: a retomada é do ponto registrado.
		expect(bloco).toMatch(/nunca do começo/i);
	});
});
