// OBSERVABILIDADE DO TURNO NO LANGFUSE — ligada só quando o dono liga, e nunca
// custando o turno.
//
// Quem faz o trabalho é o plugin oficial `@langfuse/pi-observability-plugin`
// (v0.1.2, pinado): ele escuta os hooks do Pi e escreve um trace por turno com
// uma `generation` por chamada ao modelo (tokens, custo, tempo até o primeiro
// token) e uma observação `tool` por execução de ferramenta. Nada aqui instrumenta
// nada à mão — este módulo só decide TRÊS coisas:
//
//  1. quando ligar (as três chaves presentes; nada de flag solta);
//  2. com que id de sessão (o `conversationId`, para uma conversa ser UMA sessão
//     no Langfuse em vez de um id novo por turno);
//  3. que falha de observabilidade não pode derrubar a fala do cliente.
//
// Medido no tarball da 0.1.2 em 27/10/2026, e é o que justifica o desenho:
//  · o plugin NÃO recebe opção nenhuma na factory (`export default function (pi:
//    ExtensionAPI)`, src/index.ts:442) — o `session_id` sai de
//    `ctx.sessionManager.getSessionId()` (src/index.ts:605), por isso o id tem de
//    entrar pelo `SessionManager`;
//  · `userId` sai do `process.env.LANGFUSE_USER_ID` lido no `loadConfig()` da
//    factory (src/index.ts:108,444) — ou seja, no momento em que a extensão é
//    carregada. É por aí que a identidade da pessoa entra: `comIdentidadeDoTurno`
//    põe o valor em volta do `loader.reload()` e tira depois;
//  · `LANGFUSE_TRACING_ENABLED` no PLUGIN só desliga no literal `"false"`
//    (src/index.ts:89), e sem chaves a factory registra um hook e sai
//    (src/index.ts:442-452). Aqui a régua é mais dura e é a do pedido: **a flag
//    tem de estar ligada** (`true`/`1`/`yes`/`on`) E as três chaves presentes.
//  · `PI_LANGFUSE_MAX_CHARS` é lido no LOAD do módulo (src/index.ts:29), então o
//    default tem de ser posto ANTES de o Pi carregar a extensão.

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** O ambiente como o módulo consome: só string (ou ausente) por chave.
 *  Não é `NodeJS.ProcessEnv` porque o `@types/node` marca `NODE_ENV` como
 *  obrigatório ali, e aí um ambiente de teste com só as três chaves do Langfuse
 *  não tipa — o que empurraria o teste para um `as` mentiroso. */
export type Ambiente = Record<string, string | undefined>;

/** O mínimo para o plugin falar com o Langfuse. */
export type ConfigDoLangfuse = {
	baseUrl: string;
	publicKey: string;
	secretKey: string;
	/** `dev`, `agents`, `production`… o que separa os traces no MESMO projeto. */
	environment?: string;
};

/** O system prompt do vendedor passa de 20 mil caracteres (medido em 27/10/2026),
 *  e o default do plugin (20.000) cortaria justamente o começo do input. 40 mil
 *  cobre o prompt inteiro e ainda impede que um resultado de ferramenta absurdo
 *  (extrato, lista de grupos) vire uma attribute gigante no Langfuse. */
export const MAX_CHARS_PADRAO = "40000";

function texto(valor: string | undefined): string | null {
	const limpo = valor?.trim();
	return limpo && limpo.length > 0 ? limpo : null;
}

/** As três chaves, do ambiente. `null` = observabilidade desligada.
 *
 *  Não existe "ligado pela metade": com duas das três, o plugin gastaria o turno
 *  montando spans que nunca saem. */
export function configDoLangfuse(env: Ambiente = process.env): ConfigDoLangfuse | null {
	// o plugin só desliga no literal "false" — então aqui a checagem é explícita
	// "Desligado por padrão" ao pé da letra: sem a flag, não liga — mesmo com as
	// três chaves presentes. O plugin sozinho faria o contrário (ele só entende o
	// literal "false" como desligado, `src/index.ts:89`), e um app que passa a
	// mandar trace por alguém ter exportado uma chave é um app que muda de
	// comportamento sem ninguém pedir.
	const flag = (env.LANGFUSE_TRACING_ENABLED ?? "").trim().toLowerCase();
	if (!["true", "1", "yes", "on"].includes(flag)) return null;

	const baseUrl = texto(env.LANGFUSE_BASE_URL);
	const publicKey = texto(env.LANGFUSE_PUBLIC_KEY);
	const secretKey = texto(env.LANGFUSE_SECRET_KEY);
	if (!baseUrl || !publicKey || !secretKey) return null;

	return {
		baseUrl,
		publicKey,
		secretKey,
		environment: texto(env.LANGFUSE_TRACING_ENVIRONMENT) ?? undefined,
	};
}

export function langfuseLigado(env: Ambiente = process.env): boolean {
	return configDoLangfuse(env) !== null;
}

/** O id de sessão que o Langfuse vai exibir — e o mesmo que o `SessionManager`
 *  aceita. A regra é a do Pi (`assertValidSessionId`, `session-manager.js:15-19`),
 *  porque ela LANÇA dentro do turno: id fora do formato tem de ser recusado AQUI,
 *  com o turno seguindo sem observabilidade, nunca estourando na cara do cliente.
 *
 *  O `conversations.id` é uuid (`src/db/schema.ts:400`) e passa; a guarda é para o
 *  dia em que alguém chamar isto com id de teste, slug de simulador ou string vazia. */
export function ehIdDeSessaoValido(id: string | null | undefined): id is string {
	if (typeof id !== "string" || id.length === 0) return false;
	return /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(id);
}

/** O caminho ABSOLUTO do fonte do plugin, ou `null` quando não há como achá-lo.
 *
 *  Por que caminho e não `import()`:
 *
 *  1. A 0.1.2 (a última publicada) **não declara `main`/`exports`** — o único
 *     entrypoint do `package.json` é `pi.extensions: ["./src/index.ts"]`, que é
 *     como o CLI carrega, e o que é publicado é TypeScript cru. Medido em
 *     27/10/2026: `import("pkg")` dá `ERR_MODULE_NOT_FOUND`, e o Node recusa o
 *     arquivo cru com `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.
 *  2. Com `import("pkg/src/index")` num `.ts` NOSSO, o `tsc` passa a checar o
 *     fonte do plugin e o build morre: `src/index.ts:606-608` lê `event.prompt` e
 *     `event.images` sem estreitar a variante `custom` de `before_agent_start`
 *     (o defeito #54 do plugin) — medido em `next build`, que falha em "Failed to
 *     type check" com o projeto já compilado.
 *  3. O Pi já sabe carregar extensão em TypeScript de um caminho: o
 *     `DefaultResourceLoader` aceita `additionalExtensionPaths` e passa por jiti
 *     (`core/extensions/loader.js:24,468-479`). Ou seja, o mesmo mecanismo que
 *     faz a Etapa 1 funcionar com `pi install -l`. Medido: 4-5 ms por sessão
 *     depois do primeiro carregamento (o primeiro paga ~53 ms), sem sair da
 *     máquina e sem o bundler no meio.
 *
 *  Consequência para a imagem: o pacote NÃO pode ser tratado como externo nem
 *  precisa ser transpilado; ele precisa EXISTIR em `node_modules` no runtime
 *  (ver `outputFileTracingIncludes` em `next.config.ts`). */
export function caminhoDoPluginDoLangfuse(env: Ambiente = process.env): string | null {
	if (!langfuseLigado(env)) return null;

	// o plugin lê isto no load do módulo (jiti carrega na primeira vez)
	env.PI_LANGFUSE_MAX_CHARS ??= MAX_CHARS_PADRAO;

	try {
		// `package.json` é o único subpath que resolve num pacote sem `exports`
		const raiz = dirname(
			createRequire(join(process.cwd(), "noop.js")).resolve(
				"@langfuse/pi-observability-plugin/package.json",
			),
		);
		const fonte = join(raiz, "src", "index.ts");
		if (!existsSync(fonte)) {
			console.error(`[langfuse] plugin sem src/index.ts em ${raiz} — turno segue sem trace`);
			return null;
		}
		return fonte;
	} catch (erro) {
		// Observabilidade é acessório: se o pacote não resolve (imagem sem a
		// dependência, instalação quebrada), o vendedor continua falando.
		console.error("[langfuse] plugin indisponível — turno segue sem trace:", erro);
		return null;
	}
}

/** A IDENTIDADE DA PESSOA no trace — a regra do `origin/main`, agora por sessão.
 *
 *  O plugin lê `process.env.LANGFUSE_USER_ID` **uma vez**, dentro do `loadConfig()`
 *  da factory (`src/index.ts:108,444`), no instante em que a extensão é carregada.
 *  Como cada turno monta a própria sessão (`loader.reload()` por turno em
 *  `sessao.ts`), dá para dar a cada conversa o seu `userId` — desde que ninguém
 *  troque a variável entre o "põe" e o "a factory leu".
 *
 *  É isso que esta fila garante: um turno de cada vez na janela
 *  `põe → reload → tira`. Ela custa o tempo de UM `loader.reload()` (medido: 4-5 ms
 *  com o jiti quente) e **só existe com a observabilidade ligada** — desligada,
 *  `comIdentidadeDoTurno` nem é chamada e o turno não passa por fila nenhuma.
 *
 *  As alternativas foram descartadas com motivo, não por gosto:
 *  · `defineProperty` com getter no `process.env` lendo um `AsyncLocalStorage`
 *    (que seria livre de fila) — o Node recusa: `ERR_INVALID_OBJECT_DEFINE_PROPERTY`;
 *  · deixar a env sem proteção — cria corrida entre conversas simultâneas, e
 *    atribuição ERRADA em observabilidade é pior que atribuição ausente, porque
 *    ninguém desconfia dela depois;
 *  · arquivo de config por sessão (`~/.pi/agent/langfuse.json`) — o caminho também
 *    é global (`getAgentDir()` lê `PI_CODING_AGENT_DIR` do processo), mesma corrida.
 *
 *  O que a fila NÃO é: fila do turno. `mkdtemp`, o `ModelRuntime` e o `prompt`
 *  ficam fora dela. */
let filaDaIdentidade: Promise<unknown> = Promise.resolve();

export async function comIdentidadeDoTurno<T>(
	userId: string | null | undefined,
	fn: () => Promise<T>,
): Promise<T> {
	const limpo = typeof userId === "string" ? userId.trim() : "";
	if (!limpo) return fn(); // sem identidade não há por que entrar na fila

	const anterior = filaDaIdentidade;
	let liberar!: () => void;
	filaDaIdentidade = new Promise<void>((resolver) => {
		liberar = resolver;
	});
	await anterior;

	const tinha = process.env.LANGFUSE_USER_ID;
	process.env.LANGFUSE_USER_ID = limpo;
	try {
		return await fn();
	} finally {
		// restaura o que existia: o operador pode ter posto o valor dele no ambiente
		if (tinha === undefined) delete process.env.LANGFUSE_USER_ID;
		else process.env.LANGFUSE_USER_ID = tinha;
		liberar();
	}
}

/** A regra de identidade do `origin/main` (`lib/observability/langfuse/turn.ts`):
 *  o `userId` é a chave estável da pessoa no canal — cookie `AJA_UID` na web
 *  (`waId` ausente), `wa:<telefone>` no WhatsApp — e, quando não existe nenhuma
 *  das duas, cai no `conversationId`. Nunca devolve vazio: um trace sem `userId`
 *  some do agrupamento por pessoa no Langfuse. */
export function userIdDoTurno(args: {
	userKey?: string | null;
	waId?: string | null;
	conversaId: string;
}): string {
	const chave = args.userKey?.trim();
	if (chave) return chave;
	const telefone = args.waId?.trim();
	if (telefone) return telefone.startsWith("wa:") ? telefone : `wa:${telefone}`;
	return args.conversaId;
}
