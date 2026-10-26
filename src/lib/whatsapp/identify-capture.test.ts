import { describe, expect, it, vi } from "vitest";

// O módulo importa o banco; aqui só interessa a decisão de resposta.
vi.mock("@/db", () => ({ db: {} }));

describe("o CPF capturado no WhatsApp não responde com frase fixa", () => {
	it("CPF guardado: resposta NULA, o turno do agente segue (e pode fechar no mesmo turno)", async () => {
		const { respostaDoCaptureDeCpf } = await import("./identify-capture");
		expect(respostaDoCaptureDeCpf({ handled: true, outcome: "captured" })).toBeNull();
	});

	it("tentativa de CPF inválido mantém a resposta própria", async () => {
		const { respostaDoCaptureDeCpf, IDENTIFY_INVALID_CPF_REPLY } = await import(
			"./identify-capture"
		);
		expect(respostaDoCaptureDeCpf({ handled: true, outcome: "invalid" })).toBe(
			IDENTIFY_INVALID_CPF_REPLY,
		);
		expect(IDENTIFY_INVALID_CPF_REPLY).toMatch(/não confere/i);
	});

	it("texto que não é CPF segue pro modelo", async () => {
		const { respostaDoCaptureDeCpf } = await import("./identify-capture");
		expect(respostaDoCaptureDeCpf({ handled: false })).toBeNull();
	});
});

describe("telefone e número comprido não são CPF", () => {
	it("CPF com DV válido é capturado, com ou sem pontuação", async () => {
		const { decidirCpfDoTexto } = await import("./identify-capture");
		expect(decidirCpfDoTexto("meu cpf é 529.982.247-25", { pedidoDeCpf: false })).toEqual({
			outcome: "captured",
			cpf: "52998224725",
		});
		expect(decidirCpfDoTexto("52998224725", { pedidoDeCpf: false })).toEqual({
			outcome: "captured",
			cpf: "52998224725",
		});
	});

	it("celular ditado NÃO vira CPF nem identidade persistida", async () => {
		const { decidirCpfDoTexto } = await import("./identify-capture");
		expect(decidirCpfDoTexto("meu celular é 11 98765-4321", { pedidoDeCpf: false }).outcome).toBe(
			"none",
		);
		// 11900000083 passa no dígito verificador por coincidência: mesmo assim é
		// CELULAR (DDD válido + 9), e identidade não se grava com telefone.
		expect(decidirCpfDoTexto("11900000083", { pedidoDeCpf: false }).outcome).toBe("none");
	});

	it("número comprido fora de um pedido de CPF segue pro modelo", async () => {
		const { decidirCpfDoTexto } = await import("./identify-capture");
		expect(decidirCpfDoTexto("meu número é 5511987654321", { pedidoDeCpf: false }).outcome).toBe(
			"none",
		);
		expect(decidirCpfDoTexto("quero um carro de 80 mil", { pedidoDeCpf: false }).outcome).toBe(
			"none",
		);
	});

	it("só quando o CPF acabou de ser pedido o número errado vira 'CPF não confere'", async () => {
		const { decidirCpfDoTexto } = await import("./identify-capture");
		expect(decidirCpfDoTexto("11987654321", { pedidoDeCpf: true }).outcome).toBe("invalid");
		expect(decidirCpfDoTexto("111.444.777-36", { pedidoDeCpf: true }).outcome).toBe("invalid");
	});

	it("logo depois do pedido, o número ambíguo é lido como CPF — como na `main`", async () => {
		const { decidirCpfDoTexto } = await import("./identify-capture");
		// `11900000083` é celular E passa no DV. Depois de "qual seu CPF?", o que o
		// cliente manda é resposta a essa pergunta: o número vira CPF (é o que a
		// `main` fazia dentro do gate identify).
		expect(decidirCpfDoTexto("11900000083", { pedidoDeCpf: true })).toEqual({
			outcome: "captured",
			cpf: "11900000083",
		});
		// Fora do pedido, continua telefone (o teste acima). E a declaração do dado
		// vence a cara de celular em qualquer contexto.
		expect(decidirCpfDoTexto("meu cpf é 11900000083", { pedidoDeCpf: false })).toEqual({
			outcome: "captured",
			cpf: "11900000083",
		});
	});

	it("o pedido de CPF é a ÚLTIMA fala do agente, sem turno do cliente no meio", async () => {
		const { pedidoDeCpfNoUltimoBalao } = await import("./identify-capture");
		expect(pedidoDeCpfNoUltimoBalao({ role: "assistant", content: "me manda seu CPF?" })).toBe(
			true,
		);
		// MENÇÃO EXPLICATIVA não é pedido (rodada 4 da auditoria, P188): o balão
		// fala do CPF e pede o CELULAR. Lido como pedido de CPF, o celular ambíguo
		// que o cliente dita em resposta é guardado como identidade.
		expect(
			pedidoDeCpfNoUltimoBalao({
				role: "assistant",
				content: "Já expliquei como funciona a consulta do CPF. Qual é seu celular?",
			}),
		).toBe(false);
		expect(
			pedidoDeCpfNoUltimoBalao({
				role: "assistant",
				content: "Seu CPF fica protegido. Me passa seu WhatsApp?",
			}),
		).toBe(false);
		// E o pedido de CPF de verdade continua abrindo o contexto, pelo mesmo
		// caminho: o número ambíguo que responde a ele é CPF.
		expect(
			pedidoDeCpfNoUltimoBalao({
				role: "assistant",
				content: "Já expliquei como funciona a consulta do CPF. Agora preciso do seu CPF.",
			}),
		).toBe(true);
		expect(pedidoDeCpfNoUltimoBalao({ role: "assistant", content: "qual valor você quer?" })).toBe(
			false,
		);
		// A última fala foi do cliente: o número que ele manda agora não responde a
		// pedido nenhum.
		expect(pedidoDeCpfNoUltimoBalao({ role: "user", content: "meu cpf é 52998224725" })).toBe(
			false,
		);
		expect(pedidoDeCpfNoUltimoBalao(null)).toBe(false);
	});

	// P188 (rodada 5): "Seu CPF já está cadastrado." era lido como pedido — o
	// prefixo `cadastra` de "cadastrado" casava o verbo de pedido — e o celular
	// que o cliente mandava depois podia ser gravado como identidade.
	it("constatação cadastral isolada não é pedido de CPF", async () => {
		const { decidirCpfDoTexto: decidirNoWhatsApp, pedidoDeCpfNoUltimoBalao: pedidoNoWhatsApp } =
			await import("./identify-capture");
		const pedidoDeCpf = pedidoNoWhatsApp({
			role: "assistant",
			content: "Seu CPF já está cadastrado.",
		});
		expect(pedidoDeCpf).toBe(false);
		expect(decidirNoWhatsApp("11900000083", { pedidoDeCpf })).toEqual({ outcome: "none" });
	});

	// P263 (rodada 5): a instrução de formato que vem depois do pedido não repete
	// a palavra "CPF"; lida sozinha, ela apagava o pedido de cima.
	it("pedido de CPF + instrução de formato continua pedido, e o número é CPF", async () => {
		const { decidirCpfDoTexto: decidirNoWhatsApp, pedidoDeCpfNoUltimoBalao: pedidoNoWhatsApp } =
			await import("./identify-capture");
		const pedidoDeCpf = pedidoNoWhatsApp({
			role: "assistant",
			content: "Qual é seu CPF? Envie só os números.",
		});
		expect(pedidoDeCpf).toBe(true);
		expect(decidirNoWhatsApp("11900000083", { pedidoDeCpf })).toEqual({
			outcome: "captured",
			cpf: "11900000083",
		});
	});
	// P188/P263 (rodada 6): pedido NEGADO. "Não preciso do seu CPF agora." abria o
	// contexto do CPF (o verbo `preciso` não olhava a negação), e o celular ambíguo
	// que o cliente mandava depois podia sobrescrever o CPF que já estava guardado.
	it("pedido de CPF negado: o celular ambíguo não vira CPF no WhatsApp", async () => {
		const { decidirCpfDoTexto: decidirNoWhatsApp, pedidoDeCpfNoUltimoBalao: pedidoNoWhatsApp } =
			await import("./identify-capture");
		const pedidoDeCpf = pedidoNoWhatsApp({
			role: "assistant",
			content: "Não preciso do seu CPF agora.",
		});
		expect(pedidoDeCpf).toBe(false);
		// CPF já guardado + celular ambíguo: a decisão é "não é CPF", então o CPF
		// anterior não é sobrescrito e o número segue como telefone.
		expect(decidirNoWhatsApp("11900000083", { pedidoDeCpf })).toEqual({ outcome: "none" });
		// Nem com a insistência: o balão que pede o CPF e depois o nega continua
		// negado.
		expect(
			decidirNoWhatsApp("11900000083", {
				pedidoDeCpf: pedidoNoWhatsApp({
					role: "assistant",
					content: "Qual é seu CPF? Não precisa do celular.",
				}),
			}),
		).toEqual({ outcome: "none" });
	});
});

describe("o celular do fechamento nunca é um número inventado", () => {
	it("conversa real: o celular é o número da conversa", async () => {
		const { celularDeFechamento } = await import("./identify-capture");
		const r = celularDeFechamento({
			waId: "5511987654321",
			cpf: "11144477735",
			celular: "11987654321",
		});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.origem).toBe("conversa");
	});

	it("simulador sem par de teste no ambiente: RECUSA, não manda hash pra Bevi", async () => {
		const { celularDeFechamento } = await import("./identify-capture");
		const r = celularDeFechamento({
			waId: "SIM-be27b2e8-3b1d-4702-92c1-87832589bfa9",
			cpf: "11144477735",
			celular: "62908872753",
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.motivo).toBe("falta-o-par-de-teste");
	});

	it("simulador com o par da casa: usa o PAR, não o hash", async () => {
		const { celularDeFechamento } = await import("./identify-capture");
		const vitrine = await import("@/lib/bevi/identidade-vitrine");
		const par = vitrine.identidadeDeVitrine();
		if (!par) {
			// Sem PII no ambiente de teste, a recusa é o comportamento esperado.
			const r = celularDeFechamento({
				waId: "SIM-abc",
				cpf: "11144477735",
				celular: "62908872753",
			});
			expect(r.ok).toBe(false);
			return;
		}
		const r = celularDeFechamento({ waId: "SIM-abc", cpf: par.cpf, celular: "62908872753" });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.origem).toBe("par-de-teste");
			expect(r.celular).toBe(par.celular);
			expect(r.celular).not.toBe("62908872753");
		}
	});
});
