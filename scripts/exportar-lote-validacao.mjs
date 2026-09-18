#!/usr/bin/env node
/**
 * LOTE DE VALIDAÇÃO (pedido do Gustavo, prazo 22/09) — CSV + JSON, mascarado.
 *
 * Roda com `node` puro. O módulo `src/lib/exportacao` é TypeScript com os
 * apelidos `@/`, então o script se reexecuta UMA vez sob o `--import tsx`
 * (registrar o tsx em runtime não basta: o resolvedor programático ignora o
 * `paths` sem `baseUrl` explícito, e o `tsconfig.json` é do Next). É o MESMO
 * módulo que a tela e a API usam — o lote não pode ter uma segunda
 * implementação do pedido.
 *
 * Somente SELECT. O script nunca escreve no banco e nunca toca produção por
 * conta própria: quem abre o túnel e passa a `DATABASE_URL` é o líder.
 *
 * Uso:
 *   DATABASE_URL=postgres://... node scripts/exportar-lote-validacao.mjs \
 *     --de 2026-09-10 --ate 2026-09-18 --limite 20 --formato csv,json --saida /tmp/lote
 *
 * `--limite` trava nas N conversas com mensagem mais recente na janela; o
 * percurso e os toques usam a MESMA janela (de/até), sem o teto de conversas —
 * o percurso existe justamente para mostrar quem NÃO virou conversa.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Primeiro passe (node puro): reexecuta sob o tsx e sai.
if (!process.env.__LOTE_TSX) {
	const arquivo = fileURLToPath(import.meta.url);
	const resultado = spawnSync(
		process.execPath,
		["--import", "tsx", arquivo, ...process.argv.slice(2)],
		{ stdio: "inherit", env: { ...process.env, __LOTE_TSX: "1" } },
	);
	process.exit(resultado.status ?? 1);
}

const { exportarConversas } = await import("../src/lib/exportacao/conversas.ts");
const { exportarPercurso } = await import("../src/lib/exportacao/percurso.ts");
const { exportarToquesDaRegua } = await import("../src/lib/exportacao/toques.ts");
const { gerar } = await import("../src/lib/exportacao/formato.ts");

// ─── Argumentos ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function ler(nome) {
	const indice = args.indexOf(`--${nome}`);
	return indice >= 0 ? args[indice + 1] : undefined;
}
function temFlag(nome) {
	return args.includes(`--${nome}`);
}

const de = ler("de");
const ate = ler("ate");
const limite = Number(ler("limite") ?? 20) || 20;
const saida = ler("saida") ?? ".";
const formatos = (ler("formato") ?? "csv,json")
	.split(",")
	.map((f) => f.trim().toLowerCase())
	.filter((f) => f === "csv" || f === "json");

if (!de || !ate || !process.env.DATABASE_URL) {
	console.error(
		"Uso: DATABASE_URL=... node scripts/exportar-lote-validacao.mjs --de YYYY-MM-DD --ate YYYY-MM-DD [--limite 20] [--formato csv,json] [--saida DIR] [--completo]",
	);
	process.exit(2);
}

// Início do dia `de` (00:00 -03:00) e fim do dia `ate` (23:59:59.999 -03:00),
// para o recorte ser dias inteiros do negócio, e não instantes arbitrários.
const deData = new Date(`${de}T00:00:00-03:00`);
const ateData = new Date(`${ate}T23:59:59.999-03:00`);
if (Number.isNaN(deData.getTime()) || Number.isNaN(ateData.getTime())) {
	console.error("Datas inválidas: use YYYY-MM-DD.");
	process.exit(2);
}

const mascarar = !temFlag("completo");

// ─── Extração ────────────────────────────────────────────────────────────────
const opcoes = { de: deData, ate: ateData, mascarar };
const conversas = await exportarConversas({ ...opcoes, limiteConversas: limite });
const percurso = await exportarPercurso(opcoes);
const toques = await exportarToquesDaRegua(opcoes);

mkdirSync(resolve(saida), { recursive: true });

const arquivos = { conversas, percurso, toques };
const escritos = [];
for (const [nome, linhas] of Object.entries(arquivos)) {
	for (const formato of formatos) {
		const caminho = resolve(saida, `${nome}.${formato}`);
		writeFileSync(caminho, gerar(formato, linhas), "utf8");
		escritos.push(`${nome}.${formato}`);
	}
	console.log(`linhas_${nome}=${linhas.length}`);
}

// ─── LEIA-ME ─────────────────────────────────────────────────────────────────
const leiaMe = `# Lote de validação — exportação Aja Agora

Recorte: conversas com mensagem entre **${de}** e **${ate}** (dias do fuso de
São Paulo). Limite de conversas no arquivo de conversas: **${limite}**.
Dado pessoal: **${mascarar ? "mascarado (padrão)" : "COMPLETO — uso restrito"}**.

## Arquivos

- \`conversas.*\` — uma linha por MENSAGEM, em ordem cronológica, com **autoria**
  (cliente/agente/atendente/sistema), tipo (texto/áudio/imagem/documento/template/card)
  e a **etapa do funil no momento** da mensagem (do histórico \`lead_events\`).
- \`percurso.*\` — uma linha por PESSOA: de onde veio, até que degrau chegou,
  quantas chegadas/conversas/mensagens. Inclui quem chegou e **não** virou lead.
- \`toques.*\` — uma linha por entrada na régua de remarketing: passo, status,
  próximo toque e motivo de saída.

## Regras que o arquivo cumpre

- **Nenhuma célula vazia.** Vínculo ausente e dado indisponível saem ESCRITOS
  ("sem vínculo: conversa sem visita", "indisponível: nome não capturado",
  "não estruturado: derivado de utm_campanha"). A geração FALHA se uma célula
  sair em branco — o vazio é defeito, não dado ausente.
- **Autoria** vem de \`messages.role\` + persona: "atendente" é a fala humana da
  mesa, distinta do agente.
- **Experimento e versão NÃO são campos estruturados** — não existe tabela de
  teste A/B no banco. As colunas \`experimento\`/\`versao\` trazem o
  \`utm_campaign\`/\`utm_content\` cru e são declaradas derivadas de UTM.
- **Mascaramento** (padrão): telefone \`55629***6793\`, e-mail \`m***@dominio\`,
  nome só o primeiro. O arquivo completo só sai com \`--completo\`, uso restrito.

## Disponibilidade dos dados

Fotografia do banco no momento da extração. O histórico é append-only: dados
posteriores à data de corte (**${ate}**) não estão neste lote. Para acompanhar
mais mensagens, reexecutar com um \`--ate\` posterior.

Arquivos gerados: ${escritos.join(", ")}.
`;

writeFileSync(resolve(saida, "LEIA-ME.md"), leiaMe, "utf8");
console.log(`saida=${resolve(saida)}`);
console.log(`arquivos=${escritos.length + 1}`);
