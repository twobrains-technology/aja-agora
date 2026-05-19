// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => cleanup());
import type { PersonaPatch } from "@/lib/validations/persona-patch";
import { DiffCard } from "./diff-card";

const voiceTonePatch: PersonaPatch = {
	kind: "voiceTone",
	before: "formal e técnico",
	after: "casual, próximo, fala como amigo no zap",
	rationale: "admin pediu menos formal",
	personaVersionSeen: 1,
};

const exampleAddPatch: PersonaPatch = {
	kind: "example.add",
	after: {
		id: "ex-1",
		userMessage: "Quanto custa?",
		assistantResponse: "Depende da faixa. Posso te mostrar opções?",
	},
	rationale: "exemplo de pergunta de preço",
	personaVersionSeen: 1,
};

const exampleRemovePatch: PersonaPatch = {
	kind: "example.remove",
	targetId: "550e8400-e29b-41d4-a716-446655440000",
	rationale: "exemplo redundante",
	personaVersionSeen: 1,
};

describe("DiffCard — voiceTone patch", () => {
	it("renderiza before e after", () => {
		render(
			<DiffCard
				patch={voiceTonePatch}
				onApply={vi.fn()}
				onReject={vi.fn()}
			/>,
		);
		expect(screen.getByText(/formal e técnico/)).toBeInTheDocument();
		expect(screen.getByText(/casual, próximo/)).toBeInTheDocument();
	});

	it("renderiza rationale", () => {
		render(
			<DiffCard
				patch={voiceTonePatch}
				onApply={vi.fn()}
				onReject={vi.fn()}
			/>,
		);
		expect(screen.getByText(/admin pediu menos formal/)).toBeInTheDocument();
	});

	it("clica Aplicar dispara onApply com o patch", () => {
		const onApply = vi.fn();
		render(
			<DiffCard
				patch={voiceTonePatch}
				onApply={onApply}
				onReject={vi.fn()}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /aplicar/i }));
		expect(onApply).toHaveBeenCalledWith(voiceTonePatch);
	});

	it("clica Descartar dispara onReject", () => {
		const onReject = vi.fn();
		render(
			<DiffCard
				patch={voiceTonePatch}
				onApply={vi.fn()}
				onReject={onReject}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /descartar/i }));
		expect(onReject).toHaveBeenCalled();
	});

	it("estado 'applied' esconde botões e mostra badge", () => {
		render(
			<DiffCard
				patch={voiceTonePatch}
				state="applied"
				onApply={vi.fn()}
				onReject={vi.fn()}
			/>,
		);
		expect(screen.getByText(/aplicado/i)).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /aplicar/i })).toBeNull();
	});

	it("estado 'rejected' esconde botões e mostra badge", () => {
		render(
			<DiffCard
				patch={voiceTonePatch}
				state="rejected"
				onApply={vi.fn()}
				onReject={vi.fn()}
			/>,
		);
		expect(screen.getByText(/descartado/i)).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /aplicar/i })).toBeNull();
	});
});

describe("DiffCard — example.add patch", () => {
	it("renderiza userMessage e assistantResponse no DEPOIS", () => {
		render(
			<DiffCard
				patch={exampleAddPatch}
				onApply={vi.fn()}
				onReject={vi.fn()}
			/>,
		);
		expect(screen.getByText(/Quanto custa\?/)).toBeInTheDocument();
		expect(screen.getByText(/Depende da faixa/)).toBeInTheDocument();
	});

	it("não renderiza box ANTES pra kind add", () => {
		render(
			<DiffCard
				patch={exampleAddPatch}
				onApply={vi.fn()}
				onReject={vi.fn()}
			/>,
		);
		expect(screen.queryByText("ANTES")).toBeNull();
	});
});

describe("DiffCard — example.remove patch", () => {
	it("renderiza box REMOVER com targetId", () => {
		render(
			<DiffCard
				patch={exampleRemovePatch}
				onApply={vi.fn()}
				onReject={vi.fn()}
			/>,
		);
		expect(screen.getByText(/REMOVER/i)).toBeInTheDocument();
		expect(
			screen.getByText(/550e8400-e29b-41d4-a716-446655440000/),
		).toBeInTheDocument();
	});
});
