// "O prompt que o time revisa no repo é o que o modelo recebe?" — comparação
// determinística entre o texto do CÓDIGO e a versão com label `production` no
// Langfuse.
//
// ## Por que existe
//
// `fetchManagedPrompt` (./prompts.ts) busca a label `production` e só usa a
// constante do código como FALLBACK. Isso é ótimo — dá pra ajustar a fala sem
// deploy, e cada generation carrega a versão usada. E é exatamente por isso que
// o repo deixa de ser a fonte da verdade em produção: editar `system-prompt.ts`,
// commitar e deployar NÃO muda o agente enquanto ninguém publicar; e editar na
// UI muda o agente em ≤60s sem passar por review nenhum.
//
// Medido em produção em 2026-08-15: `aja-turn-analyzer` estava na v1 de 07/08
// enquanto o código, desde 14/08 (`3deb8207`), já trazia os exemplos que separam
// "200 por mês" (parcela) de "200 mil" (valor do bem). Ninguém foi avisado —
// nenhum teste, log ou alerta olhava para isso. A dívida não era o texto: era a
// ausência do sinal.
//
// Comparação é de TEXTO e não toca a rede: quem chama injeta o publicado
// (`scripts/prompts-check.ts` busca no Langfuse). Assim isto roda no gate de
// teste sem depender de instância de pé.

export type PromptDrift =
	| { status: "em-dia"; name: string; version: number }
	| {
			status: "divergente";
			name: string;
			version: number;
			/** Linhas que existem no CÓDIGO e não no publicado — o fix que não subiu. */
			faltamEmProducao: string[];
			/** Linhas só no publicado — texto editado direto na UI, sem review. */
			sobramEmProducao: string[];
	  }
	| { status: "nao-publicado"; name: string };

/**
 * Espaço no fim da linha e quebra final não são conteúdo: publicar por REST e
 * ler de volta pode normalizá-los. Divergir por isso seria alarme falso — e
 * alarme falso ensina todo mundo a ignorar o alarme.
 */
function normalizar(texto: string): string[] {
	return texto
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((l) => l.trimEnd())
		.join("\n")
		.replace(/\n+$/, "")
		.split("\n");
}

export function compararPromptPublicado(args: {
	name: string;
	textoDoCodigo: string;
	publicado: { text: string; version: number } | null;
}): PromptDrift {
	const { name, textoDoCodigo, publicado } = args;

	// Sem publicação o app roda pelo fallback — que é o texto CERTO, mas sem
	// versão linkada na generation e com a próxima publicação passando a valer
	// sem ninguém notar. É estado a reportar, não sucesso.
	if (!publicado) return { status: "nao-publicado", name };

	const codigo = normalizar(textoDoCodigo);
	const prod = normalizar(publicado.text);

	if (codigo.join("\n") === prod.join("\n")) {
		return { status: "em-dia", name, version: publicado.version };
	}

	// Diferença por CONJUNTO de linhas, não por posição: mover um parágrafo não
	// deve inundar o relatório e esconder a linha que realmente sumiu.
	const setProd = new Set(prod);
	const setCodigo = new Set(codigo);
	return {
		status: "divergente",
		name,
		version: publicado.version,
		faltamEmProducao: codigo.filter((l) => l.trim() !== "" && !setProd.has(l)),
		sobramEmProducao: prod.filter((l) => l.trim() !== "" && !setCodigo.has(l)),
	};
}

/** Quantas linhas divergentes mostrar por prompt antes de resumir. */
const MAX_LINHAS_NO_RELATORIO = 8;

export function resumoDeDrift(drifts: PromptDrift[]): { ok: boolean; texto: string } {
	const problemas = drifts.filter((d) => d.status !== "em-dia");

	if (problemas.length === 0) {
		const nomes = drifts.map((d) => `${d.name} (v${"version" in d ? d.version : "?"})`);
		return { ok: true, texto: `Prompts em dia com o código: ${nomes.join(", ")}.` };
	}

	const linhas: string[] = ["Prompt publicado diferente do código — produção NÃO roda o repo.\n"];

	for (const d of problemas) {
		if (d.status === "nao-publicado") {
			linhas.push(
				`✗ ${d.name}: nunca publicado. O app roda pelo fallback do código, sem versão linkada.`,
			);
			continue;
		}
		if (d.status !== "divergente") continue;
		linhas.push(`✗ ${d.name} (produção está na v${d.version}):`);
		if (d.faltamEmProducao.length > 0) {
			linhas.push(`  Está no código e NÃO em produção (${d.faltamEmProducao.length} linha(s)):`);
			for (const l of d.faltamEmProducao.slice(0, MAX_LINHAS_NO_RELATORIO)) linhas.push(`    ${l}`);
			if (d.faltamEmProducao.length > MAX_LINHAS_NO_RELATORIO) {
				linhas.push(`    … e mais ${d.faltamEmProducao.length - MAX_LINHAS_NO_RELATORIO}.`);
			}
		}
		if (d.sobramEmProducao.length > 0) {
			linhas.push(
				`  Só em produção — provavelmente editado na UI, sem review (${d.sobramEmProducao.length} linha(s)):`,
			);
			for (const l of d.sobramEmProducao.slice(0, MAX_LINHAS_NO_RELATORIO)) linhas.push(`    ${l}`);
			if (d.sobramEmProducao.length > MAX_LINHAS_NO_RELATORIO) {
				linhas.push(`    … e mais ${d.sobramEmProducao.length - MAX_LINHAS_NO_RELATORIO}.`);
			}
		}
	}

	linhas.push(
		"\nConserto: `pnpm sync-prompts` apontado para a instância certa (o .env.local costuma",
	);
	linhas.push(
		"apontar para a local, e o SDK é no-op por design — sincronizar a instância errada termina",
	);
	linhas.push('com "ok" sem ter escrito nada onde importa).');

	return { ok: false, texto: linhas.join("\n") };
}

/**
 * O sinal de RUNTIME — a direção que o CI não alcança.
 *
 * `pnpm prompts:check` no CI responde "o código mudou e ninguém publicou?". Ele
 * não vê o caminho inverso: alguém edita o texto na UI do Langfuse **depois** do
 * último run, e o agente em produção muda em ≤60s, sem deploy e sem review.
 *
 * Quem enxerga as duas direções o tempo todo é o runtime, porque
 * `fetchManagedPrompt` tem, em todo turno, o texto publicado E a constante do
 * código na mão. Comparar ali custa uma comparação de string.
 *
 * Devolve o score a publicar, ou `null` quando está tudo em dia — o caminho
 * normal precisa ser silencioso, senão vira ruído e alguém desliga.
 */
export function scoreDeDesyncEmRuntime(
	name: string,
	textoPublicado: string,
	textoDoCodigo: string,
): { name: string; value: string; dataType: "CATEGORICAL"; comment: string } | null {
	if (normalizar(textoPublicado).join("\n") === normalizar(textoDoCodigo).join("\n")) return null;
	return {
		name: "prompt_desync",
		value: name,
		dataType: "CATEGORICAL",
		comment:
			`O texto com label 'production' difere da constante do código para '${name}'. ` +
			"O modelo está recebendo o publicado; o repo é só fallback. " +
			"Rode `pnpm prompts:check` para ver a diferença.",
	};
}
