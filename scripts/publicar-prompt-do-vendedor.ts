/**
 * Publica o PROMPT DO VENDEDOR na caixa (`caixa_de_prompt`), por label.
 *
 * O código é o fallback; a linha publicada VENCE. Sem publicar, o ambiente
 * continua rodando o prompt antigo (funil) e o modelo nunca busca carta.
 *
 *   pnpm exec tsx scripts/publicar-prompt-do-vendedor.ts dev production
 */
import "./_env-host";
import { lerCaixa, publicarCaixa } from "@/lib/agent/box/caixa";
import { PROMPT_DO_VENDEDOR } from "@/lib/agent/prompt-do-vendedor";

async function main(): Promise<void> {
	const labels = process.argv.slice(2);
	if (labels.length === 0) labels.push("dev");

	for (const label of labels) {
		const antes = await lerCaixa({ label }).catch(() => null);
		const { versao } = await publicarCaixa({
			texto: PROMPT_DO_VENDEDOR,
			label,
			publicadoPor: "mandato-vendedor-livre",
		});
		console.log(
			`[caixa] label=${label} versao=${versao} (antes: v${antes?.versao ?? 0} origem=${antes?.origem ?? "-"})`,
		);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
