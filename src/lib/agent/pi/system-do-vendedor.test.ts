import { describe, expect, it } from "vitest";
import type { Caixa } from "@/lib/agent/box/caixa";
import { PROMPT_DO_VENDEDOR } from "@/lib/agent/prompt-do-vendedor";
import { montarSystemDoVendedor } from "./system-do-vendedor";

const caixaPublicada: Caixa = {
	nome: "aja-system-prompt",
	label: "production",
	versao: 7,
	texto: "CONDUTA PUBLICADA DA BRUNA",
	origem: "banco",
};

function montar(
	extra: Partial<Parameters<typeof montarSystemDoVendedor>[0]> = {},
): ReturnType<typeof montarSystemDoVendedor> {
	return montarSystemDoVendedor({
		channel: "web",
		contactName: "Bruna",
		identidade: null,
		caixa: caixaPublicada,
		skills: "SKILLS DO VENDEDOR",
		...extra,
	});
}

describe("system do vendedor — conduta, skills e fato, nesta ordem", () => {
	it("compõe conduta + skills + fato, nessa ordem, e as partes fecham o system", async () => {
		const { system, partes } = await montar();

		const iConduta = system.indexOf("CONDUTA PUBLICADA DA BRUNA");
		const iSkills = system.indexOf("SKILLS DO VENDEDOR");
		const iFato = system.indexOf("# Fato deste atendimento");

		expect(iConduta).toBe(0);
		expect(iSkills).toBeGreaterThan(iConduta);
		expect(iFato).toBeGreaterThan(iSkills);

		expect(partes.conduta).toBe("CONDUTA PUBLICADA DA BRUNA");
		expect(partes.skills).toBe("SKILLS DO VENDEDOR");
		expect(partes.conduta + partes.skills + partes.fato).toBe(system);
	});

	it("caixa vazia cai no texto do CÓDIGO — turno nunca fica sem conduta", async () => {
		const { system, partes } = await montar({
			caixa: { ...caixaPublicada, texto: "   " },
		});
		expect(partes.conduta).toBe(PROMPT_DO_VENDEDOR);
		expect(system.startsWith(PROMPT_DO_VENDEDOR)).toBe(true);
	});
});

describe("system do vendedor — a linha de fato nunca carrega identidade", () => {
	it("com identidade, o CPF vira marcador e os dígitos NÃO aparecem no system", async () => {
		const { system } = await montar({
			identidade: { cpf: "11144477735", celular: "11987654321" },
		});

		expect(system).toContain("CPF: recebido e guardado");
		expect(system).toContain("Celular: recebido e guardado");
		// O número que o cliente digitou não chega ao modelo — só o marcador.
		expect(system).not.toContain("11144477735");
		expect(system).not.toContain("111.444.777-35");
		expect(system).not.toContain("11987654321");
	});

	it("sem identidade, o fato diz que ainda não foi informado", async () => {
		const { system } = await montar({ identidade: null });
		expect(system).toContain("CPF: ainda não informado");
		expect(system).toContain("Celular: ainda não informado");
	});
});

describe("system do vendedor — canal e nome", () => {
	it("web vira 'site' e whatsapp vira 'WhatsApp'", async () => {
		const site = await montar({ channel: "web" });
		expect(site.system).toContain("Canal: site.");

		const zap = await montar({ channel: "whatsapp" });
		expect(zap.system).toContain("Canal: WhatsApp.");
	});

	it("o nome do contato entra na linha de fato; sem nome, 'desconhecido'", async () => {
		const comNome = await montar({ contactName: "Bruna" });
		expect(comNome.system).toContain("Nome do cliente: Bruna.");

		const semNome = await montar({ contactName: null });
		expect(semNome.system).toContain("Nome do cliente: desconhecido.");
	});
});
