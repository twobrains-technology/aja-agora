# Ledger QA do Dono — Imóvel × WhatsApp (PRODUÇÃO)

- **Data:** 2026-07-02
- **Escopo pedido:** jornada de imóvel no canal WhatsApp, via o simulador interno de
  produção (`/admin/simulator/whatsapp`, waId `SIM-…`), do sonho à proposta, validando
  artefatos WhatsApp (bolhas, botões, fatiamento) e a paridade web × WhatsApp.
- **Ambiente:** PRODUÇÃO — `https://ajaagora.com.br`.
- **Conta de teste prevista:** CONTA2 (Mirella Mendanha Paulino), CPF `03780251124`,
  celular `5562994641111` (homologação Bevi/Conexia — fechar é seguro).
- **Oráculo:** `docs/qa/roteiro-qa.md` (seção 5, canais web × WhatsApp) + jornada canônica.

## Resultado: 🚫 BLOQUEADO — jornada não pôde ser dirigida em produção

O simulador de WhatsApp **não existe em produção por design**. Nenhum cenário da jornada
(passos 1–7) foi exercido. Ledger de cenários vazio — não há PASS/FAIL a reportar porque
o ponto de entrada do teste está indisponível no ambiente pedido.

## Evidência do bloqueio

| # | Cenário | Origem | Tipo | Status | Evidência |
|---|---------|--------|------|--------|-----------|
| 0 | Login admin prod | roteiro §2 | pré-req | ✅ OK | logou em `/admin` |
| 1 | Abrir simulador WhatsApp e criar sessão SIM-… | escopo | pré-req | 🚫 BLOQUEADO | `GET/POST /api/admin/simulator/sessions` → **HTTP 404** em prod; inbox mostra "HTTP 404"; "Nova conversa" também 404 |

- Screenshot: `docs/correcoes/inbox/_evidencia/qa-imovel-whatsapp/prod-simulator-http404.png`
- Console prod (2 erros): `404 @ /api/admin/simulator/sessions?channel=whatsapp` e
  `404 @ /api/admin/simulator/sessions` (POST do "Nova conversa").

## Causa-raiz (verificada no código, não hipótese)

`src/lib/utils/env.ts:12-16` — `isSimulatorEnabled()` retorna `false` quando
`TB_ENV=production|prod`. As rotas `src/app/api/admin/simulator/sessions/route.ts` (GET e
POST, linhas 26-28 e 99-101) e as rotas `whatsapp/[conversationId]/{stream,send}`
retornam `404 Not Found` nesse caso. O simulador é **ferramenta dev-only** — expõe a
interceptação da saída pra Meta API, então é intencionalmente bloqueado em produção.
**Isto é decisão de arquitetura vigente, NÃO defeito de produto.**

## Caminhos tentados (todos não-destrutivos) e por que falharam

1. **PROD** (`ajaagora.com.br`) — simulador 404 por design. ❌
2. **DEV AWS** (`tb-dev-aja-agora.twobrainstechnology.com`) — scale-to-zero, acordou OK,
   simulador habilitado lá; porém as credenciais anexadas (admin de PROD) retornam
   "Invalid email or password" no DEV. Sem credenciais do DEV, não dá pra logar. ❌
3. **Mexer em `TB_ENV` no env de prod** — blast radius em PRODUÇÃO; exige aval explícito
   do Kairo. Não executado. ⏸️
4. **Rodar local (container do worktree)** — proibido pela tarefa ("NÃO rode o app
   localmente"). Não executado. ⏸️

## Achados (o único produzido nesta rodada)

- **MELHORIA (UX admin)** — em prod o inbox do simulador despeja o texto cru "HTTP 404"
  e mantém o botão "Nova conversa" ativo (que também 404). Como o simulador é
  intencionalmente indisponível em prod, a tela deveria mostrar um estado explícito
  ("Simulador disponível apenas em ambientes de desenvolvimento") em vez de parecer
  quebrado. Card: `docs/correcoes/inbox/2026-07-02-simulador-404-cru-em-prod.md`.
  (`src/components/admin/simulator/inbox.tsx:57-59`.)

## Decisão pendente (Kairo)

Como rodar o QA de imóvel no WhatsApp já que o simulador não roda em prod:
(a) fornecer credenciais do admin do DEV AWS → rodo lá (mesmo commit do prod);
(b) autorizar habilitar o simulador em prod temporariamente (blast radius);
(c) liberar rodar local via container do worktree.
Perguntei via AskUserQuestion; sem resposta em 60s (ausente). Não forcei nenhum
caminho que toque prod ou contrarie a proibição de local.
