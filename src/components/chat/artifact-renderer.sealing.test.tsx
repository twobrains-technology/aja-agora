// @vitest-environment happy-dom
/**
 * FIX-49 — só o artifact do TURNO ATIVO é interativo. Cards do histórico
 * (mensagens antigas / hidratadas da retomada) ficam selados: read-only,
 * pointer-events-none, aria-disabled. Fecha o vetor de duplicação do funil
 * (re-clicar "Simular esse" de uma hora atrás re-dispara select-group — cruza
 * com FIX-48).
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Artifact } from "@/lib/chat/types";
import { ArtifactRenderer } from "./artifact-renderer";

// Stub leve do card — o SUT é o selo do renderer, não o render do GroupCard
// (que puxa motion + useChatContext).
vi.mock("./artifacts/group-card", () => ({
	GroupCard: () => (
		<button type="button" data-testid="gc-action">
			Simular esse
		</button>
	),
}));

const groupArtifact = { id: "a1", type: "group_card", payload: {} } as unknown as Artifact;

afterEach(cleanup);

describe("FIX-49 — artifact selado fora do turno ativo", () => {
	it("active (default) → interativo, SEM selo (turno ativo segue clicável)", () => {
		const { container, getByTestId } = render(<ArtifactRenderer artifact={groupArtifact} />);
		expect(getByTestId("gc-action")).toBeTruthy();
		expect(container.querySelector('[data-sealed="true"]')).toBeNull();
	});

	it("active=false → selado read-only (aria-disabled + pointer-events-none)", () => {
		const { container } = render(<ArtifactRenderer artifact={groupArtifact} active={false} />);
		const sealed = container.querySelector('[data-sealed="true"]');
		expect(
			sealed,
			"card do histórico precisa de wrapper selado (read-only) — sem ele o card antigo segue clicável e re-dispara a ação (FIX-49/FIX-48)",
		).toBeTruthy();
		expect(sealed?.getAttribute("aria-disabled")).toBe("true");
		expect(sealed?.className).toContain("pointer-events-none");
	});

	it("active=false → wrapper REALMENTE inert (teclado/screen-reader também, não só o mouse)", () => {
		const { container } = render(<ArtifactRenderer artifact={groupArtifact} active={false} />);
		const sealed = container.querySelector('[data-sealed="true"]');
		// `pointer-events-none` cobre só o mouse; o atributo `inert` (boolean) é o que
		// sela o card antigo pra Tab/foco/screen-reader. Em React 19, `inert=""` (string
		// vazia) é tratado como `false` e o atributo NÃO é renderizado → selo furado.
		expect(
			sealed?.hasAttribute("inert"),
			"card selado precisa do atributo inert (boolean) — sem ele, Tab/SR alcançam o card antigo e re-disparam a ação (FIX-49/FIX-48)",
		).toBe(true);
	});
});
