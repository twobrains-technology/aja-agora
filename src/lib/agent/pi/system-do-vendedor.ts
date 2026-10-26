// O SYSTEM DO VENDEDOR — a composição, num lugar só.
//
// Antes a montagem vivia dentro do turno: conduta da caixa, skills e linha de
// fato eram três concatenações no meio de `runTurnLivreImpl`. Consequência medida
// em 23/10: não havia como mostrar a ninguém "o que o modelo recebe" — a única
// forma de responder era ler o código.
//
// A ordem é fixa e é contrato: CONDUTA (a caixa, versionada por label) →
// SKILLS (o conhecimento da Bevi) → FATO (canal, nome, se a identidade já foi
// capturada). O `partes` existe para a prévia do admin poder mostrar os três
// blocos separados; o turno usa só o `system`.
import { type Caixa, caixaDoCodigo, labelDaCaixa, lerCaixa } from "@/lib/agent/box/caixa";
import { skillsParaPrompt } from "@/lib/agent/pi/skills";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";

/** Só o que o fato precisa saber da identidade — os dígitos NUNCA são impressos. */
export type IdentidadeDoCliente = { cpf: string; celular?: string };

/** O bloco de FATO do atendimento. O CPF aparece como MARCADOR, nunca em
 * dígitos: é assim que o modelo sabe que já tem identidade sem receber dado
 * pessoal no prompt. */
function linhaDeFato(args: {
	channel: "web" | "whatsapp";
	contactName: string | null;
	identidade: IdentidadeDoCliente | null;
}): string {
	const nome = args.contactName?.trim();
	const cpf = args.identidade ? "recebido e guardado" : "ainda não informado";
	// No WhatsApp o celular É o número da conversa: não se pede, não se pergunta. Na
	// web ele pode ser pedido UMA vez, no momento da proposta.
	const celular =
		args.channel === "whatsapp"
			? args.identidade?.celular
				? "o número da conversa (já guardado) — não pergunte"
				: "o número da conversa, já conhecido — não pergunte"
			: args.identidade?.celular
				? "recebido e guardado"
				: "ainda não informado (peça uma vez, só na proposta)";
	return `\n\n# Fato deste atendimento\n\nCanal: ${args.channel === "web" ? "site" : "WhatsApp"}.${nome ? ` Nome do cliente: ${nome}.` : ""} CPF: ${cpf}. Celular: ${celular}.`;
}

/**
 * Monta o system do turno. A caixa e as skills são injetáveis para o teste rodar
 * sem banco e sem disco; por padrão leem o banco (`lerCaixa`) e os `.md` das
 * skills (`skillsParaPrompt`).
 *
 * É assíncrona porque a leitura da caixa é: a conduta vigente mora no banco.
 */
export async function montarSystemDoVendedor(args: {
	channel: "web" | "whatsapp";
	contactName: string | null;
	identidade: IdentidadeDoCliente | null;
	/** Injetável para teste; por padrão lê a caixa. */
	caixa?: Caixa;
	/** Injetável para teste; por padrão `skillsParaPrompt()`. */
	skills?: string;
	agora?: number;
}): Promise<{ system: string; partes: { conduta: string; skills: string; fato: string } }> {
	// `lerCaixa` já não lança; o `catch` é a segunda rede: turno sem conduta é
	// pior que conduta do código.
	const caixa =
		args.caixa ??
		(await lerCaixa({ agora: args.agora }).catch(() => caixaDoCodigo(labelDaCaixa())));

	const conduta = caixa.texto?.trim() ? caixa.texto : SYSTEM_PROMPT;
	const skills = args.skills ?? skillsParaPrompt();
	const fato = linhaDeFato({
		channel: args.channel,
		contactName: args.contactName,
		identidade: args.identidade,
	});

	return { system: conduta + skills + fato, partes: { conduta, skills, fato } };
}
