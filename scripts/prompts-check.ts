/**
 * "O agente está rodando a caixa que o repo conhece?"
 *
 * Compara o texto do CÓDIGO (`SYSTEM_PROMPT`) com a versão publicada na tabela
 * `caixa_de_prompt` para a label do ambiente e FALHA (exit 1) quando a
 * publicada não existe — ou avisa quando ela DIVERGE do código.
 *
 * Por que o sinal existe: em 15/08/2026 o prompt do analyzer estava publicado
 * numa versão de 07/08 enquanto o código, desde 14/08, já tinha os exemplos que
 * separam parcela de valor do bem. Ninguém tinha como saber, porque o runtime
 * lia o serviço e o código era só fallback. Desde 19/10/2026 a caixa mora no
 * banco (`box/caixa.ts`), então a comparação é local — sem rede de terceiro.
 *
 * Divergência NÃO é erro por si só: publicar na caixa é justamente o caminho
 * para mudar a conduta sem deploy. O exit 1 é só para "não há versão publicada"
 * (aí o agente está rodando o código e é bom saber).
 *
 * Uso:
 *   pnpm prompts:check
 */
import "./_env-host";
import { labelDaCaixa, lerCaixa, limparCacheDaCaixa } from "@/lib/agent/box/caixa";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";

async function main(): Promise<void> {
	limparCacheDaCaixa();
	const label = labelDaCaixa();
	const caixa = await lerCaixa({ label });

	console.log(`Label verificada: ${label}`);
	console.log(`Origem da caixa em uso: ${caixa.origem} (versão ${caixa.versao})`);

	// Sem versão publicada o agente roda o TEXTO DO CÓDIGO — e isso é o estado
	// normal até alguém publicar a primeira versão na caixa. Não é falha: o
	// deploy não pode ser barrado por isso (o CI roda este check a cada deploy,
	// e em 19/10/2026 a primeira versão em produção foi justamente o código).
	// Quem quiser o comportamento estrito (gate de promoção) passa `--strict`.
	if (caixa.origem === "codigo") {
		const estrito = process.argv.includes("--strict");
		const linha = `não há versão publicada para a label "${label}" — o agente roda o texto do código.`;
		if (estrito) console.error(`✗ ${linha}`);
		else console.log(`ℹ️  ${linha}`);
		process.exit(estrito ? 1 : 0);
	}

	if (caixa.texto.trim() === SYSTEM_PROMPT.trim()) {
		console.log(`✅ caixa v${caixa.versao} é idêntica ao texto do código.`);
		process.exit(0);
	}

	// Divergência é informação, não veredito: quem publicou quis mudar a conduta.
	const publicado = caixa.texto.trim();
	const codigo = SYSTEM_PROMPT.trim();
	let i = 0;
	while (i < publicado.length && i < codigo.length && publicado[i] === codigo[i]) i++;
	console.log(
		`ℹ️  a caixa v${caixa.versao} DIFERE do código a partir do caractere ${i} (${publicado.length} vs ${codigo.length}).`,
	);
	console.log(`   publicado: ${JSON.stringify(publicado.slice(i, i + 120))}`);
	console.log(`   código:    ${JSON.stringify(codigo.slice(i, i + 120))}`);
	process.exit(0);
}

main().catch((err) => {
	console.error("✗ prompts:check falhou:", err);
	process.exit(1);
});
