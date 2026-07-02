# Página do simulador (`/admin/simulator/*`) é servida em prod e mostra "HTTP 404" cru

**Achado:** QA dono-de-produto 2026-07-02, jornada serviços×WhatsApp em PRODUÇÃO (`https://ajaagora.com.br`).
**Severidade:** baixa (UX/higiene) — não afeta o produto do cliente; é tela admin interna.

## Cenário exato

1. Login admin em `https://ajaagora.com.br/admin/login` → OK.
2. Abrir `https://ajaagora.com.br/admin/simulator/whatsapp`.
3. A **página React carrega normalmente** (shell, título "Simulador — Cliente no WhatsApp",
   sidebar, botão "Nova conversa").
4. A sidebar exibe um badge de erro **`HTTP 404`** cru e "Nenhuma simulação ainda".
5. Clicar "Nova conversa" não faz nada visível (segundo 404).

## Esperado × Atual

- **Esperado:** em produção (simulador dev-only, desabilitado por design), a página
  `/admin/simulator/*` não deveria ser navegável — deveria dar `notFound()` server-side
  ou esconder a entrada de menu, coerente com as rotas de API que já 404am.
- **Atual:** a **API** 404a (correto, gate `isSimulatorEnabled()`), mas a **página** é
  servida e vaza um "HTTP 404" técnico pro admin, sem explicação. Inconsistência entre o
  gate de página e o gate de API.

## Evidência (console de rede, prod)

```
404 @ GET  https://ajaagora.com.br/api/admin/simulator/sessions?channel=whatsapp
404 @ POST https://ajaagora.com.br/api/admin/simulator/sessions
```
Screenshot: `.playwright-mcp/blocker-simulador-prod-404.png` (viewport 414×896).

## Onde provavelmente mexe

- `src/app/admin/(dashboard)/simulator/whatsapp/page.tsx` (e irmãs `web/`, `attendant/`,
  `page.tsx` do índice) — chamam `isSimulatorEnabled()` mas aparentemente não fazem
  `notFound()` server-side quando desabilitado. Alinhar o gate de página ao gate de API
  (`src/app/api/admin/simulator/sessions/route.ts:25`).
- Alternativa mínima: se `!isSimulatorEnabled()`, o componente da sidebar
  (`src/components/admin/simulator/inbox.tsx`) deveria mostrar uma mensagem humana
  ("Simulador indisponível neste ambiente") em vez de `HTTP 404`.

## Nota

Defeito **secundário** ao bloqueio principal desta rodada: o simulador é dev-only e não
roda em prod (decisão de arquitetura, Bug B-01 em `src/lib/utils/env.ts`). Ver ledger da
rodada e a decisão do Kairo (habilitar em prod via flag `SIMULATOR_FORCE_ENABLE`).
