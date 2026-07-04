---
id: FIX-220
titulo: "1ª lista: todos os grupos com mesmo peso (sem 'preferencial/recomendado')"
status: todo
severidade: media
projeto: aja-agora
bloco: bloco-cards-recomendacao
arquivos:
  - src/components/chat/artifacts/recommendation-card.tsx
  - src/components/chat/artifacts/group-card.tsx
  - src/lib/agent/orchestrator/directives.ts
rodada: 2026-07-04 — Ata de alinhamento com o cliente (item 4.1, P1)
---
## Palavras do operador
> Ata 4.1: *"Na 1ª lista, mostrar basicamente todos os grupos com mesmo peso — sem 'preferencial', porque ainda não há dado de lance pra recomendar nada."*

## Cenário exato
- Primeiro reveal, **antes** de o usuário informar lance/recurso próprio: a lista deve ser neutra (sem destaque de "recomendado").

## Esperado × Atual
- **Esperado:** na 1ª lista, todos os grupos aparecem com **mesmo peso** — sem selo "Recomendação", sem card hero em destaque.
- **Atual:** o 1º card vem marcado como "Recomendação" (selo + hero), criando hierarquia sem base (não há dado de lance ainda).

## Root cause (INVESTIGADO)
- `rankGroups` já devolve **todos** (topN=Infinity, `recommendation.ts:112-116`).
- A hierarquia vem de: selo "Recomendação" (`recommendation-card.tsx:145-155`) + `highlightBestIndex=0` (`directives.ts:260`) + fit label (`recommendation-card.tsx:170-174`).

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Na 1ª lista (estado sem lance), **neutralizar** selo/highlight — sem "Recomendação", sem hero | `directives.ts:260` (não setar `highlightBestIndex`), `recommendation-card.tsx:145-174` (esconder selo/fit quando neutro) |
| Manter o destaque só pra quando entrar o **estágio 2** (recomendação personalizada — ONDA 2) | flag de estado (ex.: `recommendationStage`), documentar o gancho |

⚠️ A **recomendação em 2 estágios** completa é ONDA 2. Aqui só a 1ª lista neutra + o gancho pro estágio 2.

## Regressão exigida (TDD strict)
1. Teste que a 1ª lista de reveal (sem lance) **não** marca `highlightBestIndex` nem renderiza o selo "Recomendação".
2. Teste que, quando (futuramente) houver dado de lance/estágio 2, o destaque volta (gancho presente, mesmo que a lógica completa seja onda 2).
