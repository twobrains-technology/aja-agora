// A regra telefone × CPF é UMA só, em `src/lib/conversation/telefone-ou-cpf.ts`,
// importada pelo capturador do WhatsApp e pelo do Pi. O que se prova aqui é a
// decisão; a passagem completa entre os dois canais está em
// `src/lib/agent/pi/turno-c.test.ts`.
import { describe, expect, it, vi } from "vitest";

// O capturador do WhatsApp importa o banco no topo do módulo; aqui só interessa
// a decisão que ele delega (nenhuma leitura de banco é feita).
vi.mock("@/db", () => ({ db: {} }));

import {
	celularEhTelefone,
	dddValido,
	decidirCpfDoTexto,
	ehCelularBR,
	extractCpf,
	pedidoDeCpfNoUltimoBalao,
} from "./telefone-ou-cpf";

// Celular de São Paulo (DDD 11 + 9º dígito) que também passa no DV do CPF.
const AMBIGUO = "11900000083";
// CPF com DV válido que não tem cara de celular (começa em 02, que não é DDD).
const CPF = "52998224725";

describe("telefone × CPF — a mesma regra nos dois capturadores", () => {
	it("sem pedido de CPF, o número ambíguo é TELEFONE", () => {
		expect(decidirCpfDoTexto(AMBIGUO, { pedidoDeCpf: false })).toEqual({ outcome: "none" });
		expect(celularEhTelefone({ digitos: AMBIGUO, texto: AMBIGUO, pedidoDeCpf: false })).toBe(true);
	});

	it("logo depois do pedido de CPF, o mesmo número é lido como CPF", () => {
		expect(decidirCpfDoTexto(AMBIGUO, { pedidoDeCpf: true })).toEqual({
			outcome: "captured",
			cpf: AMBIGUO,
		});
		expect(celularEhTelefone({ digitos: AMBIGUO, texto: AMBIGUO, pedidoDeCpf: true })).toBe(false);
	});

	it("o cliente DECLARAR o dado vence a cara de celular, com ou sem pedido", () => {
		for (const pedidoDeCpf of [false, true]) {
			expect(decidirCpfDoTexto(`meu cpf é ${AMBIGUO}`, { pedidoDeCpf })).toEqual({
				outcome: "captured",
				cpf: AMBIGUO,
			});
		}
	});

	it("CPF que não tem cara de celular é CPF em qualquer contexto", () => {
		for (const pedidoDeCpf of [false, true]) {
			expect(decidirCpfDoTexto(CPF, { pedidoDeCpf })).toEqual({
				outcome: "captured",
				cpf: CPF,
			});
		}
	});

	it("número comprido que não fecha como CPF só é 'não confere' quando foi pedido", () => {
		// Sem pedido, pode ser telefone, valor, ano: quem responde é o modelo.
		expect(decidirCpfDoTexto("11987654321", { pedidoDeCpf: false }).outcome).toBe("none");
		expect(decidirCpfDoTexto("11987654321", { pedidoDeCpf: true }).outcome).toBe("invalid");
	});

	it("a palavra 'cpf' basta para declarar; telefone ditado segue telefone", () => {
		expect(decidirCpfDoTexto("meu celular é 11 98765-4321", { pedidoDeCpf: false }).outcome).toBe(
			"none",
		);
		expect(decidirCpfDoTexto("qual o valor? quero um de 80 mil", { pedidoDeCpf: false })).toEqual({
			outcome: "none",
		});
	});

	it("a negação do CPF não declara o número — ele continua TELEFONE", () => {
		// Achado 4 da pré-auditoria: o cliente RECUSA o CPF e dita o telefone na
		// mesma fala. A palavra "cpf" mora na oração anterior, negada, e não diz
		// nada sobre o número que vem depois dela.
		const negacao = "não tenho cpf, meu telefone é (11) 90000-0083";
		expect(celularEhTelefone({ digitos: AMBIGUO, texto: negacao, pedidoDeCpf: false })).toBe(true);
		// Nem logo depois do pedido de CPF: ele está recusando o dado, e o número
		// que ele deu é o telefone — lido como CPF, o telefone se perde e a
		// administradora recebe um CPF que não é dele.
		expect(celularEhTelefone({ digitos: AMBIGUO, texto: negacao, pedidoDeCpf: true })).toBe(true);
		for (const pedidoDeCpf of [false, true]) {
			expect(
				decidirCpfDoTexto("não tenho cpf, meu telefone é 11900000083", { pedidoDeCpf }),
			).toEqual({ outcome: "none" });
			// A negação conta mesmo sem a vírgula que separa as orações.
			expect(
				celularEhTelefone({ digitos: AMBIGUO, texto: `não tenho cpf ${AMBIGUO}`, pedidoDeCpf }),
			).toBe(true);
		}
	});

	it("a declaração de CPF vale LIGADA ao número, não no texto todo", () => {
		// A declaração colada no número vale nos dois contextos.
		for (const pedidoDeCpf of [false, true]) {
			expect(celularEhTelefone({ digitos: AMBIGUO, texto: `cpf: ${AMBIGUO}`, pedidoDeCpf })).toBe(
				false,
			);
			expect(decidirCpfDoTexto(`meu cpf é ${AMBIGUO}`, { pedidoDeCpf })).toEqual({
				outcome: "captured",
				cpf: AMBIGUO,
			});
		}
		// Duas identidades na MESMA fala: o "cpf" da primeira oração não declara o
		// número da segunda, que vem anunciado como telefone.
		const duas = `meu cpf é ${CPF}, meu telefone é ${AMBIGUO}`;
		expect(celularEhTelefone({ digitos: AMBIGUO, texto: duas, pedidoDeCpf: false })).toBe(true);
		expect(decidirCpfDoTexto(duas, { pedidoDeCpf: false })).toEqual({
			outcome: "captured",
			cpf: CPF,
		});
	});

	it("DDD entre parênteses não vira 'CPF inválido' para quem recusou o CPF", () => {
		// Pendência do bloco CCAP2: o ")" quebrava o candidato, o número não
		// existia como número e a fala caía em `looksLikeCpfAttempt` — quem tinha
		// recusado o CPF e ditado o celular ouvia "confere os números".
		const comParenteses = "não tenho CPF. meu celular é (11) 90000-0083";
		for (const pedidoDeCpf of [false, true]) {
			expect(decidirCpfDoTexto(comParenteses, { pedidoDeCpf })).toEqual({ outcome: "none" });
		}
		// A mesma fala sem os parênteses responde o mesmo: a pontuação é do
		// cliente, não do número.
		expect(
			decidirCpfDoTexto("não tenho CPF. meu celular é 11 90000-0083", { pedidoDeCpf: true }),
		).toEqual({ outcome: "none" });
		// Número sozinho depois do pedido é resposta ao pedido, com ou sem
		// parênteses: o desempate não depende de como ele foi digitado.
		expect(decidirCpfDoTexto("(11) 90000-0083", { pedidoDeCpf: true })).toEqual(
			decidirCpfDoTexto(AMBIGUO, { pedidoDeCpf: true }),
		);
		// O CPF declarado ANTES de um telefone entre parênteses continua sendo o
		// dado capturado: o parêntese não pode colar os dois números.
		expect(
			decidirCpfDoTexto(`meu cpf é 529.982.247-25 (11) 90000-0083`, { pedidoDeCpf: true }),
		).toEqual({ outcome: "captured", cpf: CPF });
		// E o CPF formatado declarado é lido com a pontuação que o cliente usa.
		expect(decidirCpfDoTexto("meu cpf é 529.982.247-25", { pedidoDeCpf: true })).toEqual({
			outcome: "captured",
			cpf: CPF,
		});
	});

	it("só o PEDIDO de CPF na última fala do agente abre o contexto", () => {
		expect(pedidoDeCpfNoUltimoBalao({ role: "assistant", content: "qual seu CPF?" })).toBe(true);
		expect(pedidoDeCpfNoUltimoBalao({ role: "assistant", content: "me manda seu CPF?" })).toBe(
			true,
		);
		expect(
			pedidoDeCpfNoUltimoBalao({ role: "assistant", content: "preciso do seu CPF para simular" }),
		).toBe(true);
		expect(pedidoDeCpfNoUltimoBalao({ role: "assistant", content: "qual valor você quer?" })).toBe(
			false,
		);
		// MENÇÃO não é PEDIDO: este balão fala do CPF que já recebeu e pede o
		// CELULAR. Lido como pedido de CPF, o celular ambíguo que o cliente dita em
		// resposta vira CPF — e o telefone dele se perde (P188).
		expect(
			pedidoDeCpfNoUltimoBalao({
				role: "assistant",
				content: "Já recebi seu CPF. Qual é seu celular?",
			}),
		).toBe(false);
		// O aviso de LGPD também fala do CPF sem pedir nada.
		expect(
			pedidoDeCpfNoUltimoBalao({
				role: "assistant",
				content:
					"Para gerar a sua proposta, a administradora consulta seu CPF nos birôs de crédito. Posso seguir?",
			}),
		).toBe(false);
		expect(pedidoDeCpfNoUltimoBalao({ role: "user", content: "qual seu CPF?" })).toBe(false);
		expect(pedidoDeCpfNoUltimoBalao(null)).toBe(false);
	});

	it("menção ao CPF + pedido de celular: o número ambíguo é TELEFONE no WhatsApp", async () => {
		// O capturador do WhatsApp (`src/lib/whatsapp/identify-capture.ts:226`) faz
		// exatamente estas duas chamadas: o pedido sai do ÚLTIMO balão do agente e é
		// ele que decide a leitura do número que o cliente mandou.
		const { decidirCpfDoTexto: decidirNoWhatsApp, pedidoDeCpfNoUltimoBalao: pedidoNoWhatsApp } =
			await import("@/lib/whatsapp/identify-capture");

		const pedidoDeCpf = pedidoNoWhatsApp({
			role: "assistant",
			content: "Já recebi seu CPF. Qual é seu celular?",
		});
		expect(pedidoDeCpf).toBe(false);
		expect(decidirNoWhatsApp(AMBIGUO, { pedidoDeCpf })).toEqual({ outcome: "none" });
		expect(celularEhTelefone({ digitos: AMBIGUO, texto: AMBIGUO, pedidoDeCpf })).toBe(true);

		// O pedido de verdade continua abrindo o contexto, pelo mesmo caminho.
		const pedidoDeVerdade = pedidoNoWhatsApp({ role: "assistant", content: "qual seu CPF?" });
		expect(decidirNoWhatsApp(AMBIGUO, { pedidoDeCpf: pedidoDeVerdade })).toEqual({
			outcome: "captured",
			cpf: AMBIGUO,
		});
	});

	// P188: a constatação cadastral ISOLADA — sem nenhum pedido depois dela para
	// mascarar o falso positivo — fazia o celular ambíguo ser gravado como
	// identidade no WhatsApp.
	it("confirmação cadastral isolada deixa o número ambíguo como TELEFONE no WhatsApp", async () => {
		const { decidirCpfDoTexto: decidirNoWhatsApp, pedidoDeCpfNoUltimoBalao: pedidoNoWhatsApp } =
			await import("@/lib/whatsapp/identify-capture");

		for (const fala of ["Seu CPF já está cadastrado.", "Já recebi seu CPF."]) {
			const pedidoDeCpf = pedidoNoWhatsApp({ role: "assistant", content: fala });
			expect(pedidoDeCpf).toBe(false);
			expect(decidirNoWhatsApp(AMBIGUO, { pedidoDeCpf })).toEqual({ outcome: "none" });
		}
	});

	// P263: pedido do dado seguido de instrução de formato não repetia a palavra
	// "CPF" na última oração e o pedido inteiro se perdia — o CPF que o cliente
	// mandava virava telefone.
	it("pedido de CPF seguido de instrução de formato continua pedido no WhatsApp", async () => {
		const { decidirCpfDoTexto: decidirNoWhatsApp, pedidoDeCpfNoUltimoBalao: pedidoNoWhatsApp } =
			await import("@/lib/whatsapp/identify-capture");

		const pedidoDeCpf = pedidoNoWhatsApp({
			role: "assistant",
			content: "Qual é seu CPF? Envie só os números.",
		});
		expect(pedidoDeCpf).toBe(true);
		expect(decidirNoWhatsApp(AMBIGUO, { pedidoDeCpf })).toEqual({
			outcome: "captured",
			cpf: AMBIGUO,
		});
	});

	// P188/P263 (rodada 6): o pedido NEGADO. "Não preciso do seu CPF agora."
	// casava o verbo `preciso` e abria o contexto do CPF; o celular ambíguo que o
	// cliente ditava depois virava identidade, e o telefone dele se perdia.
	it("pedido de CPF negado não abre o contexto: o número ambíguo é TELEFONE", async () => {
		const { decidirCpfDoTexto: decidirNoWhatsApp, pedidoDeCpfNoUltimoBalao: pedidoNoWhatsApp } =
			await import("@/lib/whatsapp/identify-capture");

		for (const fala of [
			"Não preciso do seu CPF agora.",
			"Ainda não preciso do CPF.",
			"Sem o CPF eu não sigo com a simulação.",
			"Me passa o CPF mais tarde.",
		]) {
			const pedidoDeCpf = pedidoNoWhatsApp({ role: "assistant", content: fala });
			expect(pedidoDeCpf).toBe(false);
			expect(decidirNoWhatsApp(AMBIGUO, { pedidoDeCpf })).toEqual({ outcome: "none" });
			// E a declaração do cliente continua vencendo tudo (regra (a) da main).
			expect(decidirNoWhatsApp(`meu cpf é ${AMBIGUO}`, { pedidoDeCpf })).toEqual({
				outcome: "captured",
				cpf: AMBIGUO,
			});
		}
	});

	it("exibição e DDD: lista fechada da Anatel, 11 dígitos + 9º dígito", () => {
		expect(dddValido("11")).toBe(true);
		expect(dddValido("28")).toBe(true);
		expect(dddValido("26")).toBe(false);
		expect(ehCelularBR(AMBIGUO)).toBe(true);
		expect(ehCelularBR(CPF)).toBe(false);
		expect(extractCpf(`meu cpf é ${CPF}`)).toBe(CPF);
	});
});

// P188/P263: pedir o CPF é um ATO do balão do agente, não a menção ao dado.
//
// A tabela é ADVERSARIAL de propósito: cada rodada da auditoria (3, 4 e 5)
// trouxe um contraexemplo novo de heurística que refinava a leitura da oração
// anterior — a menção explicativa com `como` (rodada 4), o prefixo `cadastra`
// de "cadastrado" e a instrução de formato que apagava o pedido da frase de cima
// (rodada 5). Aqui o lado PERIGOSO é o celular ambíguo gravado como CPF; o lado
// seguro é "não houve pedido", e todo empate cai para ele. Por isso os casos
// seguros são "não captura" — e o detector só responde `true` quando o balão
// fala do CPF, PEDE alguma coisa e não pede outro dado nem constata que o CPF já
// existe.
describe("o pedido de CPF é o ATO do balão, não a menção ao dado", () => {
	const casos: { fala: string; pede: boolean; porque: string }[] = [
		// ── pedidos de verdade: a ÚLTIMA oração que pede algo pede o CPF ──────
		{ fala: "Qual é o seu CPF?", pede: true, porque: "pergunta pelo dado" },
		{ fala: "qual seu cpf?", pede: true, porque: "pergunta pelo dado, minúscula" },
		{ fala: "CPF?", pede: true, porque: "o dado sozinho, interrogativo" },
		{ fala: "CPF? 🙂", pede: true, porque: "o dado sozinho, com emoji" },
		{ fala: "me passa seu CPF", pede: true, porque: "imperativo de pedido" },
		{ fala: "Me manda o CPF aí, por favor", pede: true, porque: "imperativo + cortesia" },
		{ fala: "pode informar o CPF, por favor?", pede: true, porque: "pedido cortês" },
		{ fala: "consegue me passar o CPF?", pede: true, porque: "modal + verbo de pedido" },
		{ fala: "Agora preciso do seu CPF.", pede: true, porque: "precisar + dado" },
		{
			fala: "preciso do seu CPF para simular a proposta",
			pede: true,
			porque: "precisar + dado, sem pontuação",
		},
		{ fala: "SEU CPF, POR FAVOR", pede: true, porque: "caixa alta, sem pergunta" },
		{ fala: "Me diz seu CPF!", pede: true, porque: "exclamação, sem interrogação" },
		{ fala: "Qual o CPF do titular?", pede: true, porque: "pergunta pelo dado de quem responde" },
		{ fala: "Informe o CPF: é rapidinho", pede: true, porque: "imperativo antes dos dois-pontos" },
		{
			fala: "Me passa o CPF - prometo que é seguro",
			pede: true,
			porque: "travessão depois do pedido",
		},
		// ── menção, explicação, confirmação: NÃO são pedido ───────────────────
		{
			fala: "Já recebi seu CPF. Qual é seu celular?",
			pede: false,
			porque: "confirmação + pedido de CELULAR",
		},
		{
			fala: "Já expliquei como funciona a consulta do CPF. Qual é seu celular?",
			pede: false,
			porque: "explicação com 'como' + pedido de CELULAR (achado da rodada 4)",
		},
		{
			fala: "Seu CPF fica protegido. Me passa seu WhatsApp?",
			pede: false,
			porque: "promessa de sigilo + pedido de WHATSAPP",
		},
		{
			fala: "Já recebi seu CPF: qual é seu celular?",
			pede: false,
			porque: "a mesma confirmação separada por dois-pontos",
		},
		{
			fala: "JÁ RECEBI SEU CPF. QUAL É SEU CELULAR?",
			pede: false,
			porque: "a mesma frase em caixa alta",
		},
		{
			fala: "O CPF serve para a administradora consultar seu histórico. Me manda seu telefone?",
			pede: false,
			porque: "para que serve o CPF + pedido de TELEFONE",
		},
		{
			fala: "Para consultar o seu CPF a gente usa um birô de crédito. Pode me passar seu celular?",
			pede: false,
			porque: "explicação da consulta + pedido de CELULAR",
		},
		{
			fala: "Seu CPF já está cadastrado! Me passa seu zap?",
			pede: false,
			porque: "dado já recebido + pedido de ZAP",
		},
		{
			fala: "O CPF que você mandou está certo. Agora me informa seu celular.",
			pede: false,
			porque: "confirmação do dado + pedido de CELULAR no imperativo",
		},
		{
			fala: "Qual seu celular? Já tenho seu CPF.",
			pede: false,
			porque: "ordem invertida: o pedido de CELULAR vem primeiro",
		},
		{
			fala: "Já expliquei que o CPF é usado na análise — me passa seu WhatsApp?",
			pede: false,
			porque: "explicação emendada por travessão + pedido de WHATSAPP",
		},
		{
			fala: "Seu CPF está protegido, mas me passa seu celular?",
			pede: false,
			porque: "adversativa: o pedido depois do 'mas' é o que vale",
		},
		{
			fala: "Tudo certo com o CPF! Agora me confirma seu celular.",
			pede: false,
			porque: "confirmação + pedido de CELULAR com 'agora'",
		},
		{
			fala: "Não preciso do seu CPF agora. Qual seu celular?",
			pede: false,
			porque: "negação do pedido + pergunta pelo CELULAR",
		},
		{
			fala: "Sem CPF não consigo simular. Qual é o seu nome completo?",
			pede: false,
			porque: "consequência + pedido de NOME",
		},
		{
			fala: "CPF é dado sensível. Como podemos continuar?",
			pede: false,
			porque: "comentário + pergunta que não pede dado nenhum",
		},
		{
			fala: "Como funciona a consulta do CPF? Me conta.",
			pede: false,
			porque: "o 'como' é da explicação, não do pedido",
		},
		{
			fala: "O CPF fica guardado, tá? Me passa seu telefone.",
			pede: false,
			porque: "pergunta retórica sobre o CPF + pedido de TELEFONE",
		},
		// Quando o agente pede os DOIS dados na mesma oração, o número que chega
		// sozinho é lido como TELEFONE: é o lado que não inventa dado nenhum — o
		// telefone fica guardado e o CPF continua faltando, para ser pedido de
		// novo. O contrário gravaria um CPF que não é dele e apagaria o telefone.
		{
			fala: "Qual o CPF e o celular?",
			pede: false,
			porque: "pedido composto: o balão também pede o CELULAR",
		},
		// ── rodada 5: a constatação ISOLADA e a instrução de formato ─────────
		// P188: sem nenhum pedido posterior para mascarar o falso positivo, o
		// prefixo `cadastra` de "cadastrado" virava pedido de CPF.
		{
			fala: "Seu CPF já está cadastrado.",
			pede: false,
			porque: "constatação ISOLADA de que o CPF já existe (P188)",
		},
		{
			fala: "Já recebi seu CPF.",
			pede: false,
			porque: "a mesma constatação, sem palavra nenhuma de pedido",
		},
		{
			fala: "Seu CPF já está cadastrado! Envie só os números.",
			pede: false,
			porque: "a instrução de formato não transforma a constatação em pedido",
		},
		// P263: a instrução de COMO mandar o dado não apaga o pedido da frase
		// anterior — mas só quando o balão de fato pede o CPF.
		{
			fala: "Qual é seu CPF? Envie só os números.",
			pede: true,
			porque: "pedido do dado + instrução de formato (P263)",
		},
		// Rodada 6: a trava geral vale para o BALÃO INTEIRO, e a negação `sem`
		// derruba o pedido mesmo quando ela não nega o dado ("sem pontos" é o
		// formato). O lado seguro custa um turno: o modelo pede o CPF de novo.
		{
			fala: "me passa o CPF, por favor. pode digitar sem pontos",
			pede: false,
			porque: "negação no balão inteiro derruba o pedido",
		},
		// ── mais dez, cada um atacando uma palavra-chave diferente ───────────
		{
			fala: "Pode digitar o CPF, por favor.",
			pede: true,
			porque: "verbo de pedido no infinitivo, com cortesia",
		},
		{
			fala: "Preciso do CPF para consultar o birô.",
			pede: true,
			porque: "precisar do dado, sem pergunta",
		},
		{
			fala: "Qual o CPF do titular? Pode digitar.",
			pede: true,
			porque: "pergunta pelo dado + instrução depois",
		},
		{
			fala: "Envie o CPF e o comprovante.",
			pede: true,
			porque: "imperativo que pede o dado e outra coisa junto",
		},
		{
			fala: "CPF anotado! Agora me passa o celular.",
			pede: false,
			porque: "constatação do dado + pedido de CELULAR",
		},
		{
			fala: "Já tenho seu CPF aqui.",
			pede: false,
			porque: "já tem o dado, sem pedir nada",
		},
		{
			fala: "O CPF que você mandou está confirmado.",
			pede: false,
			porque: "confirmação do dado recebido",
		},
		{
			fala: "O CPF é uma informação sigilosa.",
			pede: false,
			porque: "'informação' não é o verbo 'informa' — o limite de palavra enxerga o acento",
		},
		{
			fala: "CPF e nome completo, por favor.",
			pede: false,
			porque: "o balão pede outro dado (NOME): o número sozinho é telefone",
		},
		{
			fala: "O CPF é uma informação sensível. Qual seu e-mail?",
			pede: false,
			porque: "explicação do dado + pedido de E-MAIL",
		},
		// ── rodada 6: o PEDIDO NEGADO (P188/P263) ─────────────────────────────
		// A regressão de `9a5947dd`: `preciso` casava o verbo de pedido sem
		// olhar a negação da frase, e "não preciso do seu CPF" abria o
		// contexto do CPF. O celular ambíguo que o cliente ditava em seguida
		// era gravado como identidade.
		{
			fala: "Não preciso do seu CPF agora.",
			pede: false,
			porque: "pedido NEGADO não é pedido (P188/P263, rodada 6)",
		},
		{
			fala: "Não preciso do seu CPF agora. Me passa seu celular?",
			pede: false,
			porque: "pedido negado + pedido de CELULAR",
		},
		{
			fala: "Ainda não preciso do CPF.",
			pede: false,
			porque: "a negação vem antes do verbo de pedido",
		},
		{
			fala: "Não estou pedindo seu CPF ainda.",
			pede: false,
			porque: "'não estou pedindo' também nega o ato",
		},
		{
			fala: "Nem preciso do CPF para simular.",
			pede: false,
			porque: "negação com 'nem'",
		},
		// ── mais dez, cada um atacando uma trava ou o ato de pedido ───────────
		{
			fala: "Qual é seu CPF? Depois a gente acerta os detalhes.",
			pede: false,
			porque: "adiamento ('depois') no balão inteiro",
		},
		{
			fala: "Me passa o CPF mais tarde.",
			pede: false,
			porque: "adiamento explícito ('mais tarde')",
		},
		{
			fala: "Deixa o CPF pra depois.",
			pede: false,
			porque: "adiamento ('pra depois')",
		},
		{
			fala: "Sem o CPF eu não sigo com a simulação.",
			pede: false,
			porque: "'sem' + 'não': o balão explica a falta, não pede o dado",
		},
		{
			fala: "Qual o CPF? Não precisa do celular.",
			pede: false,
			porque: "a negação derruba o balão mesmo com o '?' na frase do dado",
		},
		{
			fala: "Seu CPF foi anotado, obrigado.",
			pede: false,
			porque: "constatação com 'anotado'",
		},
		{
			fala: "Você pode ficar tranquilo, seu CPF fica protegido.",
			pede: false,
			porque: "'pode' modal sozinho não é verbo de pedido",
		},
		{
			fala: "O CPF do titular é necessário para a análise. Consegue seguir?",
			pede: false,
			porque: "o ato de pedido tem de estar na frase DO DADO, não na vizinha",
		},
		{
			fala: "CPF é só para a consulta ao birô, tá bom?",
			pede: false,
			porque: "pergunta que não busca o valor do dado",
		},
		{
			fala: "Nunca pedi seu CPF, fica tranquilo.",
			pede: false,
			porque: "negação com 'nunca'",
		},
		// ── e o pedido de verdade continua abrindo o contexto ─────────────────
		{
			fala: "Preciso do CPF do titular, por favor.",
			pede: true,
			porque: "verbo de pedido na frase do dado",
		},
		{
			fala: "Qual é o CPF? Digita aí.",
			pede: true,
			porque: "o '?' com 'qual' na frase do dado",
		},
		{
			fala: "Me envia o CPF que está no seu documento.",
			pede: true,
			porque: "imperativo + complemento qualquer",
		},
		{
			fala: "Cadê o CPF?",
			pede: true,
			porque: "'cadê' pergunta pelo valor do dado",
		},
		{
			fala: "CPF, por favor.",
			pede: true,
			porque: "o dado sozinho com cortesia",
		},
	];

	it.each(casos)("$porque", ({ fala, pede }) => {
		expect(pedidoDeCpfNoUltimoBalao({ role: "assistant", content: fala })).toBe(pede);
	});
});
