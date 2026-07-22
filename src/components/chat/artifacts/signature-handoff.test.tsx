// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SignatureHandoffPayload } from "@/lib/chat/types";
import { SignatureHandoff } from "./signature-handoff";

afterEach(() => cleanup());

// O card apresenta a PROPOSTA pronta + a continuidade da Aja Agora — nunca
// promete "assinatura" (etapa posterior, do atendente). Desde 2026-07-21 o link
// é o da NOSSA proposta em PDF (`proposalUrl`, URL assinada do nosso bucket): o
// PDF da administradora em domínio de terceiro (useme.link) foi abolido — o
// cliente não sai da Aja Agora pra ver o próprio plano.

const payload: SignatureHandoffPayload = {
	administradora: "ÂNCORA",
	proposalUrl: "https://docs.ajaagora.com.br/proposals/abc123.pdf",
};

describe("SignatureHandoff — proposta pronta, NÃO assinatura (DESVIO-ASSINATURA)", () => {
	it("não promete 'assinatura' (etapa posterior da mesa, não deste card)", () => {
		render(<SignatureHandoff payload={payload} />);
		expect(document.body.textContent ?? "").not.toMatch(/assinatura|assinar/i);
	});

	it("apresenta a PROPOSTA pronta da administradora escolhida", () => {
		render(<SignatureHandoff payload={payload} />);
		expect(document.body.textContent ?? "").toMatch(/proposta/i);
		expect(document.body.textContent ?? "").toContain("ÂNCORA");
	});

	// A continuidade da Aja Agora ("segue com você até a contemplação") é dita no
	// BALÃO que antecede o card. Repetir aqui produzia o mesmo reforço duas vezes
	// na mesma tela — costura de blocos, não fala. O card carrega o documento.
	it("é sobre o DOCUMENTO da proposta, sem repetir o reforço do balão anterior", () => {
		render(<SignatureHandoff payload={payload} />);
		const texto = document.body.textContent ?? "";
		expect(texto).toMatch(/carta.*parcela.*prazo/i);
		expect(texto).not.toMatch(/segue com você até a contemplação/i);
	});

	it("o botão abre a NOSSA proposta em PDF (proposalUrl) em nova aba", () => {
		const open = vi.fn();
		vi.stubGlobal("open", open);
		render(<SignatureHandoff payload={payload} />);
		const btn = screen.getByTestId("signature-link");
		expect(btn.textContent ?? "").not.toMatch(/assinatura|assinar/i);
		btn.click();
		expect(open).toHaveBeenCalledWith(
			"https://docs.ajaagora.com.br/proposals/abc123.pdf",
			"_blank",
			"noopener,noreferrer",
		);
		vi.unstubAllGlobals();
	});
});
