# Bloqueio de QA — simulador WhatsApp indisponível em PRODUÇÃO (404)

- **Data:** 2026-07-02 · **Achado em:** QA dono-de-produto (rodada moto × WhatsApp, contra prod) · **Superfície:** `/admin/simulator/whatsapp` (prod)
- **Severidade:** a-confirmar — **provável NÃO-BUG (by design)**, mas **bloqueia** o QA da jornada WhatsApp em prod. Decisão de produto/ambiente pendente do Kairo.

## Cenário (reproduzível)
1. Login admin em `https://ajaagora.com.br/admin/login` (OK).
2. Navegar `https://ajaagora.com.br/admin/simulator/whatsapp`.
3. A casca da UI carrega, mas o inbox mostra **`HTTP 404`** e "Nenhuma simulação ainda".
4. Clicar **"Nova conversa"** não cria sessão.

## Esperado × Atual
- **Esperado (premissa da tarefa de QA):** conseguir criar uma conversa `SIM-<uuid>` e dirigir a
  jornada de moto pelo WhatsApp via o simulador interno **de prod**.
- **Atual:** todas as chamadas ao simulador retornam **404 "Not Found"**.

## Evidência
- Console (prod): `GET /api/admin/simulator/sessions?channel=whatsapp` → **404**.
- Clicar "Nova conversa": `POST /api/admin/simulator/sessions` → **404**.
- `fetch` autenticado como admin no console do browser → `{ status: 404, body: "Not Found" }`.
- Screenshot: `_evidencia/2026-07-02-simulador-whatsapp-404-prod.png`.

## Causa raiz (verificada no código — determinística, não-LLM)
Todas as rotas do simulador começam com:
```ts
if (!isSimulatorEnabled()) return new NextResponse("Not Found", { status: 404 });
```
`src/app/api/admin/simulator/sessions/route.ts:26,99` (e demais rotas do simulador).
`isSimulatorEnabled()` (`src/lib/utils/env.ts:12-16`):
```ts
const tbEnv = (process.env.TB_ENV ?? "").toLowerCase().trim();
if (tbEnv === "production" || tbEnv === "prod") return false;
return true;
```
Produção roda com `TB_ENV=production` → simulador **desabilitado por design** (comentário do
arquivo é explícito: *"TB_ENV=production → BLOQUEADO"*). É um guard de segurança: a ferramenta
interna de dev não deve ser exposta ao público.

## Conclusão / natureza do achado
Isto é o **guard funcionando**, não uma falha do simulador. Logo:
- Como **defeito do simulador**: NÃO. O 404 é intencional.
- Como **gap de QA/produto**: SIM — não há caminho para exercitar a jornada WhatsApp em prod
  (nem simulador, nem canal real: `WHATSAPP_WABA_ID` é PENDENTE-KAIRO).

## Decisão pendente do Kairo (não executar sem aval — blast radius)
Opções para destravar o QA de moto/WhatsApp:
1. **Testar em DEV AWS** (`TB_ENV=dev`, simulador ligado) — precisa da URL pública do dev.
2. **Testar em container local** (simulador ligado) — contradiz o "PROD" da tarefa.
3. **Expor o simulador em prod** atrás de uma flag dedicada (ex.: `SIMULATOR_FORCE_ENABLE`)
   que NÃO seja `TB_ENV`, para não afetar outros guards — mudança de produto, exige dev + decisão.
4. **Aceitar como não-bug** e manter o QA de canal WhatsApp fora de prod (só web em prod).

## Regressão (se virar mudança de produto — opção 3)
- Camada 1 (structural): teste de `isSimulatorEnabled()` cobrindo a nova flag (habilita mesmo com
  `TB_ENV=production` quando `SIMULATOR_FORCE_ENABLE=true`; segue bloqueado por default em prod).
- Sem cassette (código não-agêntico puro).
