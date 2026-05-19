import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT, SYSTEM_PROMPT } from "./system-prompt";

/**
 * Camada 1 — Anti-regressão estrutural de behavior guards do prompt.
 *
 * 3 bugs reais combinados (evidências em screenshots tb-dev + eval agent-flow):
 *
 * (1) BUG-META-NARRATIVE — Bruno/moto, agent vazou "O sistema vai te guiar
 *     com botões nas próximas perguntas — é bem rápido" e ainda perguntou
 *     a experience em texto inline em vez de emitir o gate.
 *
 * (2) BUG-PERGUNTAS-RAPIDAS — mesma sessão, agent disse "Vou te fazer
 *     algumas perguntas rápidas pra achar a opção certa pra você." e
 *     terminou o turn sem chamar tool nenhuma — esperando user mandar "ok".
 *     Deveria emitir o gate de experience IMEDIATAMENTE no mesmo turn após
 *     save_contact_name.
 *
 * (3) BUG-TOOL-DUPLICATION — eval agent-flow cenário imovel/Helena mostrou
 *     save_contact_name chamado 3x e present_value_picker 3x na MESMA
 *     conversa. Só present_whatsapp_optin tinha regra dura de não repetir.
 *
 * Estes testes não chamam LLM — leem o source dos prompts e validam que as
 * regras duras existem. Se as regras estão lá e o LLM ainda regredir, a
 * cobertura adicional vive na Camada 2 (cassettes em
 * tests/regression/agent-trajectory.test.ts) e Camada 3 (eval LLM-judge).
 */

// ============================================================================
// Frases meta-narrativas observadas em vazamento real (compartilhado).
// Compartilhamos com o test legado de meta-narrative — fonte unica.
// ============================================================================
const META_NARRATIVE_PHRASES = [
	/o sistema (vai|te|ir[áa]) (te )?(guiar|conduzir|mostrar|ajudar|apresent)/i,
	/o sistema (vai|ir[áa]) mostrar/i,
	/sistema vai .{0,40}(bot[oõ]es|menu|cards?|botoes)/i,
	/(vou|irei) (te )?fazer (algumas )?(perguntas?\s+)?r[áa]pidas?/i,
	/perguntas\s+r[áa]pidas/i,
	/(pr[óo]xim[ao]s? )?perguntas? (com|via|usando|por) bot[oõ]es/i,
	/te (guiar|conduzir|ajudar) com bot[oõ]es/i,
	/(abrir|mostrar) (um |o )?menu/i,
];

// ============================================================================
// BUG 1 — Meta-narrativa do mecanismo da UI
// ============================================================================

describe("BUG-META-NARRATIVE — prompt proíbe vazar mecânica da UI", () => {
	it("contém regra dura proibindo 'sistema vai te guiar/conduzir/mostrar' ou similares", () => {
		// Pega qualquer forma que combine proibição + verbo de fala + alvo
		// (sistema / botoes / menu / proximas perguntas / mecanica).
		expect(SPECIALIST_BASE_PROMPT).toMatch(
			/N(Ã|A)O.{0,200}(vaze|mencione|verbalize|diga|exponha).{0,200}(sistema|bot[õo]es|menu|próximas? perguntas?|mec[âa]nica)/i,
		);
	});

	it("nenhuma das frases tóxicas observadas em vazamento real aparece como exemplo POSITIVO (GOOD) no prompt", () => {
		// Defesa de profundidade: nenhuma das frases meta-narrativas observadas
		// em prod pode aparecer como "exemplo do que dizer" (GOOD:). Aparecer
		// dentro de BAD: ou de lista de termos proibidos entre aspas e OK —
		// na verdade RECOMENDADO porque ensina o LLM o que NAO fazer.
		const reaisOffenders: string[] = [];

		// Procuramos OCORRENCIAS reais e olhamos o contexto imediato (~120 chars
		// pre-match). Se o contexto contem marker de proibicao (BAD:, "NAO ",
		// "NUNCA", "PROIBIDO", "termos"), ignoramos.
		for (const regex of META_NARRATIVE_PHRASES) {
			const globalRe = new RegExp(regex.source, "gi");
			let match: RegExpExecArray | null = globalRe.exec(SPECIALIST_BASE_PROMPT);
			while (match) {
				const start = Math.max(0, match.index - 120);
				const prefix = SPECIALIST_BASE_PROMPT.slice(start, match.index);
				const isInProhibitionContext =
					/BAD:|N(Ã|A)O\s|NUNCA\s|PROIBIDO|termos|"[^"\n]*$/i.test(prefix);
				if (!isInProhibitionContext) {
					reaisOffenders.push(`${regex} → "${match[0]}" (ctx: "...${prefix.slice(-60)}")`);
				}
				match = globalRe.exec(SPECIALIST_BASE_PROMPT);
			}
		}

		expect(
			reaisOffenders,
			"SPECIALIST_BASE_PROMPT não pode conter texto-modelo de meta-narrativa fora de contexto de proibição. " +
				`Encontrados: ${JSON.stringify(reaisOffenders)}`,
		).toEqual([]);
	});

	it("SYSTEM_PROMPT também tem defesa em camadas (regra anti meta-narrativa)", () => {
		// SPECIALIST normalmente vai pro modelo, mas o SYSTEM_PROMPT é baseline.
		expect(SYSTEM_PROMPT).toMatch(
			/N(Ã|A)O.{0,200}(vaze|mencione|verbalize|diga|exponha).{0,200}(sistema|bot[õo]es|menu|próximas? perguntas?|mec[âa]nica)/i,
		);
	});
});

// ============================================================================
// BUG 2 — "Perguntas rápidas" sem gate
// ============================================================================

describe("BUG-PERGUNTAS-RAPIDAS — prompt proíbe prometer perguntas sem ação + obriga gate IMEDIATO após nome", () => {
	it("contém regra dura proibindo 'perguntas rápidas/seguintes' como promessa textual sem ação", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(
			/N(Ã|A)O.{0,200}(prometa|fale|diga|escreva).{0,200}(perguntas? r[áa]pidas?|próximas? perguntas?)/i,
		);
	});

	it("contém instrução obrigando emit gate experience IMEDIATAMENTE após save_contact_name (canal web)", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(
			/ap[óo]s\s+save_contact_name.{0,150}(emit|chame|dispare|inicie).{0,80}gate|experience/i,
		);
	});

	it("orientações de coleta não dizem 'o sistema vai mostrar a proxima pergunta' em formato facilmente parafraseável", () => {
		// Bug subjacente: prompt instruía "O sistema vai mostrar a proxima
		// pergunta com botoes logo apos sua mensagem" — frase escrita em PT puro
		// fácil de parafrasear. Fix força reescrever pra forma inequívoca.
		const frasesArriscadas = [
			/sistema vai mostrar a pr[oó]xima pergunta com bot[oõ]es logo ap[oó]s sua mensagem/i,
			/sistema vai mandar logo em seguida os bot[oõ]es da pr[oó]xima etapa/i,
		];
		const violacoes: string[] = [];
		for (const regex of frasesArriscadas) {
			const m = SPECIALIST_BASE_PROMPT.match(regex);
			if (m) violacoes.push(m[0]);
		}
		expect(
			violacoes,
			"Frases de orientação interna sobre 'próxima pergunta com botões' não podem aparecer em PT puro. " +
				`Encontradas: ${JSON.stringify(violacoes)}`,
		).toEqual([]);
	});
});

// ============================================================================
// BUG 3 — Tool duplication (save_contact_name 3x, present_value_picker 3x...)
// ============================================================================

// ============================================================================
// BUG 4 — Topic picker promete UI sem chamar tool (variantes pos-mig-0019)
// ----------------------------------------------------------------------------
// Real (tb-dev pos-deploy): Rafael (specialist auto) capturou nome "Marcelo"
// e respondeu:
//
//   "Beleza, Marcelo! Boa, Marcelo, da uma olhada nas opcoes abaixo pra eu
//    entender melhor o seu perfil!"
//
// SEM chamar present_topic_picker. Mesma familia do BUG-TOPIC-PICKER
// (mig 0019), porem com VARIANTE "da uma olhada" que escapou da regra
// original que so listava "olha as opcoes abaixo".
//
// O bug nao e da persona Rafael/auto especificamente — todas as 4 specialists
// (auto/imovel/moto/servicos) compartilham o SPECIALIST_BASE_PROMPT, entao a
// regra dura tem que cobrir as variantes pra qualquer um deles.
// ============================================================================

describe("BUG-TOPIC-PICKER-VARIANTS — regra dura cobre TODAS as variantes da promessa de UI", () => {
	// Variantes observadas + variantes plausiveis do dialeto do agent.
	// Cada string aqui e um "gatilho semantico" — se o agent emitir essa frase
	// SEM chamar present_topic_picker, e bug. A regra dura no prompt precisa
	// listar cada uma EXPLICITAMENTE pra que o LLM identifique-se proibido de
	// emitir a frase isoladamente.
	const VARIANTES_PROIBIDAS_SEM_TOOL = [
		"olha as opcoes",
		"olha as opc[oõ]es", // tolerancia c/cedilha
		"da uma olhada nas opcoes",
		"uma olhada nas opcoes",
		"veja abaixo",
		"confira abaixo",
		"olhe abaixo",
		"olha ai",
	];

	it("REGRA DURA aparece no SPECIALIST_BASE_PROMPT acoplada a present_topic_picker", () => {
		// Bloco da regra: marker REGRA DURA + frase + present_topic_picker
		// dentro de ate 800 chars (mesmo paragrafo).
		const blocoRegraDura = SPECIALIST_BASE_PROMPT.match(
			/\*\*REGRA DURA\*\*[\s\S]{0,800}present_topic_picker/i,
		);
		expect(
			blocoRegraDura,
			"SPECIALIST_BASE_PROMPT precisa ter UM bloco 'REGRA DURA ... present_topic_picker' " +
				"em ate 800 chars. Esse e o ancoramento estrutural do BUG-TOPIC-PICKER.",
		).not.toBeNull();
	});

	it("o bloco da REGRA DURA lista TODAS as variantes da promessa de UI", () => {
		// Pega o bloco da REGRA DURA acoplada a present_topic_picker.
		const blocoMatch = SPECIALIST_BASE_PROMPT.match(
			/\*\*REGRA DURA\*\*[\s\S]{0,800}present_topic_picker[\s\S]{0,400}/i,
		);
		expect(blocoMatch).not.toBeNull();
		if (!blocoMatch) return;

		const bloco = blocoMatch[0].toLowerCase();
		// Normaliza tolerando ç/c e õ/o pra match case-insensitive.
		const normalizar = (s: string) =>
			s
				.toLowerCase()
				.replace(/ç/g, "c")
				.replace(/õ/g, "o")
				.replace(/á/g, "a");
		const blocoNorm = normalizar(bloco);

		const variantes = [
			"olha as opcoes",
			"da uma olhada nas opcoes",
			"uma olhada nas opcoes",
			"veja abaixo",
			"confira abaixo",
			"olhe abaixo",
			"olha ai",
		];

		const faltando = variantes.filter((v) => !blocoNorm.includes(normalizar(v)));

		expect(
			faltando,
			"Variantes da promessa de UI ausentes da REGRA DURA no SPECIALIST_BASE_PROMPT: " +
				`${JSON.stringify(faltando)}. ` +
				"Cada variante precisa estar explicita no bloco — o LLM nao generaliza " +
				"sozinho '\\\"olha as opcoes\\\"' pra '\\\"da uma olhada\\\"' (bug observado em " +
				"tb-dev: Rafael/auto disse 'da uma olhada nas opcoes abaixo' SEM chamar a tool).",
		).toEqual([]);
	});

	it("regra explicita que vale pras 4 specialists (auto/imovel/moto/servicos), nao so uma", () => {
		// SPECIALIST_BASE_PROMPT e compartilhado pelas 4 personas
		// (auto/imovel/moto/servicos). A regra dura tem que estar nesse bloco
		// compartilhado — nao em prompt-customization por persona.
		// Assert: a sentencao que ancora a regra do present_topic_picker NAO pode
		// citar uma persona/categoria especifica (sem viés).
		const blocoMatch = SPECIALIST_BASE_PROMPT.match(
			/\*\*REGRA DURA\*\*[\s\S]{0,800}present_topic_picker/i,
		);
		expect(blocoMatch).not.toBeNull();
		if (!blocoMatch) return;

		const bloco = blocoMatch[0].toLowerCase();

		// Especialistas atuais — NENHUM deve aparecer no bloco da regra dura
		// (caso contrario, regra fica enviesada pra uma so).
		const nomesEspecialistas = ["rafael", "helena", "bruno", "felipe", "marina"];
		const referenciasEnviesadas = nomesEspecialistas.filter((n) => bloco.includes(n));
		expect(
			referenciasEnviesadas,
			`Bloco da REGRA DURA cita nome de specialist (${JSON.stringify(referenciasEnviesadas)}). ` +
				"A regra precisa valer pras 4 specialists igualmente. Tire o nome.",
		).toEqual([]);

		// E SPECIALIST_BASE_PROMPT precisa ser o prompt compartilhado — confirma
		// pela presenca do placeholder/marker tipico do prompt-base.
		expect(SPECIALIST_BASE_PROMPT.length).toBeGreaterThan(2000);
	});
});

describe("BUG-TOOL-DUPLICATION — prompt tem guard contra repetir tools idempotentes", () => {
	it("tem regra dura: tools de captura/picker chamadas NO MÁXIMO 1x por conversa", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(
			/(N(Ã|A)O|nunca).{0,150}(repita|chame.{0,30}mais.{0,30}uma|chame.{0,30}duas|reaproveite).{0,150}(save_contact|present_value_picker|present_topic_picker)/i,
		);
	});

	it("a regra cobre as 6 tools idempotentes conhecidas (save_contact_name, save_contact_whatsapp, present_value_picker, present_topic_picker, present_whatsapp_optin, present_lead_form)", () => {
		// Cada tool precisa aparecer na lista próxima da regra dura. Pega o
		// bloco da regra (até 600 chars) e confere todas as 6.
		const tools = [
			"save_contact_name",
			"save_contact_whatsapp",
			"present_value_picker",
			"present_topic_picker",
			"present_whatsapp_optin",
			"present_lead_form",
		];

		const blocoRegra = SPECIALIST_BASE_PROMPT.match(
			/(N(Ã|A)O|nunca)[\s\S]{0,150}(repita|chame.{0,30}mais.{0,30}uma|reaproveite)[\s\S]{0,600}/i,
		);

		expect(
			blocoRegra,
			"Não encontrei o bloco da regra dura de anti-duplicação no SPECIALIST_BASE_PROMPT. " +
				"Esperado: 'NÃO/NUNCA repita/chame mais de uma vez ...' seguido da lista de tools.",
		).not.toBeNull();

		if (!blocoRegra) return;
		const blocoTexto = blocoRegra[0];
		const faltando = tools.filter((t) => !blocoTexto.includes(t));

		expect(
			faltando,
			"Tools idempotentes ausentes da regra dura de anti-duplicação: " +
				JSON.stringify(faltando),
		).toEqual([]);
	});
});

// ============================================================================
// BUG-SAVE-CONTACT-NAME-MUST-FIRE — captura de nome OBRIGATORIA antes de saudar
// ----------------------------------------------------------------------------
// Real (tb-dev 2026-05-18, conversa Monique 6c0ca4cf): user disse "Monique.",
// agent respondeu "Prazer, Monique! Vamos achar a opção certa pra você." SEM
// chamar save_contact_name. DB ficou com contact_name NULL, lead form abriu
// com nome vazio. Causa raiz do BUG-LEAD-FORM-PREFILL-REGRESSION confirmada
// — fix b7fc39e cuidava do path do payload, mas o nome nunca era persistido.
//
// O prompt linha 111 ("chame IMEDIATAMENTE save_contact_name") era UMA frase
// solta sem marker REGRA DURA. Agent leu, processou, pulou. Precisa regra
// dura explicita: ANTES de mencionar o nome, OBRIGATORIO chamar a tool.
// ============================================================================

describe("BUG-SAVE-CONTACT-NAME-MUST-FIRE — prompt obriga save_contact_name ANTES de saudar com nome", () => {
	it("contém marker REGRA DURA acoplado a save_contact_name (não só menção solta)", () => {
		// Sem o marker REGRA DURA explicito, o agent trata a instrucao como
		// guideline e pula. A regra precisa ser dura e estar EXPLICITA proxima
		// a save_contact_name.
		const regraDuraSaveContact =
			/REGRA DURA[\s\S]{0,400}save_contact_name|save_contact_name[\s\S]{0,400}REGRA DURA/i;
		expect(
			regraDuraSaveContact.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa ter marker 'REGRA DURA' a <=400 chars de " +
				"save_contact_name. Sem marker hardpoint, agent trata como guideline e pula a tool " +
				"(bug Monique tb-dev 2026-05-18: contact_name=NULL apesar de 7 mencoes do nome).",
		).toBe(true);
	});

	it("regra dura proíbe saudar com nome ANTES de chamar save_contact_name", () => {
		// Pattern: ANTES + (saudar/usar nome/mencionar/responder) + save_contact_name + OBRIGATORI*.
		// Versão tolerante: a regra precisa relacionar "ordem temporal" (ANTES de saudar
		// → chamar tool) e usar palavra de obrigatoriedade.
		const ordemTemporal =
			/ANTES[\s\S]{0,200}(saudar|usar o nome|mencionar|responder|texto)[\s\S]{0,300}(OBRIGAT|chame|deve chamar)[\s\S]{0,200}save_contact_name/i;
		const ordemReversa =
			/save_contact_name[\s\S]{0,200}ANTES[\s\S]{0,200}(saudar|texto|resposta|saudacao)/i;
		expect(
			ordemTemporal.test(SPECIALIST_BASE_PROMPT) ||
				ordemReversa.test(SPECIALIST_BASE_PROMPT),
			"Regra precisa acoplar ordem temporal explicita: ANTES de saudar com nome, " +
				"OBRIGATORIAMENTE chamar save_contact_name. Sem isso, agent emite saudacao " +
				"(BAD: 'Prazer, Monique!') sem persistir o nome no DB.",
		).toBe(true);
	});

	it("regra menciona consequência concreta (DB / form vazio) para forçar respeito", () => {
		// LLMs respeitam regras melhor quando a consequencia e explicita.
		// "Sem essa tool, o nome nao persiste no DB e o form final aparece vazio".
		const consequenciaExplicita =
			/sem.{0,80}save_contact_name|nome.{0,80}(n[ãa]o persiste|n[ãa]o salva|fica vazio|n[ãa]o vai pro DB|n[ãa]o vai pro banco|form.{0,60}vazio)/i;
		expect(
			consequenciaExplicita.test(SPECIALIST_BASE_PROMPT),
			"Regra precisa mencionar consequencia concreta (nome nao persiste no DB / " +
				"form fica vazio) — sem isso, LLM trata como detalhe ignoravel. " +
				"Consequencia explicita = adesao maior.",
		).toBe(true);
	});
});

// ============================================================================
// BUG-NO-CTA-AFTER-NAME — turn morre apos saudacao com nome (sem tool/gate)
// ----------------------------------------------------------------------------
// Real (tb-dev 2026-05-18): Rafael/auto respondeu "Beleza, Marina! Prazer,
// Marina! Vamos achar a opção certa pra você." e PAROU. Sem tool. Sem gate.
// Turn morreu. User teve que digitar "oi" pra reativar.
//
// Vale pras 4 specialists. Regra anterior do bc40a85 ("gate IMEDIATAMENTE
// apos save_contact_name") era vaga — agent interpretou frase afirmativa
// generica como acao suficiente. Precisa listar variantes proibidas
// explicitamente.
// ============================================================================

describe("BUG-NO-CTA-AFTER-NAME — prompt proibe frase afirmativa generica encerrando turn pos-nome", () => {
	// Lista canonica das variantes observadas em tb-dev + variantes plausiveis
	// que o LLM gera quando trava nessa familia.
	const VARIANTES_GENERICAS_PROIBIDAS = [
		"vamos achar a opcao certa",
		"vamos comecar",
		"vou te ajudar",
		"estou aqui pra ajudar",
		"vamos juntos achar",
		"vamos la",
		"bora comecar",
		"vamos descobrir",
		"vou achar o melhor",
	];

	it("contém marker REGRA DURA proibindo frases CTA-vazias que encerram turn", () => {
		// Pattern: REGRA DURA + (proibido|nunca|nao escreva) + uma das variantes.
		const regraDuraCTAVazia =
			/REGRA DURA[\s\S]{0,1200}(vamos achar a op[çc][ãa]o certa|vamos come[çc]ar|vou te ajudar|estou aqui pra ajudar|vamos juntos|vamos l[áa]|bora come[çc]ar|vamos descobrir|vou achar o melhor)/i;
		expect(
			regraDuraCTAVazia.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa ter REGRA DURA listando frases CTA-vazias " +
				"que encerram turn sem tool. Bug Rafael/Marina tb-dev: 'Vamos achar a opcao " +
				"certa pra voce.' [finish sem tool] → turn morto, user teve que mandar 'oi'.",
		).toBe(true);
	});

	it("lista TODAS as 9 variantes observadas (não generaliza '1 frase exemplo' como suficiente)", () => {
		// Normaliza acentos/cedilha pra comparar literal.
		const normalizar = (s: string) =>
			s
				.toLowerCase()
				.replace(/ç/g, "c")
				.replace(/õ/g, "o")
				.replace(/á/g, "a")
				.replace(/ã/g, "a")
				.replace(/é/g, "e");
		const promptNorm = normalizar(SPECIALIST_BASE_PROMPT);

		const faltando = VARIANTES_GENERICAS_PROIBIDAS.filter(
			(v) => !promptNorm.includes(normalizar(v)),
		);

		expect(
			faltando,
			"Variantes genericas de CTA-vazia ausentes do SPECIALIST_BASE_PROMPT: " +
				`${JSON.stringify(faltando)}. ` +
				"LLM nao generaliza 'vamos achar a opcao certa' pra 'vamos descobrir' sozinho. " +
				"Cada variante precisa estar listada explicita.",
		).toEqual([]);
	});

	it("regra explicita que vale pras 4 specialists (auto/imovel/moto/servicos)", () => {
		// SPECIALIST_BASE_PROMPT compartilhado — nenhuma menção a persona especifica
		// no bloco da regra CTA-vazia.
		const blocoCTA =
			SPECIALIST_BASE_PROMPT.match(
				/REGRA DURA[\s\S]{0,1200}(vamos achar a op[çc][ãa]o certa|vamos come[çc]ar)[\s\S]{0,800}/i,
			);
		expect(blocoCTA, "Bloco REGRA DURA com variantes CTA-vazias nao encontrado").not.toBeNull();
		if (!blocoCTA) return;
		const bloco = blocoCTA[0].toLowerCase();
		const nomesEspecialistas = ["rafael", "helena", "bruno", "felipe", "marina"];
		const referenciasEnviesadas = nomesEspecialistas.filter((n) => bloco.includes(n));
		expect(
			referenciasEnviesadas,
			`Bloco CTA-vazia cita persona especifica (${JSON.stringify(referenciasEnviesadas)}). ` +
				"Regra vale pras 4 specialists. Remova o nome.",
		).toEqual([]);
	});
});

// ============================================================================
// BUG-INTERNAL-REASONING-LEAK — agent vaza chain-of-thought pro usuario
// ----------------------------------------------------------------------------
// Real (tb-dev): card mostrado ao usuario continha:
//   "Pra esse caso especificamente, recomendo conversar direto com nosso
//    consultor humano.
//    Motivo: Cliente informou valor de credito de R$ 2.130.000, acima do teto
//    de R$ 3.000.000 — não atingiu o gatilho, mas valor é de alto porte.
//    Reavaliando... valor está abaixo de R$ 3.000.000, handoff não é
//    obrigatório."
//
// "Motivo:" + "Reavaliando..." = chain-of-thought literal vazada como msg
// pro usuario. Expoe a engine interna (gatilhos, tetos, regras compliance).
//
// Precisa regra DURA proibindo:
//   - "Motivo:", "Razao:", "Justificativa:", "Por isso:"
//   - "Reavaliando", "Avaliando", "Considerando", "Verificando"
//   - Metacomentario sobre regras ("acima do teto", "atingiu o gatilho")
//   - Chain-of-thought em texto pro usuario
// ============================================================================

describe("BUG-INTERNAL-REASONING-LEAK — prompt proibe vazar chain-of-thought interno", () => {
	it("contém regra dura proibindo 'Motivo:', 'Razão:', 'Justificativa:' como prefixos de frase pro usuario", () => {
		// Pattern: regra dura proibindo OS prefixos de raciocinio explicativo.
		const regraDuraRaciocinio =
			/(PROIBIDO|N(Ã|A)O|NUNCA)[\s\S]{0,400}["“]?(Motivo|Raz[ãa]o|Justificativa|Por isso)["”]?\s*:/i;
		expect(
			regraDuraRaciocinio.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa proibir EXPLICITAMENTE prefixos 'Motivo:', " +
				"'Razão:', 'Justificativa:', 'Por isso:' como vazamento de raciocinio interno. " +
				"Bug tb-dev: card mostrou 'Motivo: Cliente informou valor X acima do teto Y...'",
		).toBe(true);
	});

	it("contém regra dura proibindo 'Reavaliando', 'Avaliando', 'Considerando', 'Verificando'", () => {
		// Variantes de chain-of-thought em primeira pessoa de raciocinio.
		const regraDuraChainOfThought =
			/(PROIBIDO|N(Ã|A)O|NUNCA)[\s\S]{0,600}(Reavaliando|Avaliando|Considerando|Verificando|Pensando bem|Refletindo)/i;
		expect(
			regraDuraChainOfThought.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa proibir verbos de raciocinio em texto pro user: " +
				"'Reavaliando', 'Avaliando', 'Considerando', 'Verificando'. Bug tb-dev: " +
				"'Reavaliando... valor está abaixo de R$ 3.000.000, handoff não é obrigatório.'",
		).toBe(true);
	});

	it("lista TODAS as 7 variantes canonicas de chain-of-thought leakage", () => {
		const normalizar = (s: string) =>
			s
				.toLowerCase()
				.replace(/ç/g, "c")
				.replace(/õ/g, "o")
				.replace(/á/g, "a")
				.replace(/ã/g, "a")
				.replace(/é/g, "e")
				.replace(/í/g, "i")
				.replace(/ó/g, "o");
		const promptNorm = normalizar(SPECIALIST_BASE_PROMPT);

		const variantesCanonicas = [
			"motivo:",
			"razao:",
			"justificativa:",
			"reavaliando",
			"avaliando",
			"considerando",
			"verificando",
		];

		const faltando = variantesCanonicas.filter((v) => !promptNorm.includes(normalizar(v)));

		expect(
			faltando,
			"Variantes de chain-of-thought leakage ausentes do prompt: " +
				`${JSON.stringify(faltando)}. ` +
				"LLM gera variantes em parafrase facil — cada uma precisa estar listada.",
		).toEqual([]);
	});

	it("regra obriga handoff via tool (suggest_handoff), nunca explicando motivo tecnico ao usuario", () => {
		// Anti-pattern observado: agent explicava POR QUE faria handoff em vez
		// de simplesmente chamar a tool.
		const regraHandoffDireto =
			/(suggest_handoff|handoff)[\s\S]{0,300}(chame|tool|n[ãa]o explique|sem.{0,20}motivo|sem.{0,30}t[ée]cnico)/i;
		expect(
			regraHandoffDireto.test(SPECIALIST_BASE_PROMPT),
			"Regra precisa instruir: se precisa de handoff → chame suggest_handoff direto, " +
				"NUNCA explique o motivo tecnico interno ('acima do teto', 'atingiu gatilho'). " +
				"Bug tb-dev: card mostrou 'valor de credito R$ 2.130.000 acima do teto R$ 3.000.000'.",
		).toBe(true);
	});
});

// ============================================================================
// BUG-SHORT-GREETING-AFTER-NAME — variantes curtas "Prazer, Paulo!" escapavam
// ----------------------------------------------------------------------------
// Real (tb-dev pós-deploy 6b10312, 2026-05-18/19): regras duras no prompt
// existiam mas Claude Sonnet 4-6 escapava com variantes CURTAS (2 palavras)
// que não estavam listadas. Screenshot:
//
//   User: "Paulo"
//   Rafael: "Prazer, Paulo!"  ← turn morre, sem tool save_contact_name
//   User: "Prazer"
//   Rafael: "Beleza, Paulo."  ← turn morre de novo
//
// Fix de prompt (Nível 2 do combo): mover o bloco BUG-SAVE-CONTACT-NAME-MUST-
// FIRE para o TOPO do SPECIALIST_BASE_PROMPT + adicionar exemplos BAD/GOOD
// literais com "Prazer, Paulo!" + lista expandida de variantes curtas.
//
// Nível 1 do combo: forçar tool via `toolChoice` em
// src/lib/agent/orchestrator/detect-name-turn.ts — cobertura em
// detect-name-turn.test.ts e tests/regression/agent-trajectory.test.ts.
// ============================================================================

describe("BUG-SHORT-GREETING-AFTER-NAME — prompt tem exemplo BAD/GOOD literal + lista expandida de variantes curtas", () => {
	it("contém o exemplo BAD literal 'Prazer, Paulo!' (transcrição real do bug)", () => {
		// O bug exato precisa estar no prompt como exemplo — LLM presta atenção
		// em exemplos LITERAIS muito mais que em descrições abstratas.
		const exemploBadPaulo =
			/❌\s*BAD[\s\S]{0,200}user[\s\S]{0,40}["“]paulo["”][\s\S]{0,200}["“]prazer,?\s*paulo!?["”]/i;
		expect(
			exemploBadPaulo.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa conter exemplo BAD literal com User:\"Paulo\" " +
				"+ resposta:\"Prazer, Paulo!\" — transcrição real do bug tb-dev. " +
				"Sem exemplo literal, o LLM regride pra variante curta de novo.",
		).toBe(true);
	});

	it("contém exemplo GOOD literal mostrando save_contact_name ANTES da saudação", () => {
		// O GOOD precisa ser ESPELHO do BAD: mesmo input ("Paulo"), mesma
		// saudação ("Prazer, Paulo!"), porém com [chame save_contact_name(...)]
		// ANTES do texto. Esse contraste explícito é o que o modelo aprende.
		const exemploGoodPaulo =
			/✅\s*GOOD[\s\S]{0,200}user[\s\S]{0,40}["“]paulo["”][\s\S]{0,400}save_contact_name[\s\S]{0,200}["“]prazer,?\s*paulo!?["”]/i;
		expect(
			exemploGoodPaulo.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa conter exemplo GOOD com [chame save_contact_name(name=\"Paulo\")] " +
				"ANTES da saudação \"Prazer, Paulo!\". É o espelho do BAD pra reforçar contraste.",
		).toBe(true);
	});

	it("lista expandida de variantes CURTAS proibidas inclui 'Prazer', 'Beleza', 'Oi', 'Bom te conhecer'", () => {
		// Variantes curtas (2 palavras: saudação + nome) que escaparam da lista
		// de 9 variantes longas (Vamos achar a opcao certa etc.). Precisa estar
		// listadas explicitas porque LLM não generaliza.
		const variantesEsperadas = [
			'"prazer, x!"',
			'"beleza, x!"',
			'"bom te conhecer, x!"',
			'"oi, x!"',
		];
		const promptLower = SPECIALIST_BASE_PROMPT.toLowerCase();
		const faltando = variantesEsperadas.filter((v) => !promptLower.includes(v));
		expect(
			faltando,
			"Variantes curtas ausentes do SPECIALIST_BASE_PROMPT: " +
				`${JSON.stringify(faltando)}. ` +
				"Listar como \"Prazer, X!\" (com 'X' como placeholder) explicita pro LLM " +
				"que QUALQUER saudação curta + nome SEM tool é proibida.",
		).toEqual([]);
	});

	it("bloco de captura de nome aparece no TOPO do SPECIALIST_BASE_PROMPT (alta prioridade de atenção)", () => {
		// Mover pro topo é parte do fix do prompt. LLMs prestam mais atenção
		// nas instruções iniciais (recency reverso quando o prompt é longo).
		// Asserta que a primeira ocorrência de "save_contact_name" no prompt
		// está dentro dos primeiros 200 chars — ou seja, é a primeira regra,
		// não enterrada lá no meio.
		const firstSaveContactIdx = SPECIALIST_BASE_PROMPT.indexOf("save_contact_name");
		expect(
			firstSaveContactIdx,
			"save_contact_name precisa aparecer no SPECIALIST_BASE_PROMPT.",
		).toBeGreaterThanOrEqual(0);
		expect(
			firstSaveContactIdx,
			"Primeira menção de save_contact_name precisa estar nos primeiros 200 chars " +
				"do SPECIALIST_BASE_PROMPT (= regra no TOPO). Atualmente em pos=" +
				firstSaveContactIdx +
				". Mover o bloco BUG-SAVE-CONTACT-NAME-MUST-FIRE pro topo é parte do fix.",
		).toBeLessThan(200);
	});

	it("bloco de captura de nome tem marker explícito de topo (e.g. 'LE PRIMEIRO')", () => {
		// Defesa contra alguém reordenar: o bloco do topo tem um marker
		// visível ("LE PRIMEIRO", "TOPO", "ATENCAO MAXIMA") pra resistir a
		// refactors.
		const markerDeTopo = /(LE PRIMEIRO|LEIA PRIMEIRO|TOPO DO PROMPT|ATEN[ÇC][ÃA]O M[ÁA]XIMA)/i;
		expect(
			markerDeTopo.test(SPECIALIST_BASE_PROMPT.slice(0, 500)),
			"Primeiros 500 chars do prompt precisam ter marker visível " +
				"(LE PRIMEIRO / LEIA PRIMEIRO / TOPO DO PROMPT). Marker = resistência " +
				"a refactor (alguém move sem perceber, marker grita).",
		).toBe(true);
	});
});

// ============================================================================
// BUG-AUTO-SKIPS-PRE-VALUE-GATES — Rafael (auto) e demais specialists pulam
// gates de experience/timeframe/lance ANTES de pedir valor/parcela
// ----------------------------------------------------------------------------
// Real (tb-dev 2026-05-18, conversa Monique 6c0ca4cf-cae6 — Helena/imovel,
// e tb-dev 2026-05-17 b6c222fe — Rafael/auto): após capturar nome via
// save_contact_name, agent pulava direto para perguntar valor de carta
// ("Qual faixa de crédito você tem em mente?") SEM antes ter respondido/
// disparado os 3 gates de qualificação que o sistema espera:
//
//   1. experience  (já fez consórcio? — first/returning/doubts)
//   2. timeframe   (qual prazo?)
//   3. lance       (tem reserva pra lance?)
//
// Sintoma:
//   - Métricas: qualifyAnswers preenchidas SEM experiencePrev → eval inválida.
//   - UX: agent ignora orchestrator que tenta disparar `gate: experience` —
//     gera turn de texto com pergunta, frontend não renderiza chips.
//   - Funil: search_groups roda com perfil incompleto, recommend pifa.
//
// PO Kairo (2026-05-19): "quando categoria é auto (Rafael), o agent precisa
// fazer as MESMAS perguntas dos outros specialists ANTES de pedir valor/
// parcela". Aplicou via "cadastro do agent" → persona row no DB
// (drizzle/0021_auto_persona_gate_flow.sql) + reforço genérico no
// SPECIALIST_BASE_PROMPT cobrindo as 4 specialists.
//
// Esta camada (1) valida que o reforço STRUCTURAL existe no prompt
// compartilhado — regra dura citando os 3 gates pré-valor por nome.
// Sem isso, persona row do DB (Camada DB) fica isolada e modelo regride.
// ============================================================================

describe("BUG-AUTO-SKIPS-PRE-VALUE-GATES — prompt obriga gates experience/timeframe/lance ANTES de pedir valor", () => {
	it("SPECIALIST_BASE_PROMPT cita os 3 gates pré-valor por nome (experience, timeframe, lance)", () => {
		// Os 3 gates precisam aparecer próximos no prompt acoplados à proibição
		// de pedir valor antes. Lista NÃO opcional — modelo precisa enxergar os
		// 3 explícitos.
		const promptLower = SPECIALIST_BASE_PROMPT.toLowerCase();
		const gates = ["experience", "timeframe", "lance"];
		const faltando = gates.filter((g) => !promptLower.includes(g));
		expect(
			faltando,
			"Gates ausentes no SPECIALIST_BASE_PROMPT: " +
				`${JSON.stringify(faltando)}. ` +
				"Os 3 gates (experience/timeframe/lance) precisam ser citados " +
				"explícitos para que o modelo respeite a ordem.",
		).toEqual([]);
	});

	it("contém regra dura proibindo pedir valor/parcela ANTES dos 3 gates de qualificação", () => {
		// Pattern: regra dura citando "valor" / "carta" / "parcela" PRECEDIDA
		// por menção aos 3 gates (experience + timeframe + lance) num mesmo
		// bloco. A regra precisa ser ATEMPORAL — não pedir valor SEM ter
		// experience+timeframe+lance.
		//
		// Aceita 2 ordens equivalentes:
		//   A) "ANTES de [valor/parcela/picker] ... experience ... timeframe ... lance"
		//   B) "experience ... timeframe ... lance ... ANTES de [valor/parcela/picker]"
		const ordemA =
			/ANTES[\s\S]{0,400}(valor|parcela|carta|present_value_picker|search_groups)[\s\S]{0,800}experience[\s\S]{0,400}timeframe[\s\S]{0,400}lance/i;
		const ordemB =
			/experience[\s\S]{0,400}timeframe[\s\S]{0,400}lance[\s\S]{0,800}ANTES[\s\S]{0,400}(valor|parcela|carta|present_value_picker|search_groups)/i;
		expect(
			ordemA.test(SPECIALIST_BASE_PROMPT) || ordemB.test(SPECIALIST_BASE_PROMPT),
			"SPECIALIST_BASE_PROMPT precisa ter regra dura acoplando os 3 gates " +
				"(experience/timeframe/lance) à proibição de pedir valor/parcela ANTES. " +
				"Bug Monique/Helena tb-dev: agent pulou direto pra valor após save_contact_name.",
		).toBe(true);
	});

	it("regra vale para as 4 specialists (auto/imovel/moto/servicos) — não cita persona específica", () => {
		// O SPECIALIST_BASE_PROMPT é compartilhado. O bloco da regra NÃO pode
		// citar Rafael/Helena/Bruno/Camila — vale igualmente pras 4.
		const blocoMatch = SPECIALIST_BASE_PROMPT.match(
			/(experience[\s\S]{0,200}timeframe[\s\S]{0,200}lance|ANTES[\s\S]{0,400}(valor|parcela|carta)[\s\S]{0,600}experience[\s\S]{0,200}timeframe[\s\S]{0,200}lance)/i,
		);
		expect(
			blocoMatch,
			"Bloco com os 3 gates não encontrado — sem ele, asserção de bias " +
				"fica sem alvo. Fix do prompt deve adicionar bloco unificado.",
		).not.toBeNull();
		if (!blocoMatch) return;
		const bloco = blocoMatch[0].toLowerCase();
		const personas = ["rafael", "helena", "bruno", "camila"];
		const enviesadas = personas.filter((p) => bloco.includes(p));
		expect(
			enviesadas,
			"Bloco da regra cita persona específica: " +
				`${JSON.stringify(enviesadas)}. ` +
				"Regra vale pras 4 specialists igualmente — remova o nome.",
		).toEqual([]);
	});

	it("regra menciona o ponto de entrada (save_contact_name) — ordem temporal explícita", () => {
		// O fluxo correto é: save_contact_name → 3 gates → valor. Sem amarrar
		// ao save_contact_name, o agent pode pular gates noutros momentos.
		// Aceitamos qualquer das duas formulações: regra cita save_contact_name
		// próximo aos gates OU "apos nome" próximo aos gates.
		const ancoragem =
			/(save_contact_name|ap[óo]s.{0,20}nome|p[óo]s-nome)[\s\S]{0,800}(experience[\s\S]{0,200}timeframe[\s\S]{0,200}lance|3\s*gates|tr[êe]s gates)/i;
		expect(
			ancoragem.test(SPECIALIST_BASE_PROMPT),
			"Regra precisa amarrar ordem 'após save_contact_name → 3 gates → valor'. " +
				"Sem ancoragem ao save_contact_name, o agent pula gates em outros momentos do funil.",
		).toBe(true);
	});
});
