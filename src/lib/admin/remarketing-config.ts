/**
 * O CADASTRO DA DINÂMICA DO REMARKETING — a régua que se ajusta sem deploy.
 *
 * Os oito números que governam a régua nasceram constantes em
 * `src/lib/remarketing/regua.ts`. A tabela `remarketing_config` (migration
 * 0056) existe para que o dono do produto possa mudá-los — o intervalo do
 * segundo toque, o teto de 30 dias, a hora em que a régua acorda — em tela, sem
 * passar por review de código.
 *
 * ── A única decisão de desenho, e ela não se inverte ────────────────────────
 *
 * **O código é o padrão; o banco é o ajuste.** Linha ausente = constante de
 * `PARAMETROS_DE_FABRICA`. É isso que faz a tabela nascer VAZIA sem mudar
 * comportamento nenhum, e é isso que torna o cadastro reversível: apagar a
 * linha volta ao padrão de fábrica, sem migration e sem deploy.
 *
 * ── Por que o valor corrompido cai no padrão, e nunca em "dispara mais" ─────
 *
 * A régua manda mensagem de verdade. Um `tetos` cadastrado como texto, ou como
 * 100 no lugar de 3, mandaria toque para quem já pediu para sair — o dano que a
 * Meta pune e o cliente sente. Por isso todo valor passa por `normalizarParametros`
 * (faixa + inteiro + janela de horário coerente) antes de chegar ao motor: valor
 * que não vence a validação é IGNORADO e vale a fábrica. O viés é sempre o mesmo:
 * na dúvida, menos toque.
 *
 * ── Onde isto entra no motor ────────────────────────────────────────────────
 *
 * A régua continua PURA (não lê banco). Quem lê o cadastro é este arquivo, e o
 * ciclo passa o objeto por `EntradaDoMotor.parametros`. Este módulo é
 * server-only: importa `@/db`.
 */

import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { remarketingConfig } from "@/db/schema";
import {
	CAMPOS_DOS_PARAMETROS,
	LIMITES_DOS_PARAMETROS,
	normalizarParametros,
	PARAMETROS_DE_FABRICA,
	type ParametrosRegua,
} from "@/lib/remarketing/regua";

const MINUTO_MS = 60_000;
const DIA_MS = 24 * 60 * MINUTO_MS;

/** A unidade em que a tela mostra e o usuário digita. */
export type UnidadeDoParametro = "minutos" | "dias" | "toques" | "horas";

export const ROTULO_DA_UNIDADE: Record<UnidadeDoParametro, string> = {
	minutos: "minutos",
	dias: "dias",
	toques: "toques",
	horas: "h",
};

/**
 * A ficha de um parâmetro: como ele se chama na tela, o que significa, em que
 * unidade se digita e como isso vira o número que o motor usa.
 *
 * `chave` é exatamente a coluna `remarketing_config.chave` — texto estável, sem
 * acento, porque é dado de banco (a `descricao` é que é humano).
 */
export interface DefinicaoDeParametro {
	chave: string;
	campo: keyof ParametrosRegua;
	rotulo: string;
	descricao: string;
	unidade: UnidadeDoParametro;
	/** O valor que o usuário digita (unidade da tela) → o valor do motor. */
	paraMotor(valor: number): number;
	/** O valor do motor → o número que o formulário mostra. */
	daMotor(valor: number): number;
}

const identidade = (valor: number) => valor;
const emMinutos = (valor: number) => valor * MINUTO_MS;
const emDias = (valor: number) => valor * DIA_MS;

/**
 * Os oito parâmetros do cadastro, na ordem em que a tela os apresenta.
 *
 * As unidades são as HUMANAS (minutos, dias, horas) — o banco guarda o número
 * que o dono digitou, não "5400000". Quem traduz para a unidade do motor é
 * `paraMotor`, e é só aqui que essa tradução mora: a tela e o motor nunca
 * discordam porque existe uma fonte só.
 */
export const PARAMETROS_DO_CADASTRO: readonly DefinicaoDeParametro[] = [
	{
		chave: "espera_silencio_minutos",
		campo: "esperaSilencioMs",
		rotulo: "Silêncio que abre o toque 01",
		descricao:
			"Quanto tempo a pessoa precisa ficar sem responder para a régua entrar com o primeiro toque.",
		unidade: "minutos",
		paraMotor: emMinutos,
		daMotor: (valor) => valor / MINUTO_MS,
	},
	{
		chave: "dias_ate_segundo_toque",
		campo: "diasAteSegundoToque",
		rotulo: "Intervalo até o toque 02",
		descricao: "Quantos dias depois do toque 01 a régua manda o toque 02.",
		unidade: "dias",
		paraMotor: identidade,
		daMotor: identidade,
	},
	{
		chave: "dias_ate_terceiro_toque",
		campo: "diasAteTerceiroToque",
		rotulo: "Intervalo até o toque 03",
		descricao: "Quantos dias depois do toque 02 a régua manda o toque 03.",
		unidade: "dias",
		paraMotor: identidade,
		daMotor: identidade,
	},
	{
		chave: "max_toques",
		campo: "maxToques",
		rotulo: "Toques por sequência",
		descricao: "Quantos toques a sequência tem antes de se esgotar.",
		unidade: "toques",
		paraMotor: identidade,
		daMotor: identidade,
	},
	{
		chave: "teto_toques_30_dias",
		campo: "tetoToques30Dias",
		rotulo: "Teto por pessoa na janela",
		descricao:
			"Máximo de toques que uma pessoa pode receber dentro da janela, contando entre campanhas.",
		unidade: "toques",
		paraMotor: identidade,
		daMotor: identidade,
	},
	{
		chave: "janela_do_teto_dias",
		campo: "janelaDoTetoMs",
		rotulo: "A janela do teto",
		descricao: "Por quantos dias um toque continua contando contra o teto da pessoa.",
		unidade: "dias",
		paraMotor: emDias,
		daMotor: (valor) => valor / DIA_MS,
	},
	{
		chave: "hora_abertura",
		campo: "horaAbertura",
		rotulo: "Hora em que a régua acorda",
		descricao: "A partir desta hora a régua pode disparar (fuso do negócio).",
		unidade: "horas",
		paraMotor: identidade,
		daMotor: identidade,
	},
	{
		chave: "hora_fechamento",
		campo: "horaFechamento",
		rotulo: "Hora em que a régua para",
		descricao: "A partir desta hora a régua não dispara mais (a hora do fim é exclusiva).",
		unidade: "horas",
		paraMotor: identidade,
		daMotor: identidade,
	},
];

const POR_CHAVE = new Map(PARAMETROS_DO_CADASTRO.map((def) => [def.chave, def]));

/** A faixa aceita NA UNIDADE DA TELA — o que o `<input>` deve mostrar. */
export function limiteNaTela(def: DefinicaoDeParametro): { minimo: number; maximo: number } {
	const faixa = LIMITES_DOS_PARAMETROS[def.campo];
	return { minimo: def.daMotor(faixa.minimo), maximo: def.daMotor(faixa.maximo) };
}

// ─── A leitura (pura) ───────────────────────────────────────────────────────

/** A linha crua de `remarketing_config`, como vem do banco. */
export interface LinhaDoCadastro {
	chave: string;
	valor: string | null;
}

/** De onde o valor vigente veio. */
export type OrigemDoValor = "cadastro" | "fabrica";

export interface ParametroVigente {
	chave: string;
	campo: keyof ParametrosRegua;
	rotulo: string;
	descricao: string;
	unidade: UnidadeDoParametro;
	/** O valor vigente NA UNIDADE DA TELA. */
	valor: number;
	/** O rótulo da unidade, já em português ("minutos", "dias", "toques", "h"). */
	unidadeRotulo: string;
	/** A faixa aceita NA UNIDADE DA TELA — o que o formulário pode oferecer. */
	minimo: number;
	maximo: number;
	origem: OrigemDoValor;
	/**
	 * O texto que ficou no banco e foi RECUSADO (texto onde se espera número,
	 * ou número fora da faixa). Não é decoração: a tela avisa que existe um
	 * ajuste gravado que o motor está ignorando.
	 */
	valorInvalido: string | null;
}

export interface LeituraDoCadastro {
	/** O que o motor usa — sempre válido, sempre completo. */
	parametros: ParametrosRegua;
	/** O que a tela mostra, com a origem de cada valor. */
	vigentes: ParametroVigente[];
}

/** "  90 " → 90; "90.5", "noventa" e "" → null. Só inteiro, só positivo. */
function numeroInteiro(bruto: string): number | null {
	const texto = bruto.trim();
	if (!/^\d+$/.test(texto)) return null;
	const numero = Number(texto);
	return Number.isSafeInteger(numero) ? numero : null;
}

/**
 * Monta a leitura a partir das linhas do banco — SEM I/O, para que os três
 * casos que importam (sem linha, com linha, linha corrompida) sejam provados em
 * teste sem Postgres.
 */
export function montarLeitura(linhas: readonly LinhaDoCadastro[]): LeituraDoCadastro {
	const gravados = new Map<string, string>();
	for (const linha of linhas) {
		if (linha.valor !== null) gravados.set(linha.chave, linha.valor);
	}

	const candidatos: Partial<ParametrosRegua> = {};
	for (const def of PARAMETROS_DO_CADASTRO) {
		const bruto = gravados.get(def.chave);
		if (bruto === undefined) continue;
		const numero = numeroInteiro(bruto);
		if (numero === null) continue;
		candidatos[def.campo] = def.paraMotor(numero);
	}

	// A peneira final: faixa, inteiro e janela de horário coerente. O que não
	// passar aqui simplesmente não vira ajuste.
	const parametros = normalizarParametros(candidatos);

	const vigentes = PARAMETROS_DO_CADASTRO.map((def): ParametroVigente => {
		const candidato = candidatos[def.campo];
		const usouCadastro = candidato !== undefined && parametros[def.campo] === candidato;
		const bruto = gravados.get(def.chave);

		return {
			chave: def.chave,
			campo: def.campo,
			rotulo: def.rotulo,
			descricao: def.descricao,
			unidade: def.unidade,
			valor: def.daMotor(parametros[def.campo]),
			unidadeRotulo: ROTULO_DA_UNIDADE[def.unidade],
			...limiteNaTela(def),
			origem: usouCadastro ? "cadastro" : "fabrica",
			valorInvalido: !usouCadastro && bruto !== undefined ? bruto : null,
		};
	});

	return { parametros, vigentes };
}

/** Lê `remarketing_config` inteira e devolve a leitura montada. Server-only. */
export async function lerCadastroDoRemarketing(): Promise<LeituraDoCadastro> {
	const linhas = await db
		.select({ chave: remarketingConfig.chave, valor: remarketingConfig.valor })
		.from(remarketingConfig);

	return montarLeitura(linhas);
}

/**
 * Os parâmetros vigentes, prontos para o motor. É o que o ciclo chama — a régua
 * continua pura, o banco não vaza para dentro dela.
 */
export async function lerParametrosRegua(): Promise<ParametrosRegua> {
	const { parametros } = await lerCadastroDoRemarketing();
	return parametros;
}

// ─── A escrita (validação pura + gravação) ──────────────────────────────────

export interface EntradaDoCadastro {
	chave: string;
	valor: string;
}

export interface ValidacaoDoCadastro {
	/** Mensagem por chave, em português — o que a tela mostra sob o campo. */
	erros: Record<string, string>;
	/** Valores aceitos, já normalizados, prontos para gravar. */
	valores: { chave: string; valor: string }[];
	/** Chaves cujo valor foi esvaziado: a linha sai e vale a fábrica de novo. */
	remocoes: string[];
}

/**
 * Valida o que a tela mandou — e RECUSA o que o motor não pode ler.
 *
 * Um valor inválido não é salvo "para depois": ele é recusado com mensagem
 * clara, porque o que fica no banco é o que a régua vai ler. Campo vazio, por
 * outro lado, não é erro: é o comando de voltar ao padrão de fábrica.
 *
 * `atuais` entra para julgar o par de horário junto com o que já está valendo —
 * subir só a abertura para 22h com o fechamento em 20h precisa ser recusado
 * aqui, não descoberto semanas depois com a régua muda à noite.
 */
export function validarEntradas(
	entradas: readonly EntradaDoCadastro[],
	atuais: ParametrosRegua = PARAMETROS_DE_FABRICA,
): ValidacaoDoCadastro {
	const erros: Record<string, string> = {};
	const valores: { chave: string; valor: string }[] = [];
	const remocoes: string[] = [];
	const candidatos: Partial<ParametrosRegua> = {};

	for (const entrada of entradas) {
		const def = POR_CHAVE.get(entrada.chave);
		if (!def) {
			erros[entrada.chave] = "Parâmetro desconhecido.";
			continue;
		}

		const texto = String(entrada.valor ?? "").trim();
		if (texto === "") {
			remocoes.push(def.chave);
			continue;
		}

		const numero = numeroInteiro(texto);
		if (numero === null) {
			erros[def.chave] = "Use apenas números inteiros (sem ponto ou vírgula).";
			continue;
		}

		const { minimo, maximo } = limiteNaTela(def);
		if (numero < minimo || numero > maximo) {
			erros[def.chave] =
				`O valor precisa ficar entre ${minimo} e ${maximo} ${ROTULO_DA_UNIDADE[def.unidade]}.`;
			continue;
		}

		candidatos[def.campo] = def.paraMotor(numero);
		valores.push({ chave: def.chave, valor: String(numero) });
	}

	// O par de horário: valores cada um dentro da faixa, mas invertidos, fazem a
	// janela virar nada. A validação final é a MESMA que o motor usa.
	if (Object.keys(erros).length === 0) {
		const mesclado = normalizarParametros({ ...atuais, ...candidatos });
		for (const { chave } of valores) {
			const def = POR_CHAVE.get(chave);
			if (!def) continue;
			if (mesclado[def.campo] !== candidatos[def.campo]) {
				erros[chave] = "A hora de abertura precisa ser antes da hora de fechamento.";
			}
		}
	}

	return { erros, valores, remocoes };
}

/**
 * Grava o cadastro. Recebe o que já passou por `validarEntradas`.
 *
 * Escreve TUDO numa transação: um cadastro pela metade (metade do par de
 * horário gravado) é pior que cadastro nenhum, e o motor lê o banco a cada
 * ciclo.
 */
export async function gravarCadastro(
	validacao: Pick<ValidacaoDoCadastro, "valores" | "remocoes">,
	atualizadoPor: string,
): Promise<LeituraDoCadastro> {
	const agora = new Date();

	await db.transaction(async (tx) => {
		if (validacao.remocoes.length > 0) {
			await tx
				.delete(remarketingConfig)
				.where(inArray(remarketingConfig.chave, validacao.remocoes));
		}

		for (const { chave, valor } of validacao.valores) {
			await tx
				.insert(remarketingConfig)
				.values({ chave, valor, atualizadoPor, atualizadoEm: agora })
				.onConflictDoUpdate({
					target: remarketingConfig.chave,
					set: { valor, atualizadoPor, atualizadoEm: agora },
				});
		}
	});

	return lerCadastroDoRemarketing();
}

/** Os campos na ordem canônica da régua — usado pelo teste de completude. */
export const CAMPOS_COM_CADASTRO: readonly (keyof ParametrosRegua)[] = CAMPOS_DOS_PARAMETROS;

/**
 * O banco pode guardar linha de chave que o código não conhece mais (chave
 * renomeada, parâmetro extinto). Elas não entram na leitura — e este helper
 * existe para o teste travar que o cadastro e a fábrica cobrem os mesmos campos.
 */
export function chaveDoCampo(campo: keyof ParametrosRegua): string | null {
	return PARAMETROS_DO_CADASTRO.find((def) => def.campo === campo)?.chave ?? null;
}
