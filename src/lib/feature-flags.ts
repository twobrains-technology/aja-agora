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

  /** Show the admin dashboard at "/admin". */
  get dashboard(): boolean {
    return process.env.FEATURE_DASHBOARD !== "false";
  },

  /** Show the pipeline page at "/admin/pipeline". */
  get pipeline(): boolean {
    return process.env.FEATURE_PIPELINE !== "false";
  },

  /** Show the attendants page at "/admin/attendants". */
  get attendants(): boolean {
    return process.env.FEATURE_ATTENDANTS !== "false";
  },

  /** Show the personas pages under "/admin/personas". */
  get personas(): boolean {
    return process.env.FEATURE_PERSONAS !== "false";
  },
};
