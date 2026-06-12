import { expect, test } from "@playwright/test";

// FIX-32 (bloco-r) — scroll inteligente: o gesto do usuário SEMPRE vence o
// auto-scroll. E2E determinístico: intercepta POST /api/chat com um SSE fake no
// formato do AI SDK 6 (text-start/text-delta/text-end/[DONE]) servindo uma
// resposta LONGA — sem LLM, sem depender do backend. Cobre os dois defeitos:
//  • Defeito 1: rolar pra cima e ENVIAR — a resposta nova NÃO arranca o scroll.
//  • Defeito 2: intenção por posição (pill aparece ao subir) + pill religa.

function sseLongAnswer(tag: string): string {
	const long = Array.from(
		{ length: 40 },
		(_, i) => `${tag}-L${i + 1}: resposta longa do consultor pra encher a tela e gerar scroll.`,
	).join(" ");
	return [
		`data: {"type":"text-start","id":"${tag}"}`,
		`data: {"type":"text-delta","id":"${tag}","delta":${JSON.stringify(long)}}`,
		`data: {"type":"text-end","id":"${tag}"}`,
		`data: [DONE]`,
		"",
	].join("\n\n");
}

async function distanceFromBottom(list: import("@playwright/test").Locator): Promise<number> {
	return list.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
}

test.describe("FIX-32 — scroll do chat respeita a intenção do usuário", () => {
	test("gesto de subir vence o auto-scroll; pill religa no fundo", async ({ page }) => {
		let turn = 0;
		await page.route("**/api/chat", async (route) => {
			if (route.request().method() !== "POST") return route.fallback();
			turn += 1;
			await route.fulfill({
				status: 200,
				headers: {
					"content-type": "text/event-stream",
					"x-vercel-ai-ui-message-stream": "v1",
					"x-accel-buffering": "no",
					"cache-control": "no-cache",
					"X-Conversation-Id": `e2e-scroll-${turn}`,
				},
				body: sseLongAnswer(`R${turn}`),
			});
		});

		await page.setViewportSize({ width: 390, height: 700 });
		await page.goto("/chat");

		const textarea = page.locator("textarea").first();
		await expect(textarea).toBeVisible();

		// 1) primeira troca → resposta longa, sticky cola no fundo
		await textarea.fill("oi");
		await textarea.press("Enter");
		await expect(page.getByText(/R1-L40:/)).toBeVisible();

		const list = page.locator("[data-message-list]");
		await expect.poll(() => distanceFromBottom(list)).toBeLessThan(80); // colado

		// 2) usuário rola pra cima → intenção solta o stick → pill aparece
		await list.evaluate((el) => el.scrollTo({ top: 0 }));
		await list.dispatchEvent("wheel", { deltaY: -120 });
		const pill = page.getByRole("button", { name: /Novas mensagens/i });
		await expect(pill).toBeVisible();
		const topPos = await list.evaluate((el) => el.scrollTop);
		expect(topPos).toBeLessThan(120); // perto do topo

		// 3) DEFEITO 1: chega resposta nova (envio) — NÃO pode arrancar pro fundo
		await textarea.fill("e aí");
		await textarea.press("Enter");
		await expect(page.getByText(/R2-L40:/)).toBeVisible(); // resposta nova renderizou
		// o scroll continua perto do topo (o gesto venceu o auto-scroll)
		expect(await list.evaluate((el) => el.scrollTop)).toBeLessThan(200);
		await expect(pill).toBeVisible(); // ainda fora do fundo

		// 4) DEFEITO 2: clicar no pill religa e cola no fundo
		await pill.click();
		await expect.poll(() => distanceFromBottom(list)).toBeLessThan(80);
		await expect(pill).toBeHidden();
	});
});
