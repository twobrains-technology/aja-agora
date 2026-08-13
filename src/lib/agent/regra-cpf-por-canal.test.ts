// FIX-431 (P0 #4) — "NUNCA peça dados pessoais por texto" é verdade na WEB e
// mentira no WHATSAPP.
//
// Produção, 2026-08-13, sessão `a68b1945`. O cliente ofereceu o CPF por texto
// e o agente recusou: "Opa, não precisa compartilhar CPF comigo não! Isso fica
// seguro só quando você for contratar, direto na plataforma." A frase é
// coerente com `system-prompt.ts:63` — mas essa regra descreve a jornada WEB
// (formulário na tela). No WhatsApp a identidade SEMPRE chega por mensagem:
// é o próprio `identify-capture.ts` que a lê do texto, e
// `whatsapp/adapter.ts:776-782` pede o CPF por TEXTO quando falta.
//
// O prompt tem exatamente o padrão certo para isto (`blocoCanal` em
// `converse.ts`, "O CANAL NÃO TEM TELA") — só não foi aplicado à regra de CPF.
// Este teste força a regra a virar bloco condicional por canal, do mesmo jeito.
//
// A varredura é de SOURCE, não de saída montada: `SYSTEM_PROMPT` é montado por
// dezenas de combinações de persona/estágio, e o texto proibitivo mora numa
// string fixa dentro dele — testar a fixture não prova que a fixture é
// representativa.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SYSTEM_PROMPT_SRC = readFileSync(
	join(process.cwd(), "src/lib/agent/system-prompt.ts"),
	"utf8",
);
const CONVERSE_SRC = readFileSync(
	join(process.cwd(), "src/lib/agent/langgraph/nodes/converse.ts"),
	"utf8",
);

describe("regra de 'não peça CPF por texto' é condicionada por canal", () => {
	it("não existe como proibição INCONDICIONAL no corpo global do system prompt", () => {
		// A regra global (fora de qualquer bloco de canal) não pode dizer "NUNCA
		// peça CPF/dados pessoais por texto" sem qualificação — é falsa no
		// WhatsApp. Bloco condicionado (`state.channel === "web"` etc.) fica de
		// fora desta varredura de propósito: o teste mira o texto FIXO.
		// A primeira versão caçava só "NUNCA peça (dados pessoais|CPF)" — e a
		// frase que sobrou viva no prompt era "NÃO peça nome/CPF/email/telefone
		// por texto" (auditoria de 2026-08-13). Regex que casa exatamente com a
		// lista de quem o escreveu é o anti-padrão do CLAUDE.md; agora a busca é
		// pela FORMA da proibição, em qualquer redação.
		const proibicaoIncondicional =
			/(NUNCA|NÃO|NAO)\s+peça[^.]{0,60}(dados pessoais|CPF)[^.]{0,60}por texto/i.test(
				SYSTEM_PROMPT_SRC,
			) && !/state\.channel\s*===\s*["']web["']/.test(SYSTEM_PROMPT_SRC);
		expect(
			proibicaoIncondicional,
			"a proibição de pedir CPF por texto precisa estar dentro de um bloco condicionado ao canal, não no corpo global",
		).toBe(false);
	});

	it("existe uma regra explícita para o canal WhatsApp aceitando CPF por mensagem", () => {
		// A correção precisa ensinar o oposto no WhatsApp: identidade chega por
		// texto e o agente NUNCA a recusa quando o cliente a oferece.
		expect(CONVERSE_SRC).toMatch(/whatsapp/i);
		const blocoWhatsapp =
			/state\.channel === "whatsapp"[\s\S]{0,2000}/.exec(CONVERSE_SRC)?.[0] ?? "";
		expect(blocoWhatsapp.toLowerCase()).toMatch(/cpf/);
	});
});
