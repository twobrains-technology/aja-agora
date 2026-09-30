// @vitest-environment happy-dom
/**
 * FIX-403 — a OFERTA EMBACADA da variante B.
 *
 * O dono, 29/09/2026: *"teste B deveria ser, mostra as ofertas totalmente
 * embacadas com blur, e alguma especie de clique para desbloquear, e ai pede o
 * numero do cliente."*
 *
 * Regressão exigida:
 *  - o conteúdo da oferta está na tela (a pessoa vê que ele existe) mas embaçado;
 *  - o blur NÃO é a única pista: o conteúdo sai do a11y e há botão com texto;
 *  - o clique leva ao CAMPO do telefone — não libera a oferta sozinho.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OfertaEmbacada } from "./oferta-embacada";

describe("OfertaEmbacada — o embaçado da variante B (FIX-403)", () => {
	afterEach(cleanup);

	it("o conteúdo está na tela, embaçado, e fora da árvore de acessibilidade", () => {
		render(
			<OfertaEmbacada>
				<p>Parcela R$ 1.234</p>
			</OfertaEmbacada>,
		);
		const embacada = screen.getByTestId("oferta-embacada");

		// Existe: a pessoa vê que a oferta está pronta (é o prêmio da tela).
		expect(embacada.textContent).toMatch(/Parcela R\$ 1\.234/);

		// Mas o que se lê não se lê: borrado de verdade e fora do leitor de tela.
		const oculto = embacada.querySelector('[aria-hidden="true"]');
		expect(oculto).not.toBeNull();
		expect(oculto?.className).toMatch(/blur/);
		expect(oculto?.className).toMatch(/pointer-events-none/);
	});

	it("diz em TEXTO o que está acontecendo — o blur não é a única pista", () => {
		render(
			<OfertaEmbacada>
				<p>oferta</p>
			</OfertaEmbacada>,
		);
		expect(screen.getByTestId("desbloquear-opcoes").textContent).toMatch(
			/Desbloquear minhas opções/,
		);
	});

	it("o clique leva ao CAMPO do telefone — é ele que desbloqueia, não o clique", () => {
		render(
			<>
				<OfertaEmbacada>
					<p>oferta</p>
				</OfertaEmbacada>
				<input id="desbloqueio-phone" />
			</>,
		);
		const campo = document.getElementById("desbloqueio-phone");
		fireEvent.click(screen.getByTestId("desbloquear-opcoes"));
		expect(document.activeElement).toBe(campo);
	});

	it("campo desabilitado (card do histórico) ⇒ o clique não finge que focou", () => {
		render(
			<>
				<OfertaEmbacada>
					<p>oferta</p>
				</OfertaEmbacada>
				<input id="desbloqueio-phone" disabled />
			</>,
		);
		fireEvent.click(screen.getByTestId("desbloquear-opcoes"));
		expect(document.activeElement).not.toBe(document.getElementById("desbloqueio-phone"));
	});
});