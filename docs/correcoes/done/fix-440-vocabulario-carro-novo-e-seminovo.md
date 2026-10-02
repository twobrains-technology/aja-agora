---
id: FIX-440
titulo: "Vocabulário de carro: \"carro novo\" e \"seminovo\", nunca \"carro popular\""
status: done
bloco: vocabulario-carro-novo-e-seminovo
commit: a48f114a
arquivos:
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/langgraph/nodes/lean-prompt-entrega-as-regras.test.ts
rodada: 2026-10-02
executado_em: 2026-10-02
---
## Palavras do operador
> "A gente tem que tirar isso aqui. Deixar só põe um carro novo, põe novo e seminovo, né?" (Bruna, 11:52:15)
> "Como a gente não tem nenhuma correção da IA para alguns termos aí, ela usa o que ela... Tá na cabeça dela lá." (Kairo, 11:51:48)

## O que estava no ar (medido)
O termo vinha do **modelo** — o próprio atalho dele ofereceu "Um popular novo" (`8b64899b`). Nenhuma fonte
de runtime tinha o termo. Texto que o cliente lê não pode entrar fixo no servidor; entra por
cadastro/prompt.

## O que mudou (D11)
Uma linha na seção "## Tom e Personalidade" do `SYSTEM_PROMPT` (fora do trecho que o `leanSystemPrompt`
corta, então sobrevive ao recorte sem tag `[VITRINE]`):

> `- **Vocabulário de carro:** carro se diz "carro novo" ou "seminovo" (sem hífen), nunca "carro popular" nem "popular". Vale também nos rótulos dos atalhos.`

**B9b** (commit `7cd323c0`): o `(FIX-440)` foi **removido** do texto — número de card é rastreio interno e
não entra no texto que o modelo lê nem no que é publicado no Langfuse. A regra ficou inteira, e esta linha
continua sendo a **única** diferença de `system-prompt.ts` contra a base.

## Provado
- Teste `lean-prompt-entrega-as-regras.test.ts`: asserta sobre `leanSystemPrompt(SYSTEM_PROMPT)` (o artefato
  que o modelo de fato recebe) que contém `seminovo` e a proibição literal `nunca "carro popular" nem
  "popular"`. Visto falhar antes da linha; **12 testes verdes** depois. `typecheck` exit 0.

## PENDENTE-KAIRO
A linha só vale em produção depois do **`pnpm sync-prompts`** na instância certa. `pnpm prompts:check` fica
vermelho até lá — **esperado**. Ninguém desta frente roda o `sync-prompts`.