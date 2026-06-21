import { expect, test } from "@playwright/test";

// E2E de RENDER da landing — valida que a copy (FIX-59) e a identidade visual
// (FIX-60: figura do hero) da revisão 2 da jornada realmente renderizam no app
// servido, complementando src/components/landing/copy.test.ts (que valida só o
// source dos componentes). Sem LLM, 100% determinístico.
//
// Origem: jornada2_revisão.docx (Bernardo, 2026-06-19) → bloco C (FIX-59/60).

test.describe("Landing — copy e identidade da revisão 2 (FIX-59/60)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
	});

	test("hero monta headline canônica, chip independente e composer", async ({ page }) => {
		await expect(page).toHaveTitle(/Aja Agora/);

		const h1 = page.getByRole("heading", { level: 1 });
		await expect(h1).toContainText("Seu consórcio, resolvido");
		await expect(h1).toContainText("numa conversa");

		// chip do hero foi reescrito SEM "IA" (FIX-59) — posicionamento de
		// consultoria independente. Escopado ao <header> porque a mesma frase
		// reaparece (de propósito) num parágrafo institucional mais abaixo.
		await expect(
			page.locator("header").getByText(/Consultoria de consórcio independente/i),
		).toBeVisible();

		// composer conversacional: input + chips de categoria da jornada (passo 1).
		// Escopado ao <form> do hero — os mesmos labels reaparecem no footer.
		await expect(page.getByLabel(/Conte o que você quer conquistar/i)).toBeVisible();
		const composer = page.locator("form");
		for (const label of ["Imóvel", "Carro", "Moto"]) {
			await expect(composer.getByRole("button", { name: label })).toBeVisible();
		}
	});

	test("figura do hero (FIX-60) renderiza e o asset é servido", async ({ page, request }) => {
		const heroImg = page
			.getByAltText(/Consultora da Aja Agora conversando com um cliente/i)
			.first();
		await expect(heroImg).toBeVisible();

		const resp = await request.get("/brand/hero-scene.png");
		expect(resp.status()).toBe(200);
		expect(resp.headers()["content-type"]).toContain("image");
	});

	test("copy do reposicionamento (FIX-59) presente no DOM renderizado", async ({ page }) => {
		const body = page.locator("body");
		// process passo 3 — privacidade + CPF (administradoras exigem).
		await expect(body).toContainText(/privacidade/i);
		await expect(body).toContainText(/CPF/);
		// trust — "achar o melhor plano para você".
		await expect(body).toContainText(/melhor plano/i);
		// hero — "Sem compromisso." substituiu o antigo "Sem cadastro."
		await expect(body).toContainText(/sem compromisso/i);
	});

	test("frases vetadas da revisão 2 NÃO aparecem no DOM renderizado", async ({ page }) => {
		const text = await page.locator("body").innerText();
		expect(text).not.toMatch(/sem cadastro/i); // FIX-59 — removido do hero
		expect(text).not.toMatch(/mercado inteiro/i); // FIX-59 — vira "melhores administradoras"
		expect(text).not.toMatch(/grupo 1042/i); // FIX-59 — removido da demo
		expect(text).not.toMatch(/intelig[êe]ncia artificial/i); // sem overclaim de IA
		expect(text).not.toMatch(/\bIA\b/); // chip reescrito sem "IA"
	});
});
