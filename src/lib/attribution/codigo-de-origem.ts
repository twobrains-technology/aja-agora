// src/lib/attribution/codigo-de-origem.ts
//
// O furo que este módulo fecha (item A3 do plano de 30/08/2026).
//
// O botão flutuante do WhatsApp leva para FORA do site. É a decisão certa — a
// conversa que continua no telefone sobrevive ao fechar da aba, e é lá que o
// atendente humano assume —, mas ela custava a origem: um link `wa.me` não
// carrega cookie, não carrega UTM, não carrega `fbclid`. Quem convertia por ali
// chegava ao WhatsApp como visitante do nada.
//
// **O tamanho do buraco, medido em produção (18–30/08):** 86 toques no botão,
// de 58 visitantes distintos. No mesmo período nasceram 6 conversas de
// WhatsApp — e **as 6 com `visit_id` nulo**. Nenhuma delas entrava no
// denominador de "origem conhecida" sobre o qual a planilha inteira calculou
// `%Conv Chat = 1,68%`. Aquele número é PISO, não taxa, e todo o modelo de
// investimento (R$ 84 mil a R$ 616 mil/mês) foi construído em cima dele.
//
// ── Por que o código vai no TEXTO ───────────────────────────────────────────
//
// Porque não há outro canal. A Meta entrega origem no webhook em
// `messages[].referral` (é o que `referral.ts` lê), mas **só para clique em
// anúncio Click-to-WhatsApp**. Link `wa.me` orgânico não produz `referral`
// nenhum: o único bit que atravessa a fronteira é o `?text=` que a pessoa vai
// enviar. Então o carimbo vive ali, curto e discreto, no fim da fala.
//
// ── Por que hexadecimal do próprio UUID, e não um código sorteado ───────────
//
// Sorteio exigiria uma coluna nova, um backfill e um ponto de escrita a mais no
// caminho crítico da visita. O prefixo do UUID que a visita JÁ tem é
// derivável dos dois lados sem combinar nada: o cliente calcula do cookie, o
// servidor procura por `left(id::text, 8)` num índice de expressão. Funciona
// retroativamente para toda visita que já existe, e desligar é parar de
// carimbar — não reverter migration.
//
// 32 bits dão 4,3 bilhões de valores. Com o volume desta operação (~4,5 mil
// visitas/mês) a chance de dois códigos iguais na janela de 24h é desprezível,
// e mesmo assim a resolução devolve a visita MAIS RECENTE: colisão viraria
// atribuição errada de uma conversa, nunca dado trocado de cliente.

/** Quantos caracteres do UUID entram no código. Ver o cabeçalho. */
const TAMANHO = 8;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Só o formato — quem valida se existe é o banco. */
const CODIGO_RE = new RegExp(`^[0-9a-f]{${TAMANHO}}$`, "i");

/**
 * O código de uma visita, ou `null` quando o id não é um UUID.
 *
 * Devolve `null` em vez de lançar porque o chamador é o botão flutuante: um id
 * estranho no cookie tem que custar a atribuição daquele toque, nunca o toque.
 */
export function codigoDaVisita(visitId: string | null | undefined): string | null {
	if (!visitId || !UUID_RE.test(visitId)) return null;
	return visitId.slice(0, TAMANHO).toLowerCase();
}

/**
 * A fala do cliente, carimbada.
 *
 * `(ref a1b2c3d4)` — sufixo entre parênteses, no fim (decisão do Kairo,
 * 30/08/2026). É o formato que o brasileiro já viu em protocolo de atendimento:
 * quem lê ignora, e quem precisar conferir enxerga. Sem código, devolve a fala
 * intacta — o cliente nunca fica com um "(ref )" pendurado porque o cookie
 * expirou.
 */
export function carimbarOrigem(fala: string, codigo: string | null | undefined): string {
	const limpo = fala.trim();
	if (!codigo || !CODIGO_RE.test(codigo)) return limpo;
	return `${limpo} (ref ${codigo.toLowerCase()})`;
}

/**
 * Lê o código de uma mensagem que chegou pelo WhatsApp.
 *
 * Tolerante de propósito, porque entre o nosso `?text=` e o webhook passa o
 * teclado da pessoa: ela pode ter escrito antes, escrito depois, apagado um
 * pedaço da frase, ou o WhatsApp pode ter quebrado a linha. O que não é
 * tolerado é o formato do código em si — 8 hexadecimais, nada além —, senão
 * qualquer parêntese na conversa viraria uma tentativa de atribuição.
 *
 * A ÚLTIMA ocorrência vence: se a pessoa colar duas falas carimbadas, a mais
 * recente é a que descreve como ela chegou agora.
 */
export function extrairCodigoDeOrigem(texto: string | null | undefined): string | null {
	if (!texto) return null;
	const achados = texto.matchAll(new RegExp(`\\(\\s*ref\\s+([0-9a-f]{${TAMANHO}})\\s*\\)`, "gi"));
	let ultimo: string | null = null;
	for (const achado of achados) ultimo = achado[1].toLowerCase();
	return ultimo;
}

/**
 * A fala sem o carimbo — o que o CLIENTE realmente disse.
 *
 * Existe porque o texto inbound é persistido como fala do cliente e relido pelo
 * modelo nos turnos seguintes. Deixar o `(ref a1b2c3d4)` no histórico ensinaria
 * o agente a tratar o código como parte do pedido — a mesma classe de defeito
 * do "botão do card vira mentira do servidor", só que vinda do nosso próprio
 * link.
 */
export function removerCarimbo(texto: string): string {
	return texto
		.replace(new RegExp(`\\(\\s*ref\\s+[0-9a-f]{${TAMANHO}}\\s*\\)`, "gi"), "")
		.replace(/[ \t]{2,}/g, " ")
		.trim();
}

/** O cookie espelho, legível por JS, que leva o código até quem carimba.
 *
 *  O `aja_visit` é `httpOnly` — e continua sendo, porque ele é a âncora da
 *  visita. Este aqui carrega só o prefixo público do id, que é exatamente o
 *  que vai virar texto visível na tela do cliente daqui a um toque. */
export const COOKIE_CODIGO = "aja_ref";

/**
 * O código da visita corrente, do lado do cliente.
 *
 * Dois lugares carimbam — o botão flutuante do site e o card de handoff do
 * fecho — e os dois precisam ler o MESMO cookie do MESMO jeito. Uma cópia da
 * regex em cada um seria a duplicação que só aparece no dia em que o nome do
 * cookie mudar e um dos dois continuar carimbando nada.
 *
 * Devolve `null` no servidor, o que faz `carimbarOrigem` devolver a fala
 * intacta — SSR e primeira renderização do cliente montam o mesmo link, sem
 * erro de hidratação.
 */
export function lerCodigoDeOrigemDoCookie(): string | null {
	if (typeof document === "undefined") return null;
	const achado = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_CODIGO}=([^;]*)`));
	if (!achado) return null;
	const valor = decodeURIComponent(achado[1]);
	return CODIGO_RE.test(valor) ? valor.toLowerCase() : null;
}
