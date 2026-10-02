// A TELA CONCORDA COM O WORKER — a régua conversa a conversa, sem banco.
//
// A coluna "Régua" (Conversas e Percurso) responde a MESMA pergunta que o ciclo:
// "esta conversa entra na régua?". Aqui se prova que a resposta é a mesma função
// — `avaliarRegua` monta o veredito com `motivoForaDaRegua`, que chama
// `avaliarElegibilidade` — e, em particular, o caso que estava quebrado em
// produção (D9): a conversa da WEB, que nunca tem `last_inbound_at` e por isso
// aparecia como "ainda em silêncio" enquanto o worker também nunca a inscrevia.

import { describe, expect, it } from "vitest";
import { avaliarElegibilidade, type ConversaAvaliada } from "@/lib/remarketing/motivo-de-exclusao";
import { avaliarRegua, type FatosDaConversa } from "./regua-por-conversa";

/** 09:00 de 17/09/2026 em Brasília (12:00 UTC) — dentro da janela de horário. */
const AGORA = new Date("2026-09-17T12:00:00Z");
/** A fala do cliente às 00:00 BRT do mesmo dia — 9 h de silêncio. */
const FALA = new Date("2026-09-17T03:00:00Z");

const ENV_WEB = { REMARKETING_ATIVO: "1", REMARKETING_ENTRADA_WEB: "1" };

/** Uma conversa da web como o banco a devolve: sem `wa_id` e sem inbound. */
function web(over: Partial<FatosDaConversa> = {}): FatosDaConversa {
	return {
		conversationId: "11111111-1111-1111-1111-111111111111",
		channel: "web",
		status: "active",
		isSimulated: false,
		contactId: "22222222-2222-2222-2222-222222222222",
		lastInboundAt: null,
		waId: null,
		telefone: "5562999998888",
		ultimaMensagemDoClienteEm: FALA,
		regua: null,
		...over,
	};
}

/** O veredito cru do worker para a mesma conversa (a fonte canônica). */
function oWorkerDiz(f: FatosDaConversa, env: Record<string, string | undefined>) {
	const avaliada: ConversaAvaliada = {
		channel: f.channel,
		status: f.status,
		isSimulated: f.isSimulated,
		contactId: f.contactId,
		lastInboundAt: f.lastInboundAt,
		ultimaMensagemDoClienteEm: f.ultimaMensagemDoClienteEm,
		waId: f.waId,
		phone: f.telefone,
		jaNaRegua: f.regua !== null,
	};
	const veredito = avaliarElegibilidade(avaliada, AGORA, {
		reguaLigada: env.REMARKETING_ATIVO === "1",
		entradaWeb: env.REMARKETING_ENTRADA_WEB === "1",
		telefoneDaEquipe: false,
	});
	return veredito.elegivel ? null : veredito.motivo;
}

describe("a coluna Régua e o ciclo respondem a mesma coisa (D9)", () => {
	it("conversa da web com a flag ligada: a tela não mostra motivo nenhum", () => {
		const fatos = web();
		const [avaliacao] = [...avaliarRegua([fatos], AGORA, () => false, ENV_WEB).values()];

		expect(avaliacao.motivo).toBeNull();
		expect(avaliacao.motivo).toBe(oWorkerDiz(fatos, ENV_WEB));
	});

	it("sem a flag web, a tela diz `conversa_web` — como hoje", () => {
		const fatos = web();
		const [avaliacao] = [
			...avaliarRegua([fatos], AGORA, () => false, { REMARKETING_ATIVO: "1" }).values(),
		];

		expect(avaliacao.motivo).toBe("conversa_web");
		expect(avaliacao.motivo).toBe(oWorkerDiz(fatos, { REMARKETING_ATIVO: "1" }));
	});

	it("web sem fala nenhuma continua fora, com o motivo nomeado", () => {
		const fatos = web({ ultimaMensagemDoClienteEm: null });
		const [avaliacao] = [...avaliarRegua([fatos], AGORA, () => false, ENV_WEB).values()];

		expect(avaliacao.motivo).toBe("ainda_em_silencio");
		expect(avaliacao.motivo).toBe(oWorkerDiz(fatos, ENV_WEB));
	});

	it("o telefone alcançável da web é o do cadastro, e ele não é da equipe", () => {
		const [avaliacao] = [...avaliarRegua([web()], AGORA, () => false, ENV_WEB).values()];

		expect(avaliacao.temTelefone).toBe(true);
		expect(avaliacao.ehDaEquipe).toBe(false);
		expect(avaliacao.telefoneMascarado).toBe("(62) 9…-8888");
	});
});
