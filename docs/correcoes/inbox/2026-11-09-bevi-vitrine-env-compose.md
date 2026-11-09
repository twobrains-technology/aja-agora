---
slug: bevi-vitrine-env-compose
titulo: "Local: busca de cartas falha ('sistema da administradora saiu do ar') porque o compose esvazia as variáveis da vitrine e da Bevi"
status: done-local
severidade: alta
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/bevi-fora-do-ar-local-print.png
  - _evidencia/bevi-fora-do-ar-local.log
mexe_em:
  - .env (fora do git) / docker-compose.yml:130-141 / ~/.claude/skills/local-dev/scripts/bootstrap-workspace.sh (quem gera o .env)
---

## Palavras do operador
> "ajuste os envs locais de dev, deve estar incorreto porque não está batendo na bevi... deixe bater igual prod sem problemas, quero testar tudo local aqui do jeito certo"

## Cenário
- **Rota/tela:** chat web local; lead pede carro com parcela de R$ 500.
- **Print:** o agente diz "o sistema da administradora saiu do ar agora há pouco. Me chama lá no WhatsApp..." (`_evidencia/bevi-fora-do-ar-local-print.png`).
- **Log da ferramenta:** `buscar_cartas` → "Busca rápida indisponível: a identidade da casa não está configurada (VITRINE_CPF/VITRINE_CELULAR)".

## Esperado × Atual
- **Esperado:** o local fala com a Bevi como a produção e a busca devolve cartas reais.
- **Atual:** a Bevi nem era chamada. O `docker-compose.yml` só repassa ao container o que está no `.env`, e `VITRINE_CPF`, `VITRINE_CELULAR`, `IDENTITY_ENC_KEY`, `BEVI_SELFCONTRACT_HASH`, `LANGFUSE_TRACING_*` e `REDIS_DB_INDEX` existiam só no `.env.local`. O compose as materializa como string vazia, e variável de processo vale mais que `.env.local` no Next.

## Prova de que o resto bate com produção
Comparado com o segredo `tb/prod/aja-agora/env` (sem imprimir valores): `BEVI_API_TOKEN`, `BEVI_BASE_URL`, `BEVI_PRODUCT_ID`, `BEVI_SELFCONTRACT_HASH`, `PROPOSAL_GATEWAY`, `VITRINE_CPF`, `VITRINE_CELULAR` são iguais. Diferenças deliberadas: `IDENTITY_ENC_KEY` (chave de cifra do CPF no banco local, não se copia a de prod), `AI_MODEL` e as chaves do LiteLLM (o local usa o gateway local com `claude-haiku-4-5`).

## Correção aplicada (local)
As 7 chaves foram copiadas do `.env.local` para o `.env` (backup `.env.bak-antes-sync-compose-2026-11-09`). Prova: turno real, `buscar_cartas` devolveu cartas do Banco do Brasil (parcela 509,78, 49 meses) e a conversa chegou à tabela comparativa.

## Pendência de causa raiz (vira demanda)
O `bootstrap-workspace.sh` gera o `.env` com um subconjunto e deixa de fora as chaves que o compose referencia. Qualquer workspace novo repete o defeito. Correção durável: o script (ou um `--env-file .env.local` no compose) sincronizar TODAS as chaves `${...}` do compose.
