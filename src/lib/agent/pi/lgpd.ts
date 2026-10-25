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
