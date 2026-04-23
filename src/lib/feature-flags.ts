/**
 * Feature flags read from environment variables.
 * Server-side only — do not import in client components.
 */

export const featureFlags = {
  /** Show the landing page at "/". If false, "/" redirects to admin login. */
  get landingPage(): boolean {
    return process.env.FEATURE_LANDING_PAGE !== "false";
  },

  /** Show only the kanban pipeline page without sidebar navigation. */
  get onlyKanban(): boolean {
    return process.env.FEATURE_ONLY_KANBAN === "true";
  },
};
