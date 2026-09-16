// Marcos do funil no `dataLayer`, para o GTM.
//
// O `event_id` vem do SERVIDOR, nunca sorteado aqui. A Meta deduplica
// Pixel × CAPI pelo par `event_name` + `event_id`: id diferente dos dois lados
// faz o mesmo fato contar duas vezes, e o sintoma é uma métrica que sobe — o
// tipo de defeito que ninguém investiga. `/api/track/data-layer` devolve a
// mesma chave que foi gravada em `conversion_events`.
//
// Best-effort por natureza, como todo o resto da medição: bloqueador, rede
// caída ou GTM ausente não podem atrapalhar a conversa.

/** O que o GTM recebe. Espelha o contrato acertado com o Growth. */
export interface MarcoDataLayer {
	event: string;
	event_id: string;
	journey_stage: string;
	transaction_id?: string;
	value?: number;
	currency?: string;
}

/**
 * O que já foi empurrado nesta aba.
 *
 * `sessionStorage` e não memória: o componente do chat remonta, e sem isto o
 * mesmo `lead` iria ao `dataLayer` de novo a cada remontagem. A chave é o
 * `event_id`, que é estável por definição.
 */
const CHAVE = "aja:datalayer:empurrados";

function jaEmpurrados(): Set<string> {
	try {
		const bruto = window.sessionStorage.getItem(CHAVE);
		return new Set(bruto ? (JSON.parse(bruto) as string[]) : []);
	} catch {
		return new Set();
	}
}

function guardar(ids: Set<string>): void {
	try {
		window.sessionStorage.setItem(CHAVE, JSON.stringify([...ids]));
	} catch {
		// Sessão anônima com storage bloqueado: empurrar de novo é melhor do que
		// não medir. A dedup da Meta pelo event_id ainda segura a duplicata.
	}
}

/**
 * Empurra no `dataLayer` o que o navegador sabe sozinho.
 *
 * Usado pela abertura do teatro: `chat_opened` é diagnóstico puro de browser —
 * não existe do lado do servidor e, por decisão do PRD (§6.2), está fora da
 * fila comercial da CAPI. O `event_id` aqui é o mesmo que vai no `eventID` do
 * pixel, para o GTM e o Pixel não contarem a mesma abertura duas vezes.
 */
export function empurrarNoDataLayer(marco: MarcoDataLayer & Record<string, unknown>): void {
	if (typeof window === "undefined") return;
	try {
		const janela = window as unknown as { dataLayer?: unknown[] };
		janela.dataLayer = janela.dataLayer || [];
		janela.dataLayer.push({ ...marco });
	} catch {
		// Medir nunca derruba o produto.
	}
}

/**
 * Empurra os marcos que ainda não foram empurrados nesta aba.
 *
 * Devolve quantos foram — útil para teste e para log, nunca para decisão de
 * produto.
 */
export async function empurrarMarcosNoDataLayer(conversationId: string): Promise<number> {
	if (typeof window === "undefined" || !conversationId) return 0;

	try {
		const resposta = await fetch(
			`/api/track/data-layer?conversationId=${encodeURIComponent(conversationId)}`,
			{ headers: { Accept: "application/json" } },
		);
		if (!resposta.ok) return 0;

		const { eventos } = (await resposta.json()) as { eventos?: MarcoDataLayer[] };
		if (!Array.isArray(eventos) || eventos.length === 0) return 0;

		const janela = window as unknown as { dataLayer?: unknown[] };
		janela.dataLayer = janela.dataLayer || [];

		const empurrados = jaEmpurrados();
		let novos = 0;
		for (const marco of eventos) {
			if (!marco?.event_id || empurrados.has(marco.event_id)) continue;
			janela.dataLayer.push({ ...marco });
			empurrados.add(marco.event_id);
			novos += 1;
		}
		if (novos > 0) guardar(empurrados);
		return novos;
	} catch {
		// Medir nunca derruba o produto.
		return 0;
	}
}
