// O ACEITE DA LGPD É FATO, NÃO AFIRMAÇÃO DO MODELO.
//
// O aviso vale UMA vez na conversa: se foi dito em qualquer turno, não se repete.
// Um "sim / pode / pode usar" do cliente DEPOIS do aviso é o aceite, conferido no
// histórico pelo servidor — não no `aceiteLgpd: true` que o modelo manda.
//
// Medido na conversa 92dfa1ba (dev, 25/10/2026): aviso dado dois turnos antes, no
// meio o agente pediu o celular. O check antigo olhava só a ÚLTIMA fala do agente,
// não achava o aviso, a tool recusava, o modelo repetia o aviso e o texto do turno
// saía duplicado. Este módulo é o que fecha isso.

export const AVISO_LGPD_RE = /bir[oô]s?\s+de\s+cr[eé]dito|conforme a\s+lgpd/i;

/** As palavras canônicas do aviso (mesma texto da skill `proposta-com-dados-do-cliente`). */
export const AVISO_LGPD =
	"Para gerar a sua proposta, a administradora consulta seu CPF nos birôs de crédito e usa seus dados só para isso, conforme a LGPD. Posso seguir?";

/** O pedido de dado pessoal — CPF ou celular — que NÃO pode vir antes do aviso. */
export const PEDE_DADO_RE = /\b(cpf|celular|telefone|whatsapp)\b/i;

export type ResultadoDoAviso = {
	/** O texto que sai no balão: o aviso vem ANTES do pedido de dado. */
	texto: string;
	/** true quando o aviso foi acrescentado pelo harness (não pelo modelo). */
	avisoAdicionado: boolean;
	/** O pedido de dado da fala é adiado pro turno seguinte — o aceite vem primeiro. */
	pedidoAdiado: boolean;
};

/**
 * O AVISO VEM ANTES DO PEDIDO DE DADO — decidido no HARNESS, não no prompt.
 *
 * Se o aviso ainda não foi dado na conversa e a fala pede CPF ou celular, o aviso
 * ocupa a mensagem e o pedido de dado fica para depois do aceite. Frases que não
 * são o pedido continuam (acolhimento, explicação) — não se joga a fala fora.
 */
export function garanteAvisoLgpd(args: { texto: string; avisoJaDado: boolean }): ResultadoDoAviso {
	const texto = args.texto.trim();
	if (args.avisoJaDado) return { texto, avisoAdicionado: false, pedidoAdiado: false };
	if (!PEDE_DADO_RE.test(texto)) return { texto, avisoAdicionado: false, pedidoAdiado: false };

	const frases = texto.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
	const pediu = frases.some((f) => PEDE_DADO_RE.test(f));
	// O `resto` é só o que NÃO é pedido e NÃO é pergunta: se a pergunta sobrevive, o balão
	// sai com duas perguntas (a do aviso e a que o modelo escreveu), e o cliente responde a
	// errada.
	const resto = frases
		.filter((f) => !PEDE_DADO_RE.test(f) && !/[?!]\s*$/.test(f))
		.join(" ")
		.trim();
	// O aviso vem ANTES do resto: no dev o modelo escrevia "preciso do seu CPF. Para gerar
	// sua proposta, ... conforme a LGPD. Posso seguir?" — o pedido vinha na frente do aviso,
	// e o cliente respondia o pedido sem ter aceite nada.
	const saida = resto ? `${AVISO_LGPD}\n\n${resto}` : AVISO_LGPD;
	return { texto: saida, avisoAdicionado: true, pedidoAdiado: pediu };
}

/** Resposta afirmativa do cliente. Negativa não vale ("não pode", "não autorizo"). */
export function clienteAceitouLgpd(texto: string): boolean {
	const re =
		/\b(sim|pode|podes|podem|posso|aceito|autorizo|autorizado|confirmo|claro|ok|beleza|de acordo)\b/gi;
	for (const m of texto.matchAll(re)) {
		const antes = texto.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
		if (/(n[ãa]o|negativo|jamais)\s*$/.test(antes)) continue;
		return true;
	}
	return false;
}

export type FalaDeLgpd = { role: "user" | "assistant"; content: string };

export type ResultadoDoAceite = {
	ok: boolean;
	/** `aceite-ja-registrado` | `aceite-do-cliente` | `aviso-nao-dado` | `falta-o-aceite` */
	motivo: string;
};

/**
 * O servidor resolve o aceite olhando a CONVERSAA, não a última fala.
 *
 * `falaDoCliente` e `textoDoTurno` são o turno em curso (ainda não persistido):
 * o aviso dado nesta mesma fala conta, e a fala do cliente deste turno também.
 */
export function resolverAceiteLgpd(args: {
	falas: readonly FalaDeLgpd[];
	falaDoCliente?: string | null;
	textoDoTurno?: string;
	aceiteJaGravado?: { em: string; fala: string } | null;
}): ResultadoDoAceite {
	if (args.aceiteJaGravado) return { ok: true, motivo: "aceite-ja-registrado" };

	const linha: FalaDeLgpd[] = [...args.falas];
	if (args.falaDoCliente) linha.push({ role: "user", content: args.falaDoCliente });
	if (args.textoDoTurno) linha.push({ role: "assistant", content: args.textoDoTurno });

	let avisoEm = -1;
	for (let i = 0; i < linha.length; i++) {
		if (linha[i].role === "assistant" && AVISO_LGPD_RE.test(linha[i].content)) avisoEm = i;
	}
	if (avisoEm < 0) return { ok: false, motivo: "aviso-nao-dado" };

	for (let i = avisoEm; i < linha.length; i++) {
		if (linha[i].role === "user" && clienteAceitouLgpd(linha[i].content)) {
			return { ok: true, motivo: "aceite-do-cliente" };
		}
	}
	return { ok: false, motivo: "falta-o-aceite" };
}
