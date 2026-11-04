// Roda a simulação de cliente (P12) fora do navegador: mesmo `rodarSimulacao` da tela, com
// `fetch` + cookie de sessão admin.
//
//   SIM_COOKIE='better-auth.session_token=…' [SIM_BASE_URL=http://localhost:3000] \
//     pnpm exec tsx scripts/eval/simulacao.ts --perfil caminho-feliz --perfil pede-atendente [--saida dir]
//
// Sem `--perfil`, roda os 9. Escreve `simulacao-AAAA-MM-DDTHH-MM.json` em `--saida` (padrão: .).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { IDS_DE_PERFIL, perfilPorId } from "../../src/lib/playground/simulacao/perfis-de-cliente";
import {
	montarExportacao,
	nomeDoArquivoDeExportacao,
	serializarExportacao,
} from "../../src/lib/playground/simulacao/relatorio";
import { rodarTodos } from "../../src/lib/playground/simulacao/rodar-simulacao";
import type { PerfilId, RespostaDeFalaDoCliente } from "../../src/lib/playground/simulacao/tipos";

function argumentos(argv: string[]) {
	const perfis: string[] = [];
	let saida = ".";
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--perfil" && argv[i + 1]) perfis.push(argv[++i]);
		else if (argv[i] === "--saida" && argv[i + 1]) saida = argv[++i];
	}
	return { perfis, saida };
}

async function main() {
	const cookie = process.env.SIM_COOKIE;
	if (!cookie) {
		console.error("Defina SIM_COOKIE com o cookie da sessão admin.");
		process.exit(2);
	}
	const base = (process.env.SIM_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
	const { perfis, saida } = argumentos(process.argv.slice(2));
	const invalidos = perfis.filter((p) => !(IDS_DE_PERFIL as readonly string[]).includes(p));
	if (invalidos.length > 0) {
		console.error(
			`Perfil desconhecido: ${invalidos.join(", ")}. Válidos: ${IDS_DE_PERFIL.join(", ")}`,
		);
		process.exit(2);
	}
	const ids = (perfis.length > 0 ? perfis : [...IDS_DE_PERFIL]) as PerfilId[];
	const headers = { "content-type": "application/json", cookie };

	const resultados = await rodarTodos(
		ids.map((id) => {
			const perfil = perfilPorId(id);
			return {
				perfil,
				dados: perfil.dados,
				modo: "antes" as const,
				aoTurno: (t) => console.log(`[${id}] turno ${t.indice + 1}: ${t.cliente.texto}`),
				aoEstado: (e) => console.log(`[${id}] estado: ${e}`),
			};
		}),
		{
			chamarChat: (corpo, sinal) =>
				fetch(`${base}/api/admin/playground/chat`, {
					method: "POST",
					headers,
					body: JSON.stringify(corpo),
					signal: sinal,
				}),
			falaDoCliente: async (pedido) => {
				const r = await fetch(`${base}/api/admin/playground/simulacao/cliente`, {
					method: "POST",
					headers,
					body: JSON.stringify(pedido),
				});
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return (await r.json()) as RespostaDeFalaDoCliente;
			},
		},
	);

	for (const r of resultados) {
		const acionadas = r.marcacoes.filter((m) => m.status === "ACIONADA").map((m) => m.id);
		console.log(
			`${r.perfilId}: ${r.veredito} · parada ${r.parada} · acionadas: ${acionadas.join(", ") || "nenhuma"}`,
		);
	}
	mkdirSync(saida, { recursive: true });
	const arquivo = join(saida, nomeDoArquivoDeExportacao());
	writeFileSync(arquivo, serializarExportacao(montarExportacao(resultados)));
	console.log(`JSON: ${arquivo}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
