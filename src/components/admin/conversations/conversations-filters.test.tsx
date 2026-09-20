// @vitest-environment happy-dom
// @vitest-environment-options { "url": "http://localhost/admin/conversations" }

// Conversas passou a usar o MESMO filtro de período do resto do painel.
//
// O defeito que este arquivo protege: a tela tinha o par De/Até próprio, sem
// ler nem escrever o cookie `aja_periodo`. Escolher 30 dias em Performance e
// clicar em Conversas pelo menu (que navega com `href` puro, sem querystring)
// devolvia a tela sem período nenhum — a escolha morria na navegação. Agora o
// período vem do `<DateRangeFilter/>`, que lê o cookie e reidrata a URL.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeriodoProvider } from "@/components/admin/dashboard/periodo-provider";
import { COOKIE_DO_PERIODO } from "@/lib/admin/periodo";
import { ConversationsFilters } from "./conversations-filters";

const HOJE = "2026-08-19";
const TRINTA_DIAS_DE = "2026-07-21";

const VALOR_VAZIO = {
	channel: "all",
	status: "all",
	q: "",
	from: null,
	to: null,
} as const;

function montar({ veioDoCookie = false }: { veioDoCookie?: boolean } = {}) {
	const onChange = vi.fn();
	render(
		<NuqsTestingAdapter hasMemory searchParams="" resetUrlUpdateQueueOnMount={false}>
			<PeriodoProvider
				de={veioDoCookie ? TRINTA_DIAS_DE : HOJE}
				ate={veioDoCookie ? HOJE : HOJE}
				veioDoCookie={veioDoCookie}
			>
				<ConversationsFilters value={VALOR_VAZIO} onChange={onChange} />
			</PeriodoProvider>
		</NuqsTestingAdapter>,
	);
	return { onChange };
}

describe("Conversas usa o filtro de período compartilhado", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		vi.setSystemTime(new Date("2026-08-19T18:00:00Z"));
		// biome-ignore lint/suspicious/noDocumentCookie: limpeza do cookie de teste, não é o código de produção.
		document.cookie = `${COOKIE_DO_PERIODO}=; path=/; max-age=0`;
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it("oferece os presets do painel, inclusive 'Desde o início'", () => {
		montar();

		expect(screen.getByRole("button", { name: "30 dias" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Desde o início" })).toBeTruthy();
	});

	it("não tem mais o par De/Até próprio", () => {
		montar();

		// Os botões "De" e "Até" eram os gatilhos do calendário local. Com o filtro
		// compartilhado, os campos de data vêm dele — e nenhum deles se chama "De".
		expect(screen.queryByRole("button", { name: /^De$/ })).toBeNull();
		expect(screen.queryByRole("button", { name: /^Até$/ })).toBeNull();
	});

	it("reidrata o período do cookie quando o menu navega com href puro", async () => {
		// O caso real: o layout é server component e NÃO é re-renderizado na
		// navegação suave, então os props chegam com o padrão de outra tela. O
		// cookie é a fonte viva — é ele que esta tela precisa adotar.
		// biome-ignore lint/suspicious/noDocumentCookie: o teste planta o cookie que o componente deve achar.
		document.cookie = `${COOKIE_DO_PERIODO}=${TRINTA_DIAS_DE}_${HOJE}; path=/`;

		montar({ veioDoCookie: false });

		await waitFor(() => expect(screen.getByText("21/07/2026")).toBeTruthy());
		expect(screen.getByText("19/08/2026")).toBeTruthy();
		expect(screen.getByRole("button", { name: "30 dias" }).getAttribute("aria-pressed")).toBe(
			"true",
		);
	});

	it("escolher o período não mexe nos outros filtros da tela", () => {
		// O período passou a ser estado do PAINEL, não do filtro local: o
		// `onChange` da tela não pode ser chamado com `from`/`to`, senão os dois
		// controles voltam a brigar pela mesma querystring.
		const { onChange } = montar();

		fireEvent.click(screen.getByRole("button", { name: "Hoje" }));

		expect(onChange).not.toHaveBeenCalled();
	});
});
