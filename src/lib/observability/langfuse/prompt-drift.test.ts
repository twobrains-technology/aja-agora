// O defeito que este arquivo existe para impedir, medido em produção em
// 2026-08-15: `aja-turn-analyzer` estava publicado na v1 de 07/08 enquanto o
// código já tinha, desde 14/08, os exemplos que ensinam o analyzer a separar
// "200 por mês" (parcela) de "200 mil" (valor do bem). O runtime lê a label
// `production` do Langfuse e só usa o código como FALLBACK — então o texto que
// o time revisa no repo não era o texto que o modelo recebia, e ninguém tinha
// como saber: nenhum teste, nenhum log, nenhum alerta olhava para isso.
//
// A comparação é de TEXTO, determinística, sem rede — a busca do publicado é
// injetada por quem chama (o script `prompts:check`).
import { describe, expect, it } from "vitest";
import { compararPromptPublicado, resumoDeDrift, scoreDeDesyncEmRuntime } from "./prompt-drift";

describe("compararPromptPublicado", () => {
	it("texto publicado idêntico ao do código está em dia", () => {
		const texto = "Você analisa turnos de WhatsApp.\nSeja conservador.";
		const r = compararPromptPublicado({
			name: "aja-turn-analyzer",
			textoDoCodigo: texto,
			publicado: { text: texto, version: 7 },
		});
		expect(r.status).toBe("em-dia");
		expect(r).toMatchObject({ name: "aja-turn-analyzer", version: 7 });
	});

	it("acusa divergência e mostra o que produção NÃO tem", () => {
		const publicado = "Regras gerais:\n- Seja preciso e conservador.";
		const codigo =
			'Regras gerais:\n- Seja preciso e conservador.\n- "só consigo 200 por mês" -> { parcelaMensal: 200 }';
		const r = compararPromptPublicado({
			name: "aja-turn-analyzer",
			textoDoCodigo: codigo,
			publicado: { text: publicado, version: 1 },
		});
		expect(r.status).toBe("divergente");
		if (r.status !== "divergente") throw new Error("narrowing");
		expect(r.faltamEmProducao).toEqual(['- "só consigo 200 por mês" -> { parcelaMensal: 200 }']);
		expect(r.sobramEmProducao).toEqual([]);
		expect(r.version).toBe(1);
	});

	it("acusa também o que produção tem A MAIS — texto editado direto na UI", () => {
		// O caminho inverso é tão perigoso quanto: editar na UI muda o agente em
		// produção em ≤60s, sem deploy e sem passar por review.
		const r = compararPromptPublicado({
			name: "aja-system-prompt",
			textoDoCodigo: "linha A\nlinha B",
			publicado: { text: "linha A\nlinha B\nNOTA DE TESTE — ignore o funil", version: 4 },
		});
		expect(r.status).toBe("divergente");
		if (r.status !== "divergente") throw new Error("narrowing");
		expect(r.sobramEmProducao).toEqual(["NOTA DE TESTE — ignore o funil"]);
	});

	it("prompt nunca publicado é divergência, não sucesso", () => {
		// Sem prompt publicado o app roda pelo fallback do código, o que É o texto
		// certo — mas então nenhuma métrica por versão existe e a próxima
		// publicação passa a valer sem ninguém notar. Reportar, não silenciar.
		const r = compararPromptPublicado({
			name: "aja-system-prompt",
			textoDoCodigo: "qualquer coisa",
			publicado: null,
		});
		expect(r.status).toBe("nao-publicado");
	});

	it("ignora diferença só de espaço em branco no fim das linhas e de quebra final", () => {
		// Publicar por REST e ler de volta pode normalizar a quebra final; isso não
		// é divergência de conteúdo e não pode gerar alarme falso — alarme falso
		// treina todo mundo a ignorar o alarme.
		const r = compararPromptPublicado({
			name: "aja-turn-analyzer",
			textoDoCodigo: "linha A   \nlinha B\n",
			publicado: { text: "linha A\nlinha B", version: 2 },
		});
		expect(r.status).toBe("em-dia");
	});
});

describe("resumoDeDrift", () => {
	it("sem divergência, não falha e diz que está em dia", () => {
		const r = resumoDeDrift([
			{ status: "em-dia", name: "aja-system-prompt", version: 3 },
			{ status: "em-dia", name: "aja-turn-analyzer", version: 2 },
		]);
		expect(r.ok).toBe(true);
		expect(r.texto).toContain("em dia");
	});

	it("com divergência, falha e nomeia o prompt e o comando que conserta", () => {
		const r = resumoDeDrift([
			{ status: "em-dia", name: "aja-system-prompt", version: 3 },
			{
				status: "divergente",
				name: "aja-turn-analyzer",
				version: 1,
				faltamEmProducao: ["- exemplo de parcela"],
				sobramEmProducao: [],
			},
		]);
		expect(r.ok).toBe(false);
		expect(r.texto).toContain("aja-turn-analyzer");
		expect(r.texto).toContain("pnpm sync-prompts");
		// O que produção não tem precisa aparecer: é o que decide se é grave.
		expect(r.texto).toContain("- exemplo de parcela");
	});

	it("prompt não publicado também reprova", () => {
		const r = resumoDeDrift([{ status: "nao-publicado", name: "aja-system-prompt" }]);
		expect(r.ok).toBe(false);
		expect(r.texto).toContain("aja-system-prompt");
	});
});

describe("scoreDeDesyncEmRuntime — a direção que o CI não pega", () => {
	// O CI compara o repo com o publicado no momento do PR. Ele não vê alguém
	// editar o texto na UI do Langfuse depois — e essa edição muda o agente em
	// produção em ≤60s, sem deploy e sem review. Só o runtime enxerga isso,
	// porque ele tem as duas versões na mão em todo turno.
	it("textos iguais não geram score — o caminho normal tem que ser silencioso", () => {
		expect(scoreDeDesyncEmRuntime("aja-system-prompt", "mesmo texto", "mesmo texto")).toBeNull();
	});

	it("textos diferentes geram score categórico com o nome do prompt", () => {
		const s = scoreDeDesyncEmRuntime("aja-turn-analyzer", "publicado A", "código B");
		expect(s).not.toBeNull();
		expect(s?.name).toBe("prompt_desync");
		expect(s?.value).toBe("aja-turn-analyzer");
		expect(s?.dataType).toBe("CATEGORICAL");
	});

	it("diferença só de espaço no fim da linha não gera score", () => {
		expect(
			scoreDeDesyncEmRuntime("aja-system-prompt", "linha A\nlinha B", "linha A   \nlinha B\n"),
		).toBeNull();
	});
});
