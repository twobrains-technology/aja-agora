import { describe, expect, it } from "vitest";
import type { TurnTraceRecord } from "@/lib/telemetry/turn-trace";
import {
	PROFUNDIDADE_MAXIMA,
	profundidadeDoGate,
	scoreDeEntregaDoGate,
	scoresDeFalaPodada,
	scoresDeFalhaDeTool,
	scoresDeValorRevertido,
	scoresDoTurno,
} from "./funil-scores";

function record(over: Partial<TurnTraceRecord> = {}): TurnTraceRecord {
	return {
		traceId: "t1",
		conversationId: "c1",
		channel: "web",
		persona: null,
		gate: null,
		toolsCalled: [],
		toolCount: 0,
		artifactsEmitted: [],
		artifactCount: 0,
		suppressed: [],
		cacheRead: null,
		cacheWrite: null,
		textChars: 10,
		handoff: false,
		transitionedTo: null,
		leadStage: null,
		durationMs: 100,
		finishReason: null,
		startedAt: 0,
		turnoDoCliente: null,
		...over,
	};
}

const porNome = (r: TurnTraceRecord) => new Map(scoresDoTurno(r).map((s) => [s.name, s]));

describe("scoresDoTurno — o funil vira dimensão", () => {
	it("emite o gate como CATEGORICAL (é o que a Metrics API sabe agrupar)", () => {
		const s = porNome(record({ gate: "credit" })).get("gate");
		expect(s).toEqual({ name: "gate", value: "credit", dataType: "CATEGORICAL" });
	});

	it("emite a profundidade como NUMERIC pra dar conversão por sessão", () => {
		expect(porNome(record({ gate: "credit" })).get("funil_passo")?.value).toBe(4);
		expect(porNome(record({ gate: "contract" })).get("funil_passo")?.value).toBe(
			PROFUNDIDADE_MAXIMA,
		);
	});

	it("não pontua profundidade em doubts-wait — é pausa, não posição no funil", () => {
		const m = porNome(record({ gate: "doubts-wait" }));
		expect(m.get("gate")?.value).toBe("doubts-wait");
		expect(m.has("funil_passo")).toBe(false);
	});

	it("gate desconhecido não inventa profundidade", () => {
		expect(profundidadeDoGate("gate-que-nao-existe")).toBeNull();
		expect(porNome(record({ gate: "gate-que-nao-existe" })).has("funil_passo")).toBe(false);
	});

	it("turno sem gate não emite score de funil (ausência ≠ zero)", () => {
		const m = porNome(record({ gate: null }));
		expect(m.has("gate")).toBe(false);
		expect(m.has("funil_passo")).toBe(false);
	});
});

describe("scoresDoTurno — sinais de defeito do agente", () => {
	it("marca turno mudo quando o agente não escreveu nada", () => {
		expect(porNome(record({ textChars: 0 })).get("turno_mudo")?.value).toBe(1);
		expect(porNome(record({ textChars: 1 })).get("turno_mudo")?.value).toBe(0);
	});

	it("marca supressão de artefato e diz QUAIS guards bateram", () => {
		const s = porNome(record({ suppressed: ["reveal-loop", "post-closure"] })).get(
			"artefato_suprimido",
		);
		expect(s?.value).toBe(1);
		expect(s?.comment).toBe("reveal-loop, post-closure");
	});

	it("turno limpo reporta supressão zero, sem comment", () => {
		const s = porNome(record()).get("artefato_suprimido");
		expect(s?.value).toBe(0);
		expect(s?.comment).toBeUndefined();
	});

	it("registra handoff, tools e finish reason", () => {
		const m = porNome(
			record({
				handoff: true,
				toolCount: 2,
				toolsCalled: ["buscarOfertas", "simular"],
				finishReason: "tool-error-recovered",
			}),
		);
		expect(m.get("handoff")?.value).toBe(1);
		expect(m.get("tools_chamadas")?.value).toBe(2);
		expect(m.get("tools_chamadas")?.comment).toBe("buscarOfertas, simular");
		expect(m.get("finish_reason")).toEqual({
			name: "finish_reason",
			value: "tool-error-recovered",
			dataType: "CATEGORICAL",
		});
	});

	it("omite campos não observados em vez de mandar null", () => {
		const m = porNome(record());
		expect(m.has("finish_reason")).toBe(false);
		expect(m.has("lead_stage")).toBe(false);
		expect(m.has("persona")).toBe(false);
	});

	it("todo score booleano usa 1/0 — a API do Langfuse recusa outro valor", () => {
		const s = scoresDoTurno(record({ handoff: true, textChars: 0, suppressed: ["x"] }));
		for (const score of s.filter((x) => x.dataType === "BOOLEAN")) {
			expect([0, 1]).toContain(score.value);
		}
	});
});

describe("scoreDeEntregaDoGate", () => {
	it("gate sem entrega vale 0 — é ele que precisa virar alerta", () => {
		const [taxa] = scoreDeEntregaDoGate("desire", "none");
		expect(taxa).toMatchObject({ name: "gate_entregue", value: 0, dataType: "BOOLEAN" });
	});

	it.each(["interactive", "text"] as const)("gate entregue via %s vale 1", (via) => {
		expect(scoreDeEntregaDoGate("credit", via)[0].value).toBe(1);
	});

	// O comment é o que diz QUAL gate afundou sem precisar abrir o trace.
	it("o comentário identifica o gate e o caminho", () => {
		expect(scoreDeEntregaDoGate("reco-consent", "none")[0].comment).toBe("reco-consent — none");
	});

	// Sem o categórico o painel teria a taxa mas não o culpado — e `comment`
	// não é dimensão agregável no Langfuse.
	it("só o afundamento emite o categórico que nomeia o gate", () => {
		const afundou = scoreDeEntregaDoGate("desire", "none");
		expect(afundou).toHaveLength(2);
		expect(afundou[1]).toMatchObject({
			name: "gate_afundado",
			value: "desire",
			dataType: "CATEGORICAL",
		});

		expect(scoreDeEntregaDoGate("desire", "text")).toHaveLength(1);
	});
});

// FIX-431 — a tool que o modelo chamou e não rodou.
//
// Produção 2026-08-13, WhatsApp: `search_groups` fora do toolset da fase, o
// modelo recebeu `Tool not found` e vendeu isso ao cliente como problema
// técnico. `tools_chamadas` marcou 1 (contou a chamada!), `finish_reason` = ok,
// os quatro juízes aprovaram. Nenhum sinal existente distinguia tool que rodou
// de tool que nem existe — este é o score que faltava.
describe("scoresDeFalhaDeTool", () => {
	it("turno sem falha não emite score nenhum (não inventa zero)", () => {
		expect(scoresDeFalhaDeTool([])).toEqual([]);
	});

	it("tool ausente do toolset vira booleano + nome + tipo", () => {
		const scores = scoresDeFalhaDeTool([
			{ tool: "search_groups", tipo: "ausente", mensagem: 'Tool "search_groups" not found' },
		]);
		expect(scores[0]).toMatchObject({ name: "tool_falhou", value: 1, dataType: "BOOLEAN" });
		expect(scores[0].comment).toBe("search_groups (ausente)");
		expect(scores).toContainEqual({
			name: "tool_falha_nome",
			value: "search_groups",
			dataType: "CATEGORICAL",
		});
		expect(scores).toContainEqual({
			name: "tool_falha_tipo",
			value: "ausente",
			dataType: "CATEGORICAL",
		});
	});

	// Duas falhas da MESMA tool no turno são um defeito só — repetir o
	// categórico inflaria a contagem do painel e do alerta.
	it("não duplica o categórico quando a mesma tool falha duas vezes", () => {
		const scores = scoresDeFalhaDeTool([
			{ tool: "search_groups", tipo: "ausente", mensagem: "x" },
			{ tool: "search_groups", tipo: "ausente", mensagem: "x" },
		]);
		expect(scores.filter((s) => s.name === "tool_falha_nome")).toHaveLength(1);
		expect(scores.filter((s) => s.name === "tool_falha_tipo")).toHaveLength(1);
	});

	// `ausente` manda consertar tool-policy/directive; `erro` manda olhar a
	// Bevi. Alerta que não separa os dois não diz para onde ir.
	it("separa tool ausente de tool que estourou", () => {
		const scores = scoresDeFalhaDeTool([
			{ tool: "search_groups", tipo: "ausente", mensagem: "x" },
			{ tool: "simulate_quota", tipo: "erro", mensagem: "Bevi 500" },
		]);
		const tipos = scores.filter((s) => s.name === "tool_falha_tipo").map((s) => s.value);
		expect(tipos).toEqual(expect.arrayContaining(["ausente", "erro"]));
	});
});

// FIX-431 (P1 #13) — silêncio de verdade × card sem fala.
//
// Produção, WhatsApp, 2026-08-13, sessão `04fda013`, trace `71191c00`: o modelo
// chamou `simulate_quota` e `present_simulation_result`, o card foi emitido — e
// nenhuma letra saiu. `turno_mudo` marcou 1, o que está certo do ponto de vista
// do cliente (ele não recebeu texto), mas mistura dois defeitos diferentes:
//
//   • sem fala E sem artifact = o agente processou e não entregou NADA;
//   • sem fala COM artifact = o servidor podou a fala e entregou só o card
//     (na web o cliente ao menos vê o card; no WhatsApp é silêncio total).
//
// Os dois pedem conserto em lugares distintos, e um Monitor sobre a média de
// `turno_mudo` alertaria em falso no segundo caso. Separar é pré-requisito do
// alerta — é o ponto 13 do dossiê.
describe("turno mudo × card sem fala", () => {
	const base = {
		traceId: "t",
		conversationId: "c",
		channel: "whatsapp" as const,
		persona: null,
		gate: null,
		toolsCalled: [],
		toolCount: 0,
		artifactsEmitted: [],
		artifactCount: 0,
		suppressed: [],
		cacheRead: null,
		cacheWrite: null,
		textChars: 0,
		handoff: false,
		transitionedTo: null,
		leadStage: null,
		durationMs: 10,
		finishReason: null,
		startedAt: 0,
		turnoDoCliente: null,
	};

	function valor(scores: ReturnType<typeof scoresDoTurno>, nome: string) {
		return scores.find((s) => s.name === nome)?.value;
	}

	it("sem fala e sem card: turno mudo de verdade", () => {
		const s = scoresDoTurno(base);
		expect(valor(s, "turno_mudo")).toBe(1);
		expect(valor(s, "card_sem_fala")).toBe(0);
	});

	// O caso real do trace `71191c00`.
	it("sem fala mas COM card: é card_sem_fala, não turno mudo", () => {
		const s = scoresDoTurno({
			...base,
			artifactsEmitted: ["simulation_result"],
			artifactCount: 1,
		});
		expect(valor(s, "card_sem_fala")).toBe(1);
		expect(valor(s, "turno_mudo")).toBe(0);
	});

	it("com fala: nenhum dos dois acende", () => {
		const s = scoresDoTurno({ ...base, textChars: 42 });
		expect(valor(s, "turno_mudo")).toBe(0);
		expect(valor(s, "card_sem_fala")).toBe(0);
	});
});

// FIX-431 (P2 #14) — os dois instantes que o sistema sabia e não contava.
describe("fala podada e valor revertido", () => {
	it("sem poda, nenhum score (não inventa zero)", () => {
		expect(scoresDeFalaPodada([])).toEqual([]);
	});

	it("com poda, booleano com os motivos no comment", () => {
		const s = scoresDeFalaPodada(["gancho", "process-preamble", "gancho"]);
		expect(s[0]).toMatchObject({ name: "fala_podada", value: 1, dataType: "BOOLEAN" });
		// Motivo repetido é o mesmo guard atuando duas vezes — não polui o comment.
		expect(s[0].comment).toBe("gancho, process-preamble");
	});

	// Reincidência na MESMA conversa é o livelock por outra porta — o comment
	// diz o valor recusado e se ele tinha vindo do escape de gate preso.
	it("valor revertido registra o número e a origem", () => {
		expect(scoresDeValorRevertido({ valorRecusado: 238_000, veioDoEscape: true })[0]).toMatchObject(
			{ name: "valor_revertido", value: 1, comment: "238000 (escape)" },
		);
		expect(
			scoresDeValorRevertido({ valorRecusado: 1_000_000, veioDoEscape: false })[0].comment,
		).toBe("1000000");
	});
});

describe("primeira_resposta_com_numero — o sinal que prova a campanha de 30/08", () => {
	const valor = (r: TurnTraceRecord) =>
		scoresDoTurno(r).find((s) => s.name === "primeira_resposta_com_numero")?.value;

	it("vale 1 quando o primeiro turno entrega o card do valor", () => {
		// A mudança inteira: quem clica num chip de categoria recebe a agulha com
		// a parcela estimada em vez de "que legal, já tem um em mente?".
		expect(valor(record({ turnoDoCliente: 0, gate: "credit" }))).toBe(1);
	});

	it("vale 1 quando o primeiro turno já entrega a carta real", () => {
		// Quem chega com tudo (categoria + valor) e a vitrine está ligada pula o
		// card da agulha e vai direto à oferta. Também é número na tela.
		expect(
			valor(
				record({
					turnoDoCliente: 0,
					gate: "search",
					artifactsEmitted: ["comparison_table"],
					artifactCount: 1,
				}),
			),
		).toBe(1);
	});

	it("vale 0 quando o primeiro turno é só pergunta — e é ESTE o caso que se quer contar", () => {
		// O comportamento que matava 49% das conversas: elogio + pergunta, sem
		// nada na tela.
		expect(valor(record({ turnoDoCliente: 0, gate: "name" }))).toBe(0);
		expect(valor(record({ turnoDoCliente: 0, gate: "desire" }))).toBe(0);
	});

	it("emite 0 em vez de nada — score que só aparece quando vale 1 não tem denominador", () => {
		// É o mesmo vício que `carta_na_tela` documenta: sem o zero, a média no
		// Langfuse vira 1,0 para sempre e o sinal passa a medir a si mesmo.
		const s = scoresDoTurno(record({ turnoDoCliente: 0, gate: "name" }));
		expect(s.some((x) => x.name === "primeira_resposta_com_numero")).toBe(true);
	});

	it("NÃO é emitido fora do primeiro turno", () => {
		expect(valor(record({ turnoDoCliente: 1, gate: "credit" }))).toBeUndefined();
		expect(valor(record({ turnoDoCliente: 7, gate: "credit" }))).toBeUndefined();
	});

	it("nem quando o chamador não soube dizer qual turno é", () => {
		// Melhor não emitir do que afirmar que era o primeiro.
		expect(valor(record({ turnoDoCliente: null, gate: "credit" }))).toBeUndefined();
	});
});

describe("a régua de profundidade acompanhou a mudança de posição do `name`", () => {
	it("o nome vale mais que o valor do bem — porque agora vem depois dele", () => {
		// Com `name: 1`, uma conversa que informou o valor e chegou ao nome
		// registraria profundidade 1, e `max(funil_passo)` por sessão mostraria uma
		// QUEDA de conversão que é a própria mudança de instrumentação.
		expect(profundidadeDoGate("name")).toBeGreaterThan(profundidadeDoGate("credit") as number);
	});

	it("e ainda vem antes do pedido de documento", () => {
		expect(profundidadeDoGate("name")).toBeLessThan(profundidadeDoGate("identify") as number);
	});
});
