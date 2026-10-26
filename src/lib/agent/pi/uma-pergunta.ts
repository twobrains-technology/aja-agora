// UMA PERGUNTA POR MENSAGEM — o verificador do texto final de cada trecho.
//
// Decisão de 25/10/2026: o prompt sozinho não segura o modelo (duas perguntas na
// mesma fala, medido no dev em 6 turnos). O harness confere o texto pronto e, se
// houver mais de uma pergunta, mantém só a ÚLTIMA e preserva o resto da fala
// (acolhimento, explicação). Não é regra de conversa: é o contrato da UI.
//
// Pergunta = frase terminada em `?` fora de aspas. Citação entre aspas não conta.

/** Substitui o miolo de trechos entre aspas por espaços do mesmo tamanho, para
 * que um `?` citado não seja contado e os índices continuem valendo. */
function semCitacoes(texto: string): string {
	return texto.replace(/(["“«])[^"”»\n]*\1|“[^”\n]*”|«[^»\n]*»/g, (m) => " ".repeat(m.length));
}

export function contarPerguntas(texto: string): number {
	return (semCitacoes(texto).match(/\?+(?=\s|$|[*_)\]])/g) ?? []).length;
}

/** Mantém só a última pergunta; frases que não são pergunta ficam. */
export function manterUmaPergunta(texto: string): string {
	if (contarPerguntas(texto) <= 1) return texto;
	const limpo = semCitacoes(texto);
	// Frases: do fim da anterior até o `?`/`.`/`!`/quebra de linha dupla.
	// Ponto, vírgula e ponto e vírgula DENTRO de um número não fecham frase: em "R$ 1.010"
	// o ponto é separador de milhar, e a frase inteira se perdia (achado F3 no dev). É o
	// mesmo critério de `trechosDe` em `turno-livre.ts`, replicado aqui para não criar ciclo.
	const trechos: Array<{ ini: number; fim: number; pergunta: boolean }> = [];
	const re = /(?:(?:[^.!?\n]|(?<=\d)[.;](?=\d))*)(?:[.!?]+(?=\s|$|[*_)\]])|\n+|$)/g;
	let m: RegExpExecArray | null = re.exec(limpo);
	while (m !== null) {
		if (m[0].length === 0) {
			re.lastIndex += 1;
		} else {
			trechos.push({
				ini: m.index,
				fim: m.index + m[0].length,
				pergunta: /\?+\s*$/.test(m[0].trim()),
			});
		}
		m = re.exec(limpo);
	}
	const idxPerguntas = trechos.map((t, i) => (t.pergunta ? i : -1)).filter((i) => i >= 0);
	const ultima = idxPerguntas[idxPerguntas.length - 1];
	const saida = trechos
		.filter((t, i) => !t.pergunta || i === ultima)
		.map((t) => texto.slice(t.ini, t.fim))
		.join("");
	return saida
		.replace(/[ \t]{2,}/g, " ")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
