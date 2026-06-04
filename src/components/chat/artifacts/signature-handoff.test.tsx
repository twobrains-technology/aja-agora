// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SignatureHandoffPayload } from "@/lib/chat/types";
import { SignatureHandoff } from "./signature-handoff";

afterEach(() => cleanup());

// DESVIO-ASSINATURA (2026-06-04): o jornada.docx (visão do stakeholder) assume
// "assinatura digital no fechamento". A realidade verificada da API de Parceiro:
// o `consortiumProposalLink` (do choose_offer) é um PDF de PROPOSTA de consórcio
// (S3, Content-Disposition: attachment) — NÃO um portal de assinatura. A
// assinatura/efetivação é etapa posterior conduzida pela equipe (mesa). O card
// não pode prometer "assinatura" — apresenta a PROPOSTA + continuidade Aja Agora.
// Cadastrado em docs/jornada/CONTEXT.md (Desvios de entendimento, DES-1).

const payload: SignatureHandoffPayload = {
	administradora: "ÂNCORA",
	consortiumProposalLink: "https://www.uselink.me/abc123",
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

	it("mantém a continuidade da Aja Agora (sem o cliente sentir que 'mudou de empresa')", () => {
		render(<SignatureHandoff payload={payload} />);
		expect(document.body.textContent ?? "").toContain("Aja Agora");
	});

	it("o botão abre o link da proposta (consortiumProposalLink) em nova aba", () => {
		const open = vi.fn();
		vi.stubGlobal("open", open);
		render(<SignatureHandoff payload={payload} />);
		const btn = screen.getByTestId("signature-link");
		expect(btn.textContent ?? "").not.toMatch(/assinatura|assinar/i);
		btn.click();
		expect(open).toHaveBeenCalledWith(
			"https://www.uselink.me/abc123",
			"_blank",
			"noopener,noreferrer",
		);
		vi.unstubAllGlobals();
	});
});
