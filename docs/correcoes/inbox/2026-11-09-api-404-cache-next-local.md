---
slug: api-404-cache-next-local
titulo: "Agente mudo no local: toda rota /api/* devolvia 404 (cache .next do container corrompido)"
status: done-local
severidade: alta
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/api-404-cache-next-local.log
mexe_em:
  - container aja-app-develop (volume anônimo /app/.next) — fora do repo
---

## Palavras do operador
> "local em dev o agente ainda não responde, deve ter algo errado na config"

## Cenário
- **Rota/tela:** chat web local, https://aja-app-develop.orb.local
- **Passos:** enviar qualquer mensagem. O navegador loga `[chat] erro no stream: Error: <!DOCTYPE html>...` (recebeu a página 404 no lugar do stream).

## Esperado × Atual
- **Esperado:** `POST /api/chat` abre o stream e o vendedor responde.
- **Atual:** `POST /api/chat` e TODA `/api/*` (`/api/track`, `/api/leads`...) davam 404, também de dentro do container. Não era chave nem modelo: o roteador de dev perdeu as rotas de API.

## Causa (provada)
O `.next` do container é um volume anônimo que sobreviveu a quatro `--force-recreate` seguidos (troca de env). O cache do Turbopack ficou inconsistente e deixou de registrar as rotas de API.

## Correção aplicada (local)
`rm -rf /app/.next/dev /app/.next/cache` no container + `docker restart`. Depois: `/api/track` = 405 (existe), e um turno real em `POST /api/chat` respondeu com `claude-haiku-4-5` (`erro=ok`), 2 mensagens gravadas.

## Pista para o futuro
Recriar o app mais de uma vez em sequência pode repetir. Se voltar o 404 em `/api/*`, limpar `/app/.next/dev` e reiniciar antes de investigar chave ou modelo.
