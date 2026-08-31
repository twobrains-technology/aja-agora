/**
 * A campainha do D3/E1 — o alarme que NÃO depende de alguém abrir uma tela.
 *
 * ── Por que ele existe, e por que não é um Monitor do Langfuse ──────────────
 *
 * A medição desta entrega achou algo pior do que a falta do alarme: nos 6
 * handoffs de toda a base, o p50 de tempo aberto é 401,5 h — 16,7 dias. Metade
 * de um mês é a MEDIANA, não a cauda.
 *
 * A primeira versão do plano previa um Monitor do Langfuse. Dois motivos para
 * não ser:
 *
 * 1. **Monitor observa trace; handoff parado é AUSÊNCIA de trace.** O lead
 *    esquecido há 16 dias não gera evento nenhum — é exatamente por isso que
 *    ninguém o viu. Alarme que dispara com evento não pega silêncio.
 * 2. **O que estava entregue era uma tela.** E o incidente que motiva o item é
 *    sobre coisa que ninguém abriu. Trocar uma tela que ninguém abre por outra
 *    tela que ninguém abre não é entrega.
 *
 * ── O que este ciclo NÃO faz, de propósito ──────────────────────────────────
 *
 * **Não manda quando está tudo em dia.** Alarme que toca à toa é desligado na
 * primeira semana, e aí volta a não haver campainha nenhuma.
 *
 * **Não manda sem destinatário explícito.** `ALERTA_SLA_MESA_TO` vazio = não
 * envia, e registra por quê. É a mesma regra da rota de alerta do Langfuse:
 * default vazio + parâmetro explícito, porque e-mail cravado em código é como
 * alerta de um domínio cai na caixa de outro.
 *
 * **Não tem consulta própria.** Chama `computeLeadsParados`, a MESMA função que
 * pinta a lista no painel de Performance. Duas consultas para a mesma pergunta
 * divergem no primeiro ajuste de regra, e aí a tela e o e-mail passam a contar
 * histórias diferentes sobre o mesmo lead.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Enviado = { to: string; subject: string; html: string; text: string };
const sendEmail = vi.hoisted(() => vi.fn(async (_: Enviado) => {}));
const computeLeadsParados = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
const marcarSlaAlertado = vi.hoisted(() => vi.fn(async (_ids: string[]) => {}));

vi.mock("@/lib/email/sendgrid", () => ({ sendEmail }));
vi.mock("@/lib/admin/handoff-queries", () => ({ computeLeadsParados, marcarSlaAlertado }));

import { runSlaDaMesaCycle } from "./sla-da-mesa-cycle";

const parado = (over: Record<string, unknown> = {}) => ({
	leadId: "11111111-1111-1111-1111-111111111111",
	nome: "Marina Alves",
	telefone: "5562999998888",
	estagio: "qualificado",
	desdeISO: "2026-08-14T12:00:00.000Z",
	horasParado: 401.5,
	slaAlertadoEm: null as string | null,
	...over,
});

beforeEach(() => {
	sendEmail.mockClear();
	computeLeadsParados.mockClear();
	computeLeadsParados.mockResolvedValue([]);
	marcarSlaAlertado.mockClear();
	process.env.ALERTA_SLA_MESA_TO = "sustentacao@exemplo.com";
	process.env.SLA_MESA_LIMITE_HORAS = "24";
});

describe("o alarme toca quando tem gente parada", () => {
	it("manda o digest com quem está parado", async () => {
		computeLeadsParados.mockResolvedValue([parado({ horasParado: 26 })]);

		const r = await runSlaDaMesaCycle();

		expect(r.novos).toBe(1);
		expect(r.enviado).toBe(true);
		expect(sendEmail).toHaveBeenCalledTimes(1);
	});

	it("o e-mail traz nome, telefone e HÁ QUANTO TEMPO — é o que a mesa precisa para ligar", async () => {
		computeLeadsParados.mockResolvedValue([parado({ horasParado: 26 })]);

		await runSlaDaMesaCycle();
		const { html, text, subject } = sendEmail.mock.calls[0][0];

		for (const campo of [html, text]) {
			expect(campo).toContain("Marina Alves");
			expect(campo).toContain("5562999998888");
			// Horas ditas em dias: quem lê decide pelo tempo, não pela unidade crua.
			expect(campo).toMatch(/1,1 dias/);
		}
		// O assunto tem que dizer o tamanho do problema sem abrir o e-mail.
		expect(subject).toMatch(/1 lead/);
	});

	it("o mais antigo vem primeiro — é ele que a mesa tem que ligar agora", async () => {
		computeLeadsParados.mockResolvedValue([
			parado({ nome: "Recente", horasParado: 25 }),
			parado({ nome: "Menos recente", horasParado: 47 }),
		]);

		await runSlaDaMesaCycle();
		const { text } = sendEmail.mock.calls[0][0];
		expect(text.indexOf("Menos recente")).toBeLessThan(text.indexOf("Recente"));
	});

	it("lead sem nome não vira linha anônima — o telefone é o que permite agir", async () => {
		computeLeadsParados.mockResolvedValue([parado({ nome: null, horasParado: 26 })]);

		await runSlaDaMesaCycle();
		const { text } = sendEmail.mock.calls[0][0];
		expect(text).toContain("5562999998888");
		expect(text).toMatch(/sem nome/i);
	});
});

describe("o alarme não repete os mesmos nomes todo dia", () => {
	// ── O defeito que este bloco fecha ──────────────────────────────────────
	//
	// A primeira versão mandava a lista INTEIRA a cada ciclo. Com o estado real
	// medido (~24 leads na allowlist, p50 de 16,7 dias), a mesa receberia os
	// mesmos ~24 nomes todo dia — e desligaria a campainha na primeira semana,
	// que é o modo de falha que este arquivo nomeia duas vezes.
	//
	// ── Por que MARCA e não janela ──────────────────────────────────────────
	//
	// A segunda versão deduplicava por janela: alertava quem estava parado entre
	// `limite` e `limite + intervalo`. Funciona enquanto todo ciclo roda. Um
	// deploy, um restart de task no ECS, um blip do Redis — e o lead que cruzou
	// durante a lacuna chega ao ciclo seguinte já fora da janela: vira contagem
	// no rodapé e nunca é alertado individualmente. O alarme pulando em silêncio
	// exatamente o lead esquecido que ele existe para pegar. Apontado na revisão.
	//
	// A marca (`leads.sla_alertado_em`) não tem esse buraco: quem não foi
	// alertado continua pendente por quanto tempo durar a lacuna.
	//
	// Ela fica em `leads` e não em `lead_events` porque aquela tabela É o relógio
	// do SLA — escrever nela faria o lead parecer tocado e sair da lista.

	it("manda quem ainda não foi alertado", async () => {
		computeLeadsParados.mockResolvedValue([parado({ nome: "Recém-parado", horasParado: 26 })]);

		const r = await runSlaDaMesaCycle();

		expect(r.enviado).toBe(true);
		expect(sendEmail.mock.calls[0][0].text).toContain("Recém-parado");
	});

	it("NÃO repete quem já foi alertado", async () => {
		computeLeadsParados.mockResolvedValue([
			parado({
				nome: "Esquecido",
				horasParado: 401,
				desdeISO: "2026-08-14T10:00:00.000Z",
				slaAlertadoEm: "2026-08-20T10:00:00.000Z",
			}),
		]);

		const r = await runSlaDaMesaCycle();

		expect(r.enviado).toBe(false);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("o lead que cruzou durante um ciclo PERDIDO continua pendente", async () => {
		// É o caso que a janela deixava passar: parado há 400 h e nunca alertado,
		// porque o worker esteve fora quando ele cruzou. Com a marca, ele sai.
		computeLeadsParados.mockResolvedValue([
			parado({ nome: "Pulado no deploy", horasParado: 400, slaAlertadoEm: null }),
		]);

		const r = await runSlaDaMesaCycle();

		expect(r.enviado).toBe(true);
		expect(sendEmail.mock.calls[0][0].text).toContain("Pulado no deploy");
	});

	it("marca os alertados DEPOIS do envio — e-mail que falhou não pode marcar", async () => {
		computeLeadsParados.mockResolvedValue([parado({ leadId: "lead-1", horasParado: 26 })]);

		await runSlaDaMesaCycle();

		expect(marcarSlaAlertado).toHaveBeenCalledWith(["lead-1"]);
	});

	it("envio falhou, ninguém é marcado — senão o lead se perde para sempre", async () => {
		computeLeadsParados.mockResolvedValue([parado({ horasParado: 26 })]);
		sendEmail.mockRejectedValueOnce(new Error("SendGrid fora"));

		const r = await runSlaDaMesaCycle();

		expect(r.enviado).toBe(false);
		expect(marcarSlaAlertado).not.toHaveBeenCalled();
	});

	it("esquecido DE NOVO volta a tocar — o alarme é por episódio, não por vida do lead", async () => {
		// `slaAlertadoEm !== null` silenciava o lead para sempre. Com p50 de 16,7
		// dias, "esquecido, resgatado e esquecido de novo" não é exótico: é o
		// segundo abandono, e ele chegava mudo — contado só no rodapé.
		//
		// O discriminante é a ÚLTIMA MOVIMENTAÇÃO, que a consulta já devolve em
		// `desdeISO`. Alerta anterior à movimentação = episódio novo.
		computeLeadsParados.mockResolvedValue([
			parado({
				nome: "Esquecido de novo",
				horasParado: 30,
				slaAlertadoEm: "2026-08-01T10:00:00.000Z", // avisado em agosto…
				desdeISO: "2026-08-30T10:00:00.000Z", // …e o lead andou depois disso
			}),
		]);

		const r = await runSlaDaMesaCycle();

		expect(r.enviado).toBe(true);
		expect(sendEmail.mock.calls[0][0].text).toContain("Esquecido de novo");
	});

	it("o mesmo episódio não toca duas vezes", async () => {
		// Aviso POSTERIOR à última movimentação: é o mesmo abandono, já anunciado.
		computeLeadsParados.mockResolvedValue([
			parado({
				nome: "Mesmo episódio",
				horasParado: 401,
				desdeISO: "2026-08-14T10:00:00.000Z",
				slaAlertadoEm: "2026-08-20T10:00:00.000Z",
			}),
		]);

		const r = await runSlaDaMesaCycle();

		expect(r.enviado).toBe(false);
		expect(r.jaAlertados).toBe(1);
	});

	it("mas não esconde os antigos: diz quantos são e há quanto tempo", async () => {
		computeLeadsParados.mockResolvedValue([
			parado({ nome: "Recém-parado", horasParado: 26 }),
			parado({
				nome: "Esquecido",
				horasParado: 401,
				desdeISO: "2026-08-14T10:00:00.000Z",
				slaAlertadoEm: "2026-08-20T10:00:00.000Z",
			}),
			parado({
				nome: "Outro antigo",
				horasParado: 300,
				desdeISO: "2026-08-18T10:00:00.000Z",
				slaAlertadoEm: "2026-08-25T10:00:00.000Z",
			}),
		]);

		await runSlaDaMesaCycle();
		const { text, html } = sendEmail.mock.calls[0][0];

		for (const campo of [text, html]) {
			expect(campo).toContain("Recém-parado");
			expect(campo).not.toContain("Esquecido");
			expect(campo).toMatch(/2 lead/);
			expect(campo).toMatch(/16,7 dias/);
		}
	});

	it("o resultado declara os dois números", async () => {
		computeLeadsParados.mockResolvedValue([
			parado({ horasParado: 26 }),
			parado({
				horasParado: 401,
				desdeISO: "2026-08-14T10:00:00.000Z",
				slaAlertadoEm: "2026-08-20T10:00:00.000Z",
			}),
		]);

		const r = await runSlaDaMesaCycle();

		expect(r).toMatchObject({ novos: 1, jaAlertados: 1, enviado: true });
	});
});

describe("o alarme fica calado quando deve", () => {
	it("ninguém parado, nenhum e-mail", async () => {
		const r = await runSlaDaMesaCycle();

		expect(r.novos).toBe(0);
		expect(r.enviado).toBe(false);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("sem destinatário configurado NÃO envia — e diz por quê", async () => {
		process.env.ALERTA_SLA_MESA_TO = "";
		computeLeadsParados.mockResolvedValue([parado({ horasParado: 26 })]);
		const erro = vi.spyOn(console, "error").mockImplementation(() => {});

		const r = await runSlaDaMesaCycle();

		expect(sendEmail).not.toHaveBeenCalled();
		expect(r.enviado).toBe(false);
		expect(erro).toHaveBeenCalled();
		erro.mockRestore();
	});

	it("falha no envio não derruba o ciclo — o worker roda outros quatro", async () => {
		computeLeadsParados.mockResolvedValue([parado({ horasParado: 26 })]);
		sendEmail.mockRejectedValueOnce(new Error("SendGrid fora"));

		const r = await runSlaDaMesaCycle();

		expect(r.enviado).toBe(false);
		expect(r.novos).toBe(1);
	});
});

describe("o limite vem do ambiente", () => {
	it("usa SLA_MESA_LIMITE_HORAS", async () => {
		process.env.SLA_MESA_LIMITE_HORAS = "48";
		await runSlaDaMesaCycle();
		expect(computeLeadsParados).toHaveBeenCalledWith(48);
	});

	it("valor inválido cai no padrão em vez de virar NaN", async () => {
		// `NaN` viraria `make_interval(hours => NaN)` no SQL — a consulta quebra e o
		// alarme fica mudo justamente por causa de um typo na configuração.
		process.env.SLA_MESA_LIMITE_HORAS = "vinte e quatro";
		await runSlaDaMesaCycle();
		expect(computeLeadsParados).toHaveBeenCalledWith(24);
	});
});
