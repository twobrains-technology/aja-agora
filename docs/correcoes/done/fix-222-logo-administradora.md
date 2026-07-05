---
id: FIX-222
titulo: "Logo da administradora no card de recomendação"
status: done
severidade: media
projeto: aja-agora
arquivos:
  - src/db/schema.ts
  - drizzle/0033_administradoras_logo_url.sql
  - src/lib/consorcio/administradora-logo.ts
  - src/lib/consorcio/administradora-logo-repo.ts
  - src/lib/agent/orchestrator/recommendation-payload.ts
  - src/lib/chat/types.ts
  - src/components/chat/reveal-selection.tsx
  - src/components/chat/artifacts/administradora-logo.tsx
  - src/components/chat/artifacts/recommendation-card.tsx
  - src/components/chat/artifacts/group-card.tsx
  - src/lib/agent/orchestrator/runner.ts
bloco: bloco-cards-recomendacao
rodada: 2026-07-04 — Ata de alinhamento com o cliente (item 4.2, P1)
commit: 8689239
executado_em: 2026-07-04
---
## Palavras do operador
> Ata 4.2: *"Adicionar o logo da administradora no card (traz confiabilidade e o cara sabe pra onde vai)."*

## Cenário exato
- Card de recomendação/grupo deve exibir o **logo da administradora** (Itaú, BB, Rodobens, etc.), não a marca genérica da Aja.

## Esperado × Atual
- **Esperado:** o card mostra o logo da administradora escolhida.
- **Atual:** o card usa `SunMark` (a marca da Aja Agora, `recommendation-card.tsx:153`); **não existe** logo de administradora em lugar nenhum do domínio.

## Root cause (INVESTIGADO)
- Tabela `administradoras` (`schema.ts:654-670`) tem só `id, nome, slug, codigoBevi, isActive` — **sem coluna de logo**.
- Nenhum campo `logo*` em `GroupSummary` (`adapters/types.ts:7-26`) nem nos payloads (`chat/types.ts`).
- Administradora chega do `offer.bankLabel ?? offer.bank` (`offer-mapper.ts:109`).

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Adicionar fonte do logo: coluna `logo_url` (ou convenção de asset local por `slug`) na tabela `administradoras` | `schema.ts:654-670` + **migration via ambiente** (drizzle, NÃO à mão contra o banco) |
| Propagar o logo pelo pipeline até o card | `offer-mapper.ts:109` (mapear por `nome`/`slug`) → `GroupSummary`/payload → card |
| Renderizar o logo no card com **fallback gracioso** (iniciais/nome da administradora) quando não houver logo | `recommendation-card.tsx:153`, `group-card.tsx:92` |

⚠️ **Assets de logo reais são PENDENTE (sourcing/design)** — implemente o **pipeline + fallback** e popule com o que houver; registre no `.done/` que faltam os arquivos de imagem por administradora.

## Regressão exigida (TDD strict)
1. Teste que o card renderiza o logo quando a administradora tem `logo_url`.
2. Teste que o card cai no **fallback** (iniciais/nome) quando não há logo — sem quebrar.
3. Migration: gerada via drizzle (arquivo de migration versionado), não `ALTER` manual.

## Implementação (2026-07-04)

- **Migration**: `drizzle/0033_administradoras_logo_url.sql`, gerada via `pnpm db:generate` (nunca aplicada contra banco remoto por este bloco — só o arquivo versionado + meta/snapshot).
- **Pipeline** (sem quebrar a pureza de `offer-mapper.ts`, que não tem I/O): a decisão foi **não** mapear o logo no `offer-mapper.ts` (a Bevi não tem esse dado — é dado NOSSO, interno). Em vez disso: `src/lib/consorcio/administradora-logo.ts` (matching puro, tolerante a acento/caixa) + `administradora-logo-repo.ts` (consulta `administradoras` no DB) + `runner.ts` carrega o índice sob demanda (memoizado por turno) e injeta em `coerceRecommendationPayload`/`coerceComparisonPayload` — mesmo padrão de coerção server-side do `avgBidValue` (FIX-223): a LLM nunca fabrica a URL do logo.
- **UI**: componente `AdministradoraLogo` (novo) usado em `recommendation-card.tsx` e `group-card.tsx` — `<img>` quando há `logoUrl`, fallback de iniciais (2 primeiras letras) quando ausente.
- **PENDENTE (assets)**: nenhuma administradora tem `logo_url` cadastrado ainda — o pipeline está pronto (schema + repo + UI + coerção), mas o fallback de iniciais é o que aparece hoje em produção até o sourcing/design dos logos reais e o preenchimento da coluna via admin.
