import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	AVISO_LGPD,
	clienteAceitouLgpd,
	garanteAvisoLgpd,
	PEDE_DADO_RE,
	resolverAceiteLgpd,
} from "./lgpd";
import { montarTrechoDeSaida } from "./turno-livre";

const AVISO =
	"Para gerar a sua proposta, a administradora consulta seu CPF nos birôs de crédito e usa seus dados só para isso, conforme a LGPD. Posso seguir?";

describe("o aceite da LGPD é conferido na conversa, não na última fala", () => {
	it("o caso medido (92dfa1ba): aviso dado antes, no meio o agente pediu o celular", () => {
		const falas = [
			{ role: "assistant" as const, content: AVISO },
			{ role: "user" as const, content: "pode usar, CPF 111.444.777-35" },
			// A última fala do agente NÃO tem o aviso — era isto que fazia a tool recusar.
			{ role: "assistant" as const, content: "Guardado. Qual é o seu celular com DDD?" },
			{ role: "user" as const, content: "11 98765-4321" },
		];
		const r = resolverAceiteLgpd({ falas });
		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("aceite-do-cliente");
	});

	it("aviso dado no MESMO turno é visto, mas sem o sim do cliente ainda não é aceite", () => {
		const r = resolverAceiteLgpd({
			falas: [{ role: "user", content: "quero seguir" }],
			textoDoTurno: `${AVISO} Posso gerar?`,
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("falta-o-aceite");
	});

	it("o sim do cliente neste turno fecha o aceite", () => {
		const r = resolverAceiteLgpd({
			falas: [{ role: "assistant", content: AVISO }],
			falaDoCliente: "pode usar",
		});
		expect(r.ok).toBe(true);
	});

	it("aceite já registrado vale uma vez e não pede aviso de novo", () => {
		const r = resolverAceiteLgpd({
			falas: [],
			aceiteJaGravado: { em: "2026-10-25T00:00:00Z", fala: "sim" },
		});
		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("aceite-ja-registrado");
	});

	it("sem aviso dado é aviso pendente, não aceite", () => {
		const r = resolverAceiteLgpd({
			falas: [{ role: "user", content: "sim" }],
			falaDoCliente: "sim",
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("aviso-nao-dado");
	});

	it("negativa não é aceite", () => {
		expect(clienteAceitouLgpd("não pode")).toBe(false);
		expect(clienteAceitouLgpd("pode usar")).toBe(true);
		expect(clienteAceitouLgpd("sim, pode")).toBe(true);
	});
});

describe("o aviso vem antes do pedido de dado — decidido no harness, não no prompt", () => {
	it("fala que pede CPF sem aviso: o aviso ocupa a mensagem e o pedido fica pro aceite", () => {
		const r = garanteAvisoLgpd({
			texto: "Você escolheu a Canopus. Me passa seu CPF pra eu gerar a proposta.",
			avisoJaDado: false,
		});
		expect(r.avisoAdicionado).toBe(true);
		expect(r.pedidoAdiado).toBe(true);
		expect(r.texto).toContain("conforme a LGPD. Posso seguir?");
		// O acolhimento não se joga fora; o que se adia é o PEDIDO, até haver sim.
		expect(r.texto).toContain("Você escolheu a Canopus.");
		expect(r.texto.indexOf("LGPD")).toBeLessThan(r.texto.length);
	});

	it("aviso já dado na conversa: nada se repete", () => {
		const r = garanteAvisoLgpd({ texto: "Me passa seu CPF?", avisoJaDado: true });
		expect(r.avisoAdicionado).toBe(false);
		expect(r.texto).toBe("Me passa seu CPF?");
	});

	it("fala que não pede dado não é tocada", () => {
		const r = garanteAvisoLgpd({
			texto: "Qual prazo te serve, 48 ou 80 meses?",
			avisoJaDado: false,
		});
		expect(r.avisoAdicionado).toBe(false);
	});

	it("o aviso não é cortado pelo verificador de uma pergunta por mensagem", () => {
		const r = montarTrechoDeSaida({
			texto: "Você escolheu a Canopus. Me passa seu CPF, por favor, conforme a LGPD. Posso seguir?",
			avisoDado: false,
		});
		expect(r.texto.startsWith("Para gerar a sua proposta")).toBe(true);
		expect(r.texto).toContain("Você escolheu a Canopus");
		// Uma pergunta por mensagem: a pergunta do balão é a do aviso.
		expect((r.texto.match(/\?/g) ?? []).length).toBe(1);
	});

	it("o trecho que sai no balão aplica o aviso antes do pedido de dado", () => {
		const r = montarTrechoDeSaida({
			texto: "Legal! Me passa seu CPF pra eu gerar a proposta.",
			avisoDado: false,
		});
		expect(r.avisoAplicado).toBe(true);
		expect(r.texto).toContain("conforme a LGPD. Posso seguir?");
		// Com o aviso já dado na conversa, o mesmo trecho sai como o modelo escreveu.
		const depois = montarTrechoDeSaida({ texto: "Me passa seu CPF?", avisoDado: true });
		expect(depois.avisoAplicado).toBe(false);
		expect(depois.texto).toBe("Me passa seu CPF?");
	});

	// O turno não pode deixar de aplicar a guarda: se `soltarTrecho` voltar a só
	// mascarar CPF e contar pergunta, o aviso depende outra vez da boa vontade do modelo.
	it("o turno aplica a guarda em cada trecho que sai no balão", () => {
		const fonte = readFileSync(new URL("./turno-livre.ts", import.meta.url).pathname, "utf8");
		const corpo = fonte.slice(fonte.indexOf("const soltarTrecho"), fonte.indexOf("const executar"));
		expect(corpo).toMatch(/montarTrechoDeSaida\(\{[^}]*texto:\s*pendente[^}]*avisoDado/);
		expect(corpo).not.toContain("manterUmaPergunta(scrubCpf(");
		expect(fonte).toMatch(/avisoDado = historico\.some/);
	});

	it("o aviso canônico do harness é o mesmo da skill", () => {
		const skill = readFileSync(
			new URL("./skills/proposta-com-dados-do-cliente/SKILL.md", import.meta.url).pathname,
			"utf8",
		);
		const norm = (t: string) => t.replace(/\s+/g, " ").trim();
		expect(norm(skill)).toContain(norm(AVISO_LGPD));
	});
});

describe("L32/N04 — só é pedido de dado quando há ato de pedir", () => {
	it("mencionar o canal ou o cadastro não é pedir dado", () => {
		for (const fala of [
			"Atendemos pelo WhatsApp, de segunda a sexta.",
			"Seu celular cadastrado recebe o contrato por WhatsApp.",
			"O telefone da administradora aparece no contrato.",
			"O contrato informa o telefone da administradora.",
		]) {
			expect(PEDE_DADO_RE.test(fala), fala).toBe(false);
			const r = garanteAvisoLgpd({ texto: fala, avisoJaDado: false });
			expect(r.avisoAdicionado, fala).toBe(false);
			expect(r.texto, fala).toBe(fala);
		}
	});

	it("o pedido de dado de verdade continua sendo pedido", () => {
		for (const fala of [
			"Me passa seu CPF pra eu gerar a proposta.",
			"Qual é o seu celular com DDD?",
			"Preciso do seu CPF para simular.",
			"Envie o número do seu WhatsApp, por favor.",
			"Pode me passar seu CPF?",
		]) {
			expect(PEDE_DADO_RE.test(fala), fala).toBe(true);
		}
	});

	it("o balão não troca a fala sobre o canal por um aviso de consentimento", () => {
		const r = montarTrechoDeSaida({
			texto:
				"Atendemos pelo WhatsApp, de segunda a sexta. Seu celular cadastrado recebe o contrato por lá.",
			avisoDado: false,
		});
		expect(r.avisoAplicado).toBe(false);
		expect(r.texto).not.toContain("conforme a LGPD");
	});
});

describe("L08 — pergunta e recusa não viram aceite; aviso novo não apaga aceite dado", () => {
	it("pergunta sobre a LGPD ou sobre o dado não é aceite", () => {
		expect(clienteAceitouLgpd("o que é LGPD?")).toBe(false);
		expect(clienteAceitouLgpd("pra que vocês querem meu CPF?")).toBe(false);
		expect(clienteAceitouLgpd("posso saber pra que vocês usam meu CPF?")).toBe(false);
		expect(clienteAceitouLgpd("pode explicar melhor?")).toBe(false);
	});

	it("recusa não é aceite", () => {
		expect(clienteAceitouLgpd("não")).toBe(false);
		expect(clienteAceitouLgpd("não aceito")).toBe(false);
		expect(clienteAceitouLgpd("prefiro não")).toBe(false);
		expect(clienteAceitouLgpd("não, obrigado")).toBe(false);
	});

	it("afirmação de verdade continua sendo aceite", () => {
		expect(clienteAceitouLgpd("sim, pode usar")).toBe(true);
		expect(clienteAceitouLgpd("Pode usar. E qual é o prazo?")).toBe(true);
	});

	it("a pergunta do cliente depois do aviso não fecha o aceite", () => {
		const r = resolverAceiteLgpd({
			falas: [{ role: "assistant", content: AVISO }],
			falaDoCliente: "pode explicar o que vocês fazem com meu CPF?",
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("falta-o-aceite");
	});

	it("um aviso novo no turno não apaga o sim já dado", () => {
		const r = resolverAceiteLgpd({
			falas: [
				{ role: "assistant", content: AVISO },
				{ role: "user", content: "sim, pode usar" },
			],
			textoDoTurno: `${AVISO} Só confirmando: posso seguir?`,
		});
		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("aceite-do-cliente");
	});
});

// P262 da re-auditoria: na main a recusa tem prioridade sobre o aceite
// (`src/lib/whatsapp/contract-capture.ts:87`). Aqui o consentimento é resolvido na
// ORDEM da conversa, e uma recusa posterior revoga o sim anterior.
describe("P262 — o consentimento é cronológico: recusa posterior revoga o sim", () => {
	const aviso = { role: "assistant" as const, content: AVISO };

	it("aviso → sim → não autorizo: sem autorização", () => {
		const r = resolverAceiteLgpd({
			falas: [aviso, { role: "user", content: "sim, pode usar" }],
			falaDoCliente: "não autorizo",
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("aceite-revogado");
	});

	it("aviso → sim → não autorizo, tudo no histórico: sem autorização", () => {
		const r = resolverAceiteLgpd({
			falas: [
				aviso,
				{ role: "user", content: "sim, pode usar" },
				{ role: "assistant", content: "Qual prazo te serve, 48 ou 80 meses?" },
				{ role: "user", content: "não autorizo" },
			],
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("aceite-revogado");
	});

	it("aviso → não autorizo → sim: o cliente voltou atrás e autorizou", () => {
		const r = resolverAceiteLgpd({
			falas: [aviso, { role: "user", content: "não autorizo" }],
			falaDoCliente: "pode usar meus dados",
		});
		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("aceite-do-cliente");
	});

	it("revogação depois de novo sim: o sim mais recente vale outra vez", () => {
		const r = resolverAceiteLgpd({
			falas: [
				aviso,
				{ role: "user", content: "sim, pode usar" },
				{ role: "user", content: "não autorizo mais" },
				{ role: "user", content: "pensando bem, pode usar" },
			],
		});
		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("aceite-do-cliente");
	});

	it("o aceite GRAVADO também é revogado por uma recusa posterior", () => {
		const r = resolverAceiteLgpd({
			falas: [aviso, { role: "user", content: "sim" }, { role: "user", content: "não autorizo" }],
			aceiteJaGravado: { em: "2026-10-25T00:00:00Z", fala: "sim" },
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("aceite-revogado");
	});

	it("o aceite gravado continua valendo quando ninguém revogou", () => {
		const r = resolverAceiteLgpd({
			falas: [aviso, { role: "user", content: "sim" }, { role: "user", content: "48 meses" }],
			aceiteJaGravado: { em: "2026-10-25T00:00:00Z", fala: "sim" },
		});
		expect(r.ok).toBe(true);
	});

	// Revogar é falar da AUTORIZAÇÃO. Recusar um detalhe da oferta depois do sim não
	// pode travar a proposta — senão toda negociação de prazo revogaria o consentimento.
	it("recusar um detalhe da oferta depois do sim não revoga o consentimento", () => {
		for (const fala of [
			"não aceito o prazo de 80 meses, prefiro 48",
			"não quero mais essa carta, me mostra outra",
			"não quero a parcela de 900",
		]) {
			const r = resolverAceiteLgpd({
				falas: [aviso, { role: "user", content: "sim, pode usar" }],
				falaDoCliente: fala,
			});
			expect(r.motivo, fala).toBe("aceite-do-cliente");
		}
	});

	// A recusa da OFERTA é uma oração; a revogação da AUTORIZAÇÃO pode ser outra, na
	// mesma frase. Recusar o prazo não pode apagar o "não autorizo" que vem ao lado.
	it("a recusa da oferta não neutraliza a revogação da outra oração da mesma frase", () => {
		for (const fala of [
			"Não aceito o prazo, não autorizo consultar meu CPF.",
			"Não aceito o prazo e não autorizo consultar meu CPF.",
			"Não aceito a parcela, mas não quero mais que vocês consultem meu CPF.",
		]) {
			const r = resolverAceiteLgpd({
				falas: [aviso, { role: "user", content: "sim, pode usar" }],
				falaDoCliente: fala,
			});
			expect(r.ok, fala).toBe(false);
			expect(r.motivo, fala).toBe("aceite-revogado");
		}
	});

	it("a recusa da oferta sozinha continua sem revogar o consentimento", () => {
		const r = resolverAceiteLgpd({
			falas: [aviso, { role: "user", content: "sim, pode usar" }],
			falaDoCliente: "Não aceito o prazo.",
		});
		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("aceite-do-cliente");
	});

	it("perguntar sobre a revogação não é revogar", () => {
		const r = resolverAceiteLgpd({
			falas: [aviso, { role: "user", content: "sim, pode usar" }],
			falaDoCliente: "posso revogar isso depois?",
		});
		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("aceite-do-cliente");
	});

	it("recusa antes de qualquer sim é falta de aceite, não revogação", () => {
		const r = resolverAceiteLgpd({
			falas: [aviso, { role: "user", content: "não autorizo" }],
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("falta-o-aceite");
	});
});

// P262, re-auditoria 310e rodadas 3, 4 e 5: cada heurística consertada criava um
// contraexemplo novo. A saída é o princípio da main (`isQuestion` em
// `src/lib/whatsapp/contract-capture.ts`, a2bc3024): conservador nos DOIS sentidos, e
// na dúvida quem responde é o modelo.
//
// Lado PERIGOSO: aceite falso — libera a consulta de bureau no CPF de quem só fez uma
// pergunta. Lado seguro: revogação, que derruba o consentimento mesmo ao lado de uma
// pergunta. Quando a fala não é nem uma coisa nem outra (`nada`), a regra preferiu NÃO
// capturar: o modelo pergunta de novo e o cliente responde "sim" no turno seguinte.
describe("P262 — na dúvida não se captura: aceite é conservador, revogação é o lado seguro", () => {
	const aviso = { role: "assistant" as const, content: AVISO };
	const aceite = { role: "user" as const, content: "sim, pode usar" };

	/** `aceita` = fecha o aceite sozinha; `revoga` = derruba um aceite anterior;
	 * `nada` = nem aceita nem revoga. */
	type Direcao = "aceita" | "revoga" | "nada";

	const TABELA: Array<[string, Direcao]> = [
		// ——— rodada 5: a pergunta coordenada que virava aceite pelo "podem" ———
		["Vocês podem consultar meu CPF e vender meus dados?", "nada"],
		// ——— rodada 4: a revogação ao lado da pergunta (não pode ser descartada) ———
		["Não autorizo consultar meu CPF, podemos seguir sem isso?", "revoga"],
		["Não autorizo consultar meu CPF. Podemos seguir sem isso?", "revoga"],
		["Não autorizo consultar meu CPF: podemos seguir sem isso?", "revoga"],
		["Não autorizo consultar meu CPF! Podemos seguir sem isso?", "revoga"],
		["Não autorizo consultar meu CPF, podemos seguir sem isso", "revoga"],
		["NÃO AUTORIZO CONSULTAR MEU CPF, PODEMOS SEGUIR SEM ISSO?", "revoga"],
		["não autorizo consultar meu cpf podemos seguir sem isso?", "revoga"],
		["não autorizo consultar meu CPF 😠 podemos seguir sem isso?", "revoga"],
		["😠 não autorizo consultar meu CPF, podemos seguir sem isso?", "revoga"],
		// ——— rodada 3: a recusa da oferta ao lado da revogação ———
		["Não aceito o prazo, não autorizo consultar meu CPF.", "revoga"],
		["Não aceito o prazo e não autorizo consultar meu CPF.", "revoga"],
		["Não aceito a parcela, mas não quero mais que vocês consultem meu CPF.", "revoga"],
		// ... e a recusa da oferta SOZINHA não revoga (senão toda negociação trava).
		["Não aceito o prazo.", "nada"],
		["Não aceito o prazo de 80 meses, prefiro 48. Podemos seguir?", "nada"],
		// ——— revogação escrita com outras palavras ———
		["Não quero mais que vocês consultem meu CPF, tá bom?", "revoga"],
		["Não vou autorizar a consulta do meu CPF, podemos seguir sem isso?", "revoga"],
		["Revogo a autorização, e aí posso falar com um atendente?", "revoga"],
		["Não autorizo o uso dos meus dados, mas pode me explicar como funciona?", "revoga"],
		["Não autorizo a consulta do meu CPF", "revoga"],
		["Não autorizo. Pode explicar por quê?", "revoga"],
		["Podemos seguir sem consultar meu CPF? Não autorizo.", "revoga"],
		// ——— dúvida e hipótese NÃO revogam ———
		["posso revogar isso depois?", "nada"],
		["Não entendi, pode explicar de novo?", "nada"],
		["E se eu não autorizar a consulta, dá pra seguir mesmo assim?", "nada"],
		["Vocês consultam meu CPF sem minha autorização?", "nada"],
		["Quero entender como vocês usam meu CPF", "nada"],
		["o que posso fazer com meu CPF", "nada"],
		["Tem como eu revogar isso depois", "nada"],
		["Sim, mas antes quero saber quanto fica a parcela", "nada"],
		["Deixa eu pensar, te falo depois", "nada"],
		["Não, obrigado", "nada"],
		// ——— aceite de verdade, e as formas de perguntar sem "?" ———
		["pode usar", "aceita"],
		["sim, pode usar", "aceita"],
		["sim, podem usar", "aceita"],
		["Pode usar. E qual é o prazo?", "aceita"],
		["Pode consultar meu CPF e usar meus dados para a proposta.", "aceita"],
		// A pergunta na MESMA frase (sem ponto entre as duas) não se separa: a fala
		// inteira pergunta, então não se captura. Com o ponto, a primeira frase é
		// declaração e vale.
		["Pode usar meus dados, obrigado 😊 Qual é o prazo?", "nada"],
		["Pode usar meus dados, obrigado 😊. Qual é o prazo?", "aceita"],
		["Ok, autorizo — qual o prazo?", "nada"],
		["não tem problema, pode usar", "aceita"],
		["claro, pode", "aceita"],
		["sim: pode usar, obrigado", "aceita"],
		["Vocês podem consultar meu CPF e vender meus dados", "nada"],
		["Vocês podem consultar meu CPF, e depois vender meus dados?", "nada"],
		["Podem consultar meu CPF e vender meus dados?", "nada"],
		["Podem usar meus dados", "nada"],
		["não, pode", "nada"],
		["não pode, obrigado", "nada"],
	];

	it.each(TABELA)("“%s” — %s", (fala, direcao) => {
		const semAceiteAnterior = resolverAceiteLgpd({ falas: [aviso], falaDoCliente: fala });
		if (direcao === "aceita") {
			expect(semAceiteAnterior.ok, fala).toBe(true);
			expect(semAceiteAnterior.motivo, fala).toBe("aceite-do-cliente");
			return;
		}
		expect(semAceiteAnterior.ok, fala).toBe(false);

		// Com um aceite anterior, só a revogação pode derrubá-lo.
		const comAceiteAnterior = resolverAceiteLgpd({
			falas: [aviso, aceite],
			falaDoCliente: fala,
		});
		const esperado = direcao === "revoga" ? "aceite-revogado" : "aceite-do-cliente";
		expect(comAceiteAnterior.motivo, fala).toBe(esperado);
	});

	// A pergunta coordenada da rodada 5, isolada: é o "e" que não pode emendar duas
	// orações e dar o "?" só para a última. O "podem" da primeira não autoriza nada.
	it("pergunta coordenada depois do aviso não abre o aceite", () => {
		for (const fala of [
			"Vocês podem consultar meu CPF e vender meus dados?",
			"Vocês podem consultar meu CPF e vender meus dados",
			"Vocês podem consultar meu CPF, e vender meus dados?",
			"Podem consultar meu CPF e vender meus dados?",
		]) {
			expect(clienteAceitouLgpd(fala), fala).toBe(false);
		}
	});
});
