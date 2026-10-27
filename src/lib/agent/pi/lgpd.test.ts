import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AVISO_LGPD, clienteAceitouLgpd, PEDE_DADO_RE, resolverAceiteLgpd } from "./lgpd";
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

	// O CASO MEDIDO (27/10/2026, conversa 436dec29, cenário `golden-fecho-nao-anda-pra-tras`,
	// modelo de produção): aviso → cliente pergunta "e agora?" → cliente diz "Quero essa
	// mesma, bora fechar". O estágio fechava na pergunta e a tool recusava para sempre; o
	// modelo repetia o pedido de "sim" e a venda morria com o cliente pedindo para fechar.
	it("uma pergunta no meio não queima o aceite que vem depois", () => {
		const r = resolverAceiteLgpd({
			falas: [
				{ role: "assistant", content: AVISO },
				{ role: "user", content: "e agora?" },
				{ role: "assistant", content: "Preciso da sua confirmação para o aviso que te enviei." },
				{ role: "user", content: "Quero essa mesma, bora fechar" },
			],
		});
		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("aceite-do-cliente");
	});

	it("recusa depois da pergunta fecha o estágio e não vira aceite", () => {
		const r = resolverAceiteLgpd({
			falas: [
				{ role: "assistant", content: AVISO },
				{ role: "user", content: "e agora?" },
				{ role: "user", content: "não autorizo o uso dos meus dados" },
				{ role: "user", content: "sim" },
			],
		});
		expect(r.ok).toBe(false);
	});

	it("só pergunta, sem aceite nenhum: continua faltando o aceite", () => {
		const r = resolverAceiteLgpd({
			falas: [
				{ role: "assistant", content: AVISO },
				{ role: "user", content: "e agora?" },
				{ role: "user", content: "quanto fica a parcela?" },
			],
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("falta-o-aceite");
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

// Decisão do dono, 27/10/2026 (D-0009): LGPD e PII não são obstáculo da conversa. O balão
// não é reescrito, o pedido de dado não é adiado, nenhum aviso é empurrado na fala. O que
// fica é encanamento: CPF mascarado na saída, identidade cifrada, e o aceite conferido na
// conversa ANTES de consultar bureau (`resolverAceiteLgpd`, testado adiante).
describe("o balão não é reescrito — LGPD não trava fala (decisão do dono, 27/10/2026)", () => {
	it("pedir CPF sem aviso anterior sai como o modelo escreveu", () => {
		const r = montarTrechoDeSaida({
			texto: "Você escolheu a Canopus. Me passa seu CPF pra eu gerar a proposta.",
		});
		expect(r.texto).toBe("Você escolheu a Canopus. Me passa seu CPF pra eu gerar a proposta.");
		expect(r.texto).not.toContain("conforme a LGPD");
	});

	it("pedir o celular sem aviso anterior também não ganha aviso", () => {
		const r = montarTrechoDeSaida({ texto: "Qual é o seu celular com DDD?" });
		expect(r.texto).toBe("Qual é o seu celular com DDD?");
	});

	it("o CPF em claro continua mascarado na saída", () => {
		const r = montarTrechoDeSaida({ texto: "Anotado: 111.444.777-35, obrigado." });
		expect(r.texto).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
	});

	// A trava de fala não pode voltar: se `soltarTrecho` voltar a consultar aviso da LGPD,
	// o balão é reescrito outra vez e o custo cai na conversa de venda.
	it("nenhum trecho do turno consulta aviso da LGPD", () => {
		const fonte = readFileSync(new URL("./turno-livre.ts", import.meta.url).pathname, "utf8");
		const corpo = fonte.slice(fonte.indexOf("const soltarTrecho"), fonte.indexOf("const executar"));
		expect(corpo).toContain("montarTrechoDeSaida({");
		expect(corpo).not.toMatch(/aviso\s+d[ao]\s+LGPD|AVISO_LGPD|PEDE_DADO/);
		expect(fonte).not.toMatch(/avisoDado|garanteAvisoLgpd|avisoAplicado/);
	});

	it("o avaliador não tem regra de dado sem aviso", () => {
		const fonte = readFileSync(new URL("./eval/golden.ts", import.meta.url).pathname, "utf8");
		expect(fonte).not.toContain("dado-sem-aviso");
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
			const r = montarTrechoDeSaida({ texto: fala });
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
		});
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
		expect(clienteAceitouLgpd("Pode usar.")).toBe(true);
		// A pergunta contamina a MENSAGEM INTEIRA — é assim na main (`isQuestion` lê o
		// texto todo). "Pode usar. E qual é o prazo?" custa um turno; erro do lado
		// contrário custa uma consulta de bureau no CPF de quem não autorizou.
		expect(clienteAceitouLgpd("Pode usar. E qual é o prazo?")).toBe(false);
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

	// Rodada 8: RE-ACEITE EXIGE O AGENTE REPETIR O AVISO (estágio da main, onda 18) —
	// lado seguro. O candidato é a primeira fala do cliente depois do aviso: aqui é
	// "não autorizo", e o "pode usar meus dados" é fala posterior e não decide.
	it("aviso → não autorizo → sim: o sim não é candidato, falta o aceite", () => {
		const r = resolverAceiteLgpd({
			falas: [aviso, { role: "user", content: "não autorizo" }],
			falaDoCliente: "pode usar meus dados",
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("falta-o-aceite");
	});

	// ... e com o aviso repetido, o "sim" volta a ser candidato e autoriza.
	it("aviso → não autorizo → aviso de novo → sim: o sim do estágio autoriza", () => {
		const r = resolverAceiteLgpd({
			falas: [aviso, { role: "user", content: "não autorizo" }, aviso],
			falaDoCliente: "pode usar meus dados",
		});
		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("aceite-do-cliente");
	});

	// Rodada 8: RE-ACEITE EXIGE O AGENTE REPETIR O AVISO (estágio da main, onda 18) —
	// lado seguro. O aceite veio do candidato "sim, pode usar"; a revogação derruba ele e
	// o "pensando bem, pode usar" é fala posterior, não candidato.
	it("revogação depois de novo sim: o sim mais recente não é candidato, está revogado", () => {
		const r = resolverAceiteLgpd({
			falas: [
				aviso,
				{ role: "user", content: "sim, pode usar" },
				{ role: "user", content: "não autorizo mais" },
				{ role: "user", content: "pensando bem, pode usar" },
			],
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("aceite-revogado");
	});

	// ... e com o aviso repetido depois da revogação, o "pensando bem, pode usar" é
	// candidato de novo e o aceite volta.
	it("revogação e aviso repetido: o sim depois do aviso repetido vale outra vez", () => {
		const r = resolverAceiteLgpd({
			falas: [
				aviso,
				{ role: "user", content: "sim, pode usar" },
				{ role: "user", content: "não autorizo mais" },
				aviso,
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
		// Rodada 6: a pergunta trava a MENSAGEM INTEIRA (a main lê o texto todo). Antes
		// desta rodada a mensagem era decidida frase a frase e o "Pode usar." valia.
		["Pode usar. E qual é o prazo?", "nada"],
		["Pode consultar meu CPF e usar meus dados para a proposta.", "aceita"],
		// A pergunta na MESMA frase (sem ponto entre as duas) não se separa: a fala
		// inteira pergunta, então não se captura. Com o ponto, a primeira frase é
		// declaração e vale.
		["Pode usar meus dados, obrigado 😊 Qual é o prazo?", "nada"],
		["Pode usar meus dados, obrigado 😊. Qual é o prazo?", "nada"],
		["Ok, autorizo — qual o prazo?", "nada"],
		// Rodada 6: a trava geral é de NEGAÇÃO NA MENSAGEM INTEIRA. "não tem problema,"
		// é bom demais para ser lido por regex: cai no lado seguro e o modelo repergunta.
		["não tem problema, pode usar", "nada"],
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

// P262, re-auditoria 310e rodada 6: a onda 15 protegeu o lado perigoso com lista de
// BLOQUEIO (negações enumeradas) e o auditor achou outra forma que escapava — "Ainda
// não estou de acordo." casa "de acordo" e não casava nenhuma negação enumerada.
// Bloqueio nunca fecha; a rodada 6 inverte o desenho para LISTA DE PERMISSÃO.
//
// Contrato conferido aqui: o aceite só acontece quando a mensagem INTEIRA passa por
// todas as travas (não revoga, não pergunta, não nega, não recusa) e casa a forma
// positiva estreita. Qualquer outra fala cai no lado seguro — o aceite fica pendente,
// o modelo pergunta de novo e o cliente responde "sim" no turno seguinte.
describe("P262 rodada 6 — lista de permissão: só a forma positiva estreita aceita", () => {
	const aviso = { role: "assistant" as const, content: AVISO };

	const TABELA: Array<[string, "aceita" | "nao-aceita"]> = [
		// ——— o caso da rodada 6: recusa escrita com as palavras do aceite ———
		["Ainda não estou de acordo.", "nao-aceita"],
		["Ainda não estou de acordo", "nao-aceita"],
		["Não estou de acordo com o uso dos meus dados.", "nao-aceita"],
		// ——— a trava geral de negação pega a forma que ninguém enumerou ———
		["Nem sei se quero isso", "nao-aceita"],
		["Nem pensar, obrigado", "nao-aceita"],
		["Jamais autorizo a consulta do meu CPF.", "nao-aceita"],
		["Nunca autorizei ninguém a consultar meu CPF", "nao-aceita"],
		["sim, mas só se vocês não venderem meus dados", "nao-aceita"],
		["Ainda não decidi, amanhã eu falo", "nao-aceita"],
		// ——— a forma positiva é ESTREITA: verbo de dúvida não é consentimento ———
		["Quero entender como vocês usam meu CPF", "nao-aceita"],
		["deixa eu confirmar com a esposa", "nao-aceita"],
		["me explica o que é birô de crédito", "nao-aceita"],
		["ok, mas antes me conta quanto tempo leva", "nao-aceita"],
		// ——— e o aceite de verdade continua entrando ———
		["Beleza, pode consultar meu CPF.", "aceita"],
		["Sim, autorizo a consulta do meu CPF.", "aceita"],
		["Confirmado, pode seguir.", "aceita"],
		["pode usar meus dados", "aceita"],
	];

	it.each(TABELA)("“%s” — %s", (fala, esperado) => {
		const semAceiteAnterior = resolverAceiteLgpd({ falas: [aviso], falaDoCliente: fala });
		if (esperado === "aceita") {
			expect(clienteAceitouLgpd(fala), fala).toBe(true);
			expect(semAceiteAnterior.ok, fala).toBe(true);
			expect(semAceiteAnterior.motivo, fala).toBe("aceite-do-cliente");
			return;
		}
		expect(clienteAceitouLgpd(fala), fala).toBe(false);
		expect(semAceiteAnterior.ok, fala).toBe(false);
		expect(semAceiteAnterior.motivo, fala).toBe("falta-o-aceite");
	});

	// O exemplo do auditor, com o nome que ele usou: a fala contém a forma positiva
	// ("de acordo") e nenhuma negação enumerada — a trava geral é o que a barra.
	it("“Ainda não estou de acordo.” não vira aceite pelo “de acordo”", () => {
		expect(clienteAceitouLgpd("Ainda não estou de acordo.")).toBe(false);
	});

	// A lista de permissão não reabre o que as rodadas 4 e 5 fecharam.
	it("as travas das rodadas 4 e 5 continuam de pé", () => {
		expect(clienteAceitouLgpd("Vocês podem consultar meu CPF e vender meus dados?")).toBe(false);
		expect(clienteAceitouLgpd("Não autorizo consultar meu CPF, podemos seguir sem isso?")).toBe(
			false,
		);
	});
});

// P262, re-auditoria 310e rodada 7: o aceite é a decisão LITERAL da main
// (`decideConfirmStage` em `src/lib/whatsapp/contract-capture.ts`, a2bc3024). Não existe
// padrão próprio de aceite em `lgpd.ts` — "de acordo", "concordo", "autorizo" como forma
// positiva eram juiz próprio, e aceitam o exemplo do auditor ("Estou verificando se o termo
// está de acordo com a LGPD."). O único juiz é a função da main, e a trava do aceite só
// ESTREITA: ela tira aceite, nunca cria — portanto não pode produzir o lado perigoso.
// Os moldes, com o caso que o auditor mediu:
describe("P262 rodada 7 — o juiz é `decideConfirmStage` da main; a trava só estreita", () => {
	const aviso = { role: "assistant" as const, content: AVISO };
	const TABELA: Array<[string, "aceita" | "nao-aceita"]> = [
		["Estou verificando se o termo está de acordo com a LGPD.", "nao-aceita"],
		// A mesma frase sem a verificação: em `lgpd.ts` não há lista própria de aceite, então
		// “de acordo” sozinho não autoriza nada — é o `AFFIRM_RE` da main que decide, e ele não
		// tem essa expressão.
		["Estou de acordo com o uso dos meus dados.", "nao-aceita"],
		["sim", "aceita"],
		["pode consultar", "aceita"],
		["Ainda não estou de acordo.", "nao-aceita"],
		["Vocês podem consultar meu CPF e vender meus dados?", "nao-aceita"],
	];

	it.each(TABELA)("“%s” — %s", (fala, esperado) => {
		const esperadoAceite = esperado === "aceita";
		expect(clienteAceitouLgpd(fala), fala).toBe(esperadoAceite);
		const r = resolverAceiteLgpd({ falas: [aviso], falaDoCliente: fala });
		expect(r.ok, fala).toBe(esperadoAceite);
		expect(r.motivo, fala).toBe(esperadoAceite ? "aceite-do-cliente" : "falta-o-aceite");
	});
});

// P262, re-auditoria 310e rodada 8: O ACEITE É DO ESTÁGIO, como na main. Na main, sem
// coleta de contratação ativa nada é decidido (`contract-capture.ts:161`); a confirmação é
// processada em `:200`, dentro do estágio aberto pelo pedido de autorização. Aqui o estágio
// abre no AVISO: o ÚNICO candidato a aceite é a PRIMEIRA fala do cliente depois dele. Falas
// posteriores não contam, a não ser que o agente repita o aviso — aí vale a primeira fala
// depois da repetição. O juiz continua `decideConfirmStage` + trava; o que a rodada 8 fecha é
// o CONTEXTO em que a decisão é aplicada, que era o que a main tinha: uma resposta de
// qualificação respondia a OUTRA pergunta do agente, mas casa `quero` do `AFFIRM_RE` e virava
// aceite retroativo, liberando a consulta de bureau sem consentimento.
describe("P262 rodada 8 — o aceite é do estágio: só a primeira fala depois do aviso decide", () => {
	const aviso = { role: "assistant" as const, content: AVISO };

	it("aviso → “sim” ⇒ aceito", () => {
		const r = resolverAceiteLgpd({ falas: [aviso], falaDoCliente: "sim" });
		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("aceite-do-cliente");
	});

	it("aviso → “como funciona?” → agente “Qual bem você procura?” → “Quero um carro de 80 mil.” ⇒ NÃO aceito", () => {
		const r = resolverAceiteLgpd({
			falas: [
				aviso,
				{ role: "user", content: "como funciona?" },
				{ role: "assistant", content: "Qual bem você procura?" },
				{ role: "user", content: "Quero um carro de 80 mil." },
			],
		});
		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("falta-o-aceite");
	});

	it("aviso → “como funciona?” → agente repete o aviso → “pode” ⇒ aceito", () => {
		const r = resolverAceiteLgpd({
			falas: [
				aviso,
				{ role: "user", content: "como funciona?" },
				aviso,
				{ role: "user", content: "pode" },
			],
		});
		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("aceite-do-cliente");
	});

	// O estágio fecha para o ACEITE, não para a REVOGAÇÃO: ela derruba o consentimento vindo
	// de qualquer fala, inclusive de uma que não foi candidata.
	it("a revogação continua lendo qualquer fala, dentro ou fora do estágio", () => {
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
});
