import { defineConfig, devices } from "@playwright/test";

const baseURL =
	process.env.PLAYWRIGHT_TEST_BASE_URL || "http://aja-improving-web-conversation.orb.local";

// Container Alpine do workspace não tem os browsers bundled do Playwright
// (musl libc). PW_EXECUTABLE_PATH aponta pro chromium nativo (apk add
// chromium) — gated/inerte no host/CI, onde a var não existe.
const executablePath = process.env.PW_EXECUTABLE_PATH;

export default defineConfig({
	testDir: "./tests/e2e/specs",
	fullyParallel: false, // Sequential for clean DB state between tests
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : 1,
	reporter: [
		["html", { open: "never" }],
		["json", { outputFile: "test-results/results.json" }],
		["list"],
	],
	use: {
		baseURL,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		// Alpine não tem ffmpeg — vídeo quebra a gravação, não a execução do teste.
		video: executablePath ? "off" : "retain-on-failure",
		...(executablePath ? { launchOptions: { executablePath, args: ["--no-sandbox"] } } : {}),
	},

	webServer: undefined, // App já tá rodando no container local

	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
