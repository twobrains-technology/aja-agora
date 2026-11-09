---
slug: llm-401-gateway-local
titulo: "Bot mudo no local: LLM devolve 401 (chave velha e modelo que o gateway não serve)"
status: done-local          # corrigido no ambiente local; nada a mudar no repo
severidade: alta
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/llm-401-gateway-local.log
mexe_em:
  - .env / .env.local (fora do git)
  - ~/.tb-local/_shared/litellm.config.yaml (gateway compartilhado)
---

## Palavras do operador
> "a fala com o bot não está funcional, veja o que é agora nessa sessão" / "usa a mesma chave da twobrains da anthropic que está lá no litellm aqui no nosso local, e faça funcionar"

## Cenário
- **Rota/tela:** http://aja-app-develop.orb.local:3000 (landing → chat)
- **Passos:** 1) abrir a landing 2) clicar num chip ou mandar "Quero comprar um carro." 3) o bot responde "Acho que me perdi por aqui. Pode mandar de novo, por favor?"
- **Log:** `[pi] provedor falhou: 401 ... Invalid proxy server token` → `turno_sem_fala`.

## Esperado × Atual
- **Esperado:** o vendedor responde com o modelo do agente.
- **Atual:** turno mudo. `LITELLM_API_KEY=sk-local-dev` (a OLD_MASTER) foi invalidada na migração do gateway para chave virtual por aplicação, e `AI_MODEL=claude-haiku-4-5` já não existia no gateway (decisão de 23/10: só modelos locais).

## Correção aplicada (local)
1. `.env` e `.env.local`: `LITELLM_API_KEY` passou à chave virtual `aja-agora-dev` (cofre `gateway-llm`, `AJA_AGORA_DEV`); backups `.env*.bak-antes-gateway-2026-11-09`.
2. Gateway: alias `claude-haiku-4-5` devolvido à `litellm.config.yaml` com a `ANTHROPIC_API_KEY` da TwoBrains já presente no `.env.shared.litellm` (backup `.bak-20261109-claude-haiku-aja`) e liberado na chave `aja-agora-dev`.
3. `AI_MODEL` e `AI_ANALYZER_MODEL` = `claude-haiku-4-5`. Haiku respondeu "Oi, tudo bem?" pela chave do app.

## Pendente de prova
Turno real pelo navegador (o curl na `/api/chat` dá 404 por causa do meu corpo de requisição, não do app).
