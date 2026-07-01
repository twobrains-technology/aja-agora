import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://aja-improving-web-conversation.orb.local";

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
    // Video exige ffmpeg — ausente no container Alpine (musl). Gateado: off quando rodando
    // com o chromium do sistema (container); "retain-on-failure" no host/CI. Screenshot +
    // trace (que não precisam de ffmpeg) seguem como evidência.
    video: process.env.PW_EXECUTABLE_PATH ? "off" : "retain-on-failure",
  },

  webServer: undefined, // App já tá rodando no container local

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Container Alpine (musl) não roda o chromium glibc que o Playwright baixa.
        // Quando PW_EXECUTABLE_PATH aponta pro chromium do sistema (/usr/bin/chromium-browser),
        // usa-o + --no-sandbox (chromium como root). Inerte no host/CI (env vazia → browser padrão).
        ...(process.env.PW_EXECUTABLE_PATH
          ? {
              launchOptions: {
                executablePath: process.env.PW_EXECUTABLE_PATH,
                args: ["--no-sandbox"],
              },
            }
          : {}),
      },
    },
  ],
});
