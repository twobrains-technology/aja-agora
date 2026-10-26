// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StreamingDots } from "./streaming-dots";

afterEach(cleanup);

describe("StreamingDots — rótulo da espera por tool", () => {
	// L19/P274 — sem entrada própria, a consulta de status caía no
	// `ESPERA_SEM_TOOL` e o cliente lia "Montando sua resposta" (só aos 6s) com a
	// administradora sendo consultada.
	it("status_da_proposta diz que está consultando a proposta", () => {
		render(<StreamingDots tool="status_da_proposta" />);
		expect(screen.getByText("Consultando sua proposta")).toBeTruthy();
	});

	it("mantém o rótulo das tools vizinhas", () => {
		render(<StreamingDots tool="fazer_proposta" />);
		expect(screen.getByText("Gerando sua proposta")).toBeTruthy();
	});
});
