// O CICLO da régua — testado com BANCO e WhatsApp MOCKADOS (nada de rede).
//
// O motor já foi provado puro (`remarketing/motor.test.ts`). Aqui o que se prova
// é a ORDEM do ciclo, que é a defesa contra duplicidade: o contador/timestamp é
// gravado ANTES do envio. E que o mesmo tick fecha o buraco do CAPI.
//
// Toda dependência de I/O entra por parâmetro (`runRemarketingCycle(deps)`), o
// que torna o teste determinístico sem `vi.mock` de banco — o mock é a injeção.
// O único `vi.mock` é do BullMQ, para provar o `jobId` FIXO do job repetível.

import { beforeEach, describe, expect, it, vi } from "vitest";

const bullmq = vi.hoisted(() => ({
	adds: [] as Array<{ name: string; data: unknown; opts: Record<string, unknown> }>,
	workers: [] as unknown[],
}));

vi.mock("bullmq", () => ({
	Queue: class {
		async add(name: string, data: unknown, opts: Record<string, unknown>) {
			bullmq.adds.push({ name, data, opts });
		}
	},
	Worker: class {
		constructor(...args: unknown[]) {
			bullmq.workers.push(args);
		}
	},
}));
vi.mock("ioredis", () => ({ default: class {} }));

import { PARAMETROS_DE_FABRICA } from "@/lib/remarketing/regua";
import {
	entradaWebLigada,
	inteiroDaEnv,
	type LinhaDaRegua,
	reguaLigada,
	runRemarketingCycle,
	startRemarketingWorker,
} from "./remarketing-cycle";

const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date("2026-09-14T15:30:00Z"); // 12h30 em Brasília

function linha(over: Partial<LinhaDaRegua> = {}): LinhaDaRegua {
	return {
		conversationId: "11111111-1111-1111-1111-111111111111",
		contactId: "22222222-2222-2222-2222-222222222222",
		objetivo: "carro",
		step: 0,
		status: "ATIVO",
		nextTouchAt: new Date(AGORA.getTime() - 60_000),
		ultimoToqueEm: null,
		touches30d: 0,
		motivoSaida: null,
		channel: "whatsapp",
		waId: "5562999998888",
		metadata: {},
		lastInboundAt: new Date(AGORA.getTime() - 91 * 60_000),
		phone: null,
		nome: "Ana",
		optoutDaPessoaEm: null,
		viuOferta: false,
		teveProposta: false,
		...over,
	};
}

/** As dependências de I/O, todas dubladas. `ordem` registra a sequência real. */
function deps(over: Record<string, unknown> = {}) {
	const ordem: string[] = [];
	const base = {
		agora: AGORA,
		entrarNaRegua: vi.fn(async () => 0),
		listarVencidas: vi.fn(async () => [] as LinhaDaRegua[]),
		toquesDoContato: vi.fn(async () => [] as Date[]),
		simulacaoDoContato: vi.fn(async () => null as Date | null),
		telefoneDaEquipe: vi.fn(async () => false),
		gravarEstado: vi.fn(
			async (_args: { estado: { step: number; status: string; motivoSaida?: string | null } }) => {
				ordem.push("grava");
			},
		),
		segurarToquesDaEquipe: vi.fn(async () => 0),
		dispararTurno: vi.fn(async () => {
			ordem.push("turno");
		}),
		enviarArte: vi.fn(async () => {
			ordem.push("arte");
		}),
		enviarTemplate: vi.fn(async (_args: { usageKeys: readonly string[] }) => {
			ordem.push("template");
		}),
		despacharConversoes: vi.fn(async () => ({ enviados: 0 })),
		...over,
	};
	return { deps: base, ordem };
}

beforeEach(() => {
	bullmq.adds.length = 0;
	bullmq.workers.length = 0;
	// A régua nasce DESLIGADA em produção (chave operacional). Os testes abaixo
	// provam o comportamento LIGADO — quem prova a chave é o describe do fim.
	process.env.REMARKETING_ATIVO = "1";
});

describe("a chave operacional da régua", () => {
	it("nasce desligada — só o que o dono liga explicitamente conta", () => {
		expect(reguaLigada({})).toBe(false);
		expect(reguaLigada({ REMARKETING_ATIVO: "" })).toBe(false);
		expect(reguaLigada({ REMARKETING_ATIVO: "0" })).toBe(false);
		expect(reguaLigada({ REMARKETING_ATIVO: "nao" })).toBe(false);
		expect(reguaLigada({ REMARKETING_ATIVO: "1" })).toBe(true);
		expect(reguaLigada({ REMARKETING_ATIVO: " SIM " })).toBe(true);
		expect(reguaLigada({ REMARKETING_ATIVO: "true" })).toBe(true);
	});

	it("desligada: não inscreve, não dispara — e AINDA despacha o CAPI", async () => {
		delete process.env.REMARKETING_ATIVO;
		const { deps: d } = deps({
			listarVencidas: vi.fn(async () => [linha()]),
			entrarNaRegua: vi.fn(async () => 7),
		});

		const r = await runRemarketingCycle(d);

		expect(r.entradas).toBe(0);
		expect(r.disparados).toBe(0);
		// A régua nem olhou o banco…
		expect(d.entrarNaRegua).not.toHaveBeenCalled();
		expect(d.listarVencidas).not.toHaveBeenCalled();
		expect(d.enviarTemplate).not.toHaveBeenCalled();
		expect(d.dispararTurno).not.toHaveBeenCalled();
		// …nem segurou ninguém (a higiene da equipe é da régua ligada).
		expect(d.segurarToquesDaEquipe).not.toHaveBeenCalled();
		// …mas o despacho de conversões (que não é da régua) continua, senão o
		// evento ficaria `pending` para sempre.
		expect(d.despacharConversoes).toHaveBeenCalledTimes(1);
	});

	it("o worker avisa no log que a régua está desligada", async () => {
		delete process.env.REMARKETING_ATIVO;
		process.env.REDIS_URL = "redis://localhost:6379";
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		await startRemarketingWorker();
		expect(log.mock.calls.flat().join(" ")).toMatch(/régua DESLIGADA/);
		log.mockRestore();
	});
});

describe("env numérica com a chave publicada e VAZIA", () => {
	// O `.env.example` publica as chaves vazias de propósito (ausente-desligado),
	// e `Number("")` é `0`. Em `LIMIT` isso é "nenhuma linha"; no BullMQ é
	// `repeat.every: 0`, um job em laço. O default tem que vencer o vazio.
	it("vazio, ausente, inválido ou ≤ 0 cai no padrão", () => {
		expect(inteiroDaEnv(undefined, 50)).toBe(50);
		expect(inteiroDaEnv("", 50)).toBe(50);
		expect(inteiroDaEnv("   ", 50)).toBe(50);
		expect(inteiroDaEnv("0", 50)).toBe(50);
		expect(inteiroDaEnv("-3", 50)).toBe(50);
		expect(inteiroDaEnv("nao", 50)).toBe(50);
	});

	it("valor positivo de verdade é respeitado", () => {
		expect(inteiroDaEnv("7", 50)).toBe(7);
		expect(inteiroDaEnv("120", 50)).toBe(120);
		expect(inteiroDaEnv("120.9", 50)).toBe(120);
	});
});

describe("a entrada da WEB na régua", () => {
	it("nasce desligada — só o que o dono liga explicitamente conta", () => {
		expect(entradaWebLigada({})).toBe(false);
		expect(entradaWebLigada({ REMARKETING_ENTRADA_WEB: "" })).toBe(false);
		expect(entradaWebLigada({ REMARKETING_ENTRADA_WEB: "nao" })).toBe(false);
		expect(entradaWebLigada({ REMARKETING_ENTRADA_WEB: "1" })).toBe(true);
		expect(entradaWebLigada({ REMARKETING_ENTRADA_WEB: "true" })).toBe(true);
		expect(entradaWebLigada({ REMARKETING_ENTRADA_WEB: " SIM " })).toBe(true);
	});
});

describe("o ciclo grava o contador ANTES de enviar", () => {
	it("turno de retomada: grava → dispara o turno → anexa a arte (sem tocar o contador do watchdog)", async () => {
		const { deps: d, ordem } = deps({ listarVencidas: vi.fn(async () => [linha()]) });
		const r = await runRemarketingCycle(d);

		expect(r.disparados).toBe(1);
		// O "retomada" que estava entre "grava" e "turno" era o contador do
		// watchdog — quem conta os toques da régua é a régua (FIX-377).
		expect(ordem).toEqual(["grava", "turno", "arte"]);
		// O que foi gravado tem o passo já contado — é o toque 01 do ciclo.
		const gravado = d.gravarEstado.mock.calls[0][0] as { estado: { step: number } };
		expect(gravado.estado.step).toBe(1);
	});

	it("template: grava → envia o template", async () => {
		const { deps: d, ordem } = deps({
			listarVencidas: vi.fn(async () => [
				linha({ lastInboundAt: new Date(AGORA.getTime() - 4 * DIA) }),
			]),
		});
		const r = await runRemarketingCycle(d);

		expect(r.disparados).toBe(1);
		expect(ordem).toEqual(["grava", "template"]);
		// A chave sai do OBJETIVO gravado na linha — e da FASE lida dos sinais; sem
		// sinal nenhum, a fase é "inicio". Quem decide se o template existe é o
		// dispatcher, não o ciclo.
		const envio = d.enviarTemplate.mock.calls[0][0] as { usageKeys: readonly string[] };
		expect(envio.usageKeys).toEqual(["remarketing_inicio_carro", "remarketing_inicio_generico"]);
	});

	it("template com proposta na mesa → chaves de `fechamento` (a fase muda a mensagem)", async () => {
		const { deps: d } = deps({
			listarVencidas: vi.fn(async () => [
				linha({ lastInboundAt: new Date(AGORA.getTime() - 4 * DIA), teveProposta: true }),
			]),
		});
		const r = await runRemarketingCycle(d);

		expect(r.disparados).toBe(1);
		const envio = d.enviarTemplate.mock.calls[0][0] as { usageKeys: readonly string[] };
		expect(envio.usageKeys).toEqual([
			"remarketing_fechamento_carro",
			"remarketing_fechamento_generico",
		]);
	});

	it("no MESMO tick, despacha as conversões pendentes do CAPI", async () => {
		const { deps: d } = deps({ listarVencidas: vi.fn(async () => [linha()]) });
		await runRemarketingCycle(d);
		expect(d.despacharConversoes).toHaveBeenCalledTimes(1);
	});
});

describe("os bloqueios do motor chegam ao ciclo", () => {
	it("telefone interno: nada é enviado, e a linha sai do índice COM MOTIVO", async () => {
		const { deps: d } = deps({
			listarVencidas: vi.fn(async () => [linha({ waId: "556292496793" })]),
		});
		const r = await runRemarketingCycle(d);

		expect(r.disparados).toBe(0);
		expect(r.nada.telefone_interno).toBe(1);
		expect(d.dispararTurno).not.toHaveBeenCalled();
		expect(d.enviarTemplate).not.toHaveBeenCalled();
		// A LINHA PRECISA SAIR DA RÉGUA: sem isto ela é relida a cada 30 s para
		// sempre, aparece como "ativa" na tela e ninguém sabe por que não dispara.
		const gravado = d.gravarEstado.mock.calls[0][0] as {
			estado: { status: string; motivoSaida?: string | null };
		};
		expect(gravado.estado.status).toBe("RESPONDEU");
		expect(gravado.estado.motivoSaida).toBe("telefone_da_equipe");
	});

	it("a equipe é segurada pelo ciclo, não pela tela — e o motivo é nomeado", async () => {
		const { deps: d } = deps({
			segurarToquesDaEquipe: vi.fn(async () => 2),
		});
		const r = await runRemarketingCycle(d);

		expect(d.segurarToquesDaEquipe).toHaveBeenCalledTimes(1);
		expect(r.seguradosDaEquipe).toBe(2);
	});

	it("o toque sai SEM arte quando o bem não é conhecido", async () => {
		const { deps: d, ordem } = deps({
			listarVencidas: vi.fn(async () => [linha({ objetivo: "desconhecido" })]),
		});
		const r = await runRemarketingCycle(d);

		expect(r.disparados).toBe(1);
		// Nasceu o turno, mas a imagem não saiu: é o defeito de 18/09 (a foto do
		// carro embaixo de "carro, apartamento ou moto?").
		expect(ordem).toEqual(["grava", "turno"]);
		expect(d.enviarArte).not.toHaveBeenCalled();
	});

	it("teto de 30 dias montado pelo ciclo bloqueia o toque", async () => {
		const recentes = [
			new Date(AGORA.getTime() - 3 * DIA),
			new Date(AGORA.getTime() - 2 * DIA),
			new Date(AGORA.getTime() - 1 * DIA),
		];
		const { deps: d } = deps({
			listarVencidas: vi.fn(async () => [linha()]),
			toquesDoContato: vi.fn(async () => recentes),
		});
		const r = await runRemarketingCycle(d);

		expect(r.disparados).toBe(0);
		expect(r.nada.teto_30_dias).toBe(1);
		expect(d.gravarEstado).not.toHaveBeenCalled();
	});

	it("quem respondeu não recebe: grava o terminal para sair do índice", async () => {
		const ultimoToque = new Date(AGORA.getTime() - 3 * DIA);
		const { deps: d } = deps({
			listarVencidas: vi.fn(async () => [
				linha({
					step: 1,
					nextTouchAt: new Date(ultimoToque.getTime() + 3 * DIA),
					lastInboundAt: new Date(ultimoToque.getTime() + 30 * 60_000),
				}),
			]),
		});
		const r = await runRemarketingCycle(d);

		expect(r.disparados).toBe(0);
		expect(r.nada.ja_respondeu).toBe(1);
		const gravado = d.gravarEstado.mock.calls[0][0] as { estado: { status: string } };
		expect(gravado.estado.status).toBe("RESPONDEU");
		expect(d.dispararTurno).not.toHaveBeenCalled();
	});

	it("opt-out por telefone bloqueia mesmo com estado reaberto", async () => {
		const { deps: d } = deps({
			listarVencidas: vi.fn(async () => [
				linha({
					optoutDaPessoaEm: new Date(AGORA.getTime() - DIA),
				}),
			]),
		});
		const r = await runRemarketingCycle(d);

		expect(r.disparados).toBe(0);
		expect(r.nada.optout_da_pessoa).toBe(1);
		const gravado = d.gravarEstado.mock.calls[0][0] as { estado: { status: string } };
		expect(gravado.estado.status).toBe("OPTOUT");
	});
});

describe("FIX-376/377 — a escala curta entrega os TRÊS toques", () => {
	/** 12h30 de Brasília (15h30 UTC) — o instante do toque 01. */
	const T0 = new Date("2026-09-14T15:30:00Z");
	const MIN = 60_000;

	/**
	 * A prova pedida pelo card: com a escala curta, o toque 01, o 02 e o 03 SAEM —
	 * e o portão do watchdog (`conversationMetadata.retomada` esgotado) NÃO os mata.
	 *
	 * A pessoa está PARADA HÁ 1 H (`last_inbound_at` uma hora antes) e a linha já
	 * está na régua, vencida — o cenário do card. O ciclo é rodado TRÊS vezes com
	 * um estado vivo da linha, como em produção (uma passada a cada 30 s): o que o
	 * ciclo grava em `gravarEstado` é o que a leitura do tick seguinte enxerga.
	 */
	async function tocarTresVezes(metadata: unknown) {
		let viva = linha({
			step: 0,
			status: "ATIVO",
			nextTouchAt: T0,
			ultimoToqueEm: null,
			lastInboundAt: new Date(T0.getTime() - 60 * MIN),
			metadata,
		});
		const disparos: Array<{ passo: number; em: Date; via: string }> = [];
		let agora = T0;

		const rodar = async () => {
			const r = await runRemarketingCycle({
				agora,
				entrarNaRegua: async () => 0,
				// A linha só volta quando `next_touch_at` venceu — como o índice real.
				listarVencidas: async (t) =>
					viva.nextTouchAt && viva.nextTouchAt.getTime() <= t.getTime() ? [viva] : [],
				toquesDoContato: async () => [],
				simulacaoDoContato: async () => null,
				telefoneDaEquipe: async () => false,
				gravarEstado: async ({ estado, touches30d }) => {
					viva = {
						...viva,
						step: estado.step,
						status: estado.status,
						nextTouchAt: estado.nextTouchAt,
						ultimoToqueEm: estado.ultimoToqueEm,
						motivoSaida: estado.motivoSaida,
						touches30d,
					};
				},
				segurarToquesDaEquipe: async () => 0,
				dispararTurno: async () => {
					disparos.push({ passo: viva.step, em: agora, via: "turno" });
				},
				enviarArte: async () => {},
				enviarTemplate: async () => {
					disparos.push({ passo: viva.step, em: agora, via: "template" });
				},
				lerParametros: async () => PARAMETROS_DE_FABRICA,
				despacharConversoes: async () => ({ enviados: 0 }),
			});
			return r;
		};

		const resultado = [await rodar()];
		// Os dois ticks seguintes acontecem no instante que o ciclo agendou.
		for (let i = 0; i < 2; i++) {
			agora = viva.nextTouchAt as Date;
			resultado.push(await rodar());
		}
		return { disparos, resultado, viva };
	}

	it("o 01, o 02 e o 03 saem, com 20 e 30 minutos entre eles", async () => {
		const { disparos, resultado, viva } = await tocarTresVezes({});

		expect(resultado.map((r) => r.disparados)).toEqual([1, 1, 1]);
		expect(disparos.map((d) => d.passo)).toEqual([1, 2, 3]);
		expect(disparos.map((d) => d.via)).toEqual(["turno", "turno", "turno"]);

		// O toque 01 sai com 1 h de silêncio — em MINUTOS, não em 90.
		expect(disparos[0].em.getTime()).toBe(T0.getTime());
		// E os intervalos são os da escala: +20 e +30 minutos.
		expect(disparos[1].em.getTime() - disparos[0].em.getTime()).toBe(20 * MIN);
		expect(disparos[2].em.getTime() - disparos[1].em.getTime()).toBe(30 * MIN);
		// Esgotou os três: a linha sai do índice com o motivo nomeado.
		expect(viva.status).toBe("ESGOTADO");
		expect(viva.motivoSaida).toBe("tres_toques_sem_resposta");
	});

	it("o contador do watchdog esgotado NÃO barra os toques da régua", async () => {
		// É o defeito do FIX-377: `MAX_RETOMADAS = 2` barrava o turno da régua.
		const { disparos, resultado } = await tocarTresVezes({
			retomada: { attempts: 9, lastAt: T0.getTime() },
		});

		expect(resultado.map((r) => r.disparados)).toEqual([1, 1, 1]);
		expect(disparos).toHaveLength(3);
	});

	it("opt-out da pessoa continua barrando os três", async () => {
		const { deps: d } = deps({
			listarVencidas: vi.fn(async () => [
				linha({ lastInboundAt: T0, optoutDaPessoaEm: new Date(T0.getTime() + MIN) }),
			]),
		});
		const r = await runRemarketingCycle(d);
		expect(r.disparados).toBe(0);
		expect(r.nada.optout_da_pessoa).toBe(1);
	});
});

describe("o job repetível tem jobId FIXO (uma cópia por vez)", () => {
	it("agenda com `repeat.every` e `jobId` fixo, como o gate-reengage-poll", async () => {
		process.env.REDIS_URL = "redis://localhost:6379";
		try {
			await startRemarketingWorker();
		} finally {
			process.env.REDIS_URL = undefined;
		}

		expect(bullmq.adds.length).toBe(1);
		expect(bullmq.adds[0].opts.jobId).toBe("remarketing-cycle-cron");
		expect(bullmq.adds[0].opts.repeat).toEqual({ every: 30_000 });
		expect(bullmq.workers.length).toBe(1);
	});
});
