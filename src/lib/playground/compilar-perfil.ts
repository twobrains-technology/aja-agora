// Compilador do perfil de comportamento (D-0056). Função pura e determinística:
// atributos + orientação -> bloco de texto delimitado, acrescentado à conduta.
// Nenhum nível contradiz P1–P7 (AGENTS.md): sem empurrar ao fecho, sem desistir
// do lead, sem inventar número, sem prometer resultado de sorteio.
import { compor, PARTES_PADRAO } from "@/lib/agent/prompt-do-vendedor";
import type { AtributosDoPerfil, ContatoPreset, ParteId } from "./tipos";

export const MARCA_INICIO = "<!-- playground:inicio -->";
export const MARCA_FIM = "<!-- playground:fim -->";

const AGRESSIVIDADE: Record<AtributosDoPerfil["agressividade"], string> = {
	suave:
		"Conduza com leveza: entregue valor, deixe a pessoa no ritmo dela e convide para o próximo passo sem pressão. Se ela hesitar, ofereça mais informação em vez de insistir.",
	equilibrada:
		"Conduza ao próximo passo de forma clara a cada resposta. Trate a objeção com argumento e depois convide a avançar.",
	insistente:
		"Conduza sempre ao próximo passo e não recue na primeira objeção: rebata com argumento e número vindo da ferramenta, e volte a convidar a avançar. Nunca desista do lead. Só leve ao especialista ou ao fechamento quando o cliente pedir.",
};

const PROATIVIDADE: Record<AtributosDoPerfil["proatividade"], string> = {
	baixa: "Só proponha um novo contato se a pessoa pedir ou se despedir.",
	media: "Ao fim de uma conversa sem fechamento, proponha um próximo contato com data simples.",
	alta: "Sempre deixe um próximo contato combinado antes de encerrar, com dia e canal, e diga que você retoma a conversa.",
};

const TECNICIDADE: Record<AtributosDoPerfil["tecnicidade"], string> = {
	leigo:
		"Explique como para quem nunca ouviu falar de consórcio: sem sigla solta, com exemplo do dia a dia, uma ideia por vez.",
	neutro: "Use termos de consórcio quando ajudam e explique o termo na primeira vez que aparecer.",
	expert:
		"Fale como especialista: use os termos do setor (lance embutido, fundo comum, taxa de administração) e vá direto ao ponto.",
};

const TOM: Record<AtributosDoPerfil["tom"], string> = {
	formal: "Tom formal e cordial: trate por senhor ou senhora e evite gírias.",
	neutro: "Tom natural e educado, nem formal demais nem íntimo.",
	coloquial: "Tom coloquial e próximo, como uma conversa de WhatsApp, sem perder o respeito.",
};

function limparOrientacao(texto: string): string {
	return texto.replaceAll(MARCA_INICIO, "").replaceAll(MARCA_FIM, "").trim();
}

export function compilarPerfil(entrada: {
	atributos: AtributosDoPerfil;
	orientacao: string;
}): string {
	const { atributos: a } = entrada;
	const orientacao = limparOrientacao(entrada.orientacao);
	const linhas = [
		MARCA_INICIO,
		"# Ajuste de comportamento (playground)",
		"",
		`- Agressividade comercial (${a.agressividade}): ${AGRESSIVIDADE[a.agressividade]}`,
		`- Proatividade de follow-up (${a.proatividade}): ${PROATIVIDADE[a.proatividade]}`,
		`- Tecnicidade (${a.tecnicidade}): ${TECNICIDADE[a.tecnicidade]}`,
		`- Tom (${a.tom}): ${TOM[a.tom]}`,
		"- Valor, parcela, prazo e administradora vêm sempre de ferramenta; nunca invente número.",
	];
	if (orientacao) linhas.push("", "Orientação adicional:", orientacao);
	linhas.push(MARCA_FIM);
	return linhas.join("\n");
}

function removerBloco(conduta: string): string {
	const ini = conduta.indexOf(MARCA_INICIO);
	if (ini === -1) return conduta.trimEnd();
	const fim = conduta.indexOf(MARCA_FIM, ini);
	const depois = fim === -1 ? "" : conduta.slice(fim + MARCA_FIM.length);
	return removerBloco(`${conduta.slice(0, ini).trimEnd()}${depois}`);
}

/** Idempotente: remove bloco anterior e acrescenta o novo ao fim da conduta. */
export function aplicarBloco(conduta: string, bloco: string): string {
	const base = removerBloco(conduta);
	const novo = bloco.trim();
	return novo ? `${base}\n\n${novo}` : base;
}

/** Variante do preset `telefone-antes`: só o site pede o WhatsApp antes da carta (P6). */
export const CONTATO_TELEFONE_ANTES = `O contato é o que salva a conversa. No site, peça o WhatsApp antes de mostrar a
carta: chame mostrar_card com tipo "whatsapp_optin", que pede o número e permite
retomar a conversa depois que a pessoa fechar a tela, e só então mostre a carta.
No WhatsApp o telefone e o nome já chegaram com a mensagem, então não peça de novo.
Peça o CPF quando for gerar a proposta, explique para que serve e nunca repita CPF
nem telefone na conversa.`;

/**
 * Conduta completa do perfil: base + partes (padrão onde não editadas) + orientação
 * adicional + Estilo geral. Sem `atributos` não há Estilo geral; a orientação
 * adicional entra como texto simples.
 */
export function compilarConduta(entrada: {
	partes: Partial<Record<ParteId, string>>;
	contato: ContatoPreset;
	livre: string;
	atributos?: AtributosDoPerfil;
}): string {
	const contato =
		entrada.contato === "telefone-antes" ? CONTATO_TELEFONE_ANTES : PARTES_PADRAO.contato;
	const conduta = compor({ ...PARTES_PADRAO, contato, ...entrada.partes });
	if (entrada.atributos) {
		return aplicarBloco(
			conduta,
			compilarPerfil({ atributos: entrada.atributos, orientacao: entrada.livre }),
		);
	}
	const livre = limparOrientacao(entrada.livre);
	return livre ? `${conduta}\n\nOrientação adicional:\n${livre}` : conduta;
}
