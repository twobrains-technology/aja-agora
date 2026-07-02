# Roteiro de QA — Aja Agora (dono de produto)

> Fonte de verdade do **fluxo de negócio** pro QA manual crítico (skill `qa-dono-produto`).
> O método (persona, rubrica, loop de correção) é global; o que muda por projeto é o fluxo,
> que mora aqui. A **jornada canônica** (`docs/jornada/jornada-canonica.md`) é o oráculo do
> comportamento esperado; este roteiro operacionaliza o teste dela.
>
> Semeado em 2026-07-02 na rodada "serviços × WhatsApp". Amplie a cada rodada.

## Ambientes

| Ambiente | URL | Simulador | Observação |
|---|---|---|---|
| Produção | `https://ajaagora.com.br` | **DESABILITADO** | `TB_ENV=prod` → `isSimulatorEnabled()=false`; todas as rotas `/api/admin/simulator/*` retornam 404. |
| DEV AWS | (preencher) | habilitado | `TB_ENV=dev`. Caminho natural pro QA do simulador. |
| Local | `http://aja-agora-<workspace>.orb.local` | habilitado | via skill `local-dev`; migrations `docker exec <app> pnpm db:migrate`. |

- **Gate de merge do projeto:** `pnpm test:unit` (NÃO typecheck — dívida de tsc na develop).
- **Regressão de agent (obrigatória, 3 camadas):** structural (`src/**/*.test.ts`) +
  cassette determinístico (`tests/regression/agent-trajectory.test.ts`) + eval nightly.
  Ver `CLAUDE.md` → "Regressão de agent".

## Admin / login

- Prod: `/admin/login` com credenciais de QA (arquivo temporário, nunca commitado).
- Local/dev: admin via sign-up API + `role=admin` (ver `CLAUDE.md`).

## Contas de teste (NUNCA inventar CPF)

- `secrets.sh decrypt contas-teste` → `contas-teste.env`. Apagar ao fim.
- **CONTA2 (Mirella):** `CONTA2_NOME="Mirella Mendanha Paulino"`, `CONTA2_CPF=03780251124`,
  `CONTA2_CELULAR=5562994641111`.
- Bevi/Conexia é **homologação** — fechar/simular é seguro e esperado; não travar por falta
  de sandbox.

## Tipos de bem suportados

União canônica: `imovel | auto | moto | servicos` (`src/lib/agent/categories.ts:8-13`).
- Meta: 🏠 Imóvel · 🚗 Automóvel · 🏍 Moto · 🛠 **Serviços**.
- Botão de entrada no **web** rotula `servicos` como **"Outros"** (`src/lib/web/adapter.ts:181`),
  subtítulo "Reforma ou viagem" (`welcome-categories.tsx:44-49`) — **divergência de rótulo a
  confirmar por canal** (metadado canônico diz "Serviços").

### Especificidades de "serviços" (checar contra imóvel/carro/moto)

- **Faixa de valor** (`src/lib/agent/qualify-config.ts:46`): min 10k, max 500k, step 10k,
  default 60k. Opções clicáveis: "Até R$ 30 mil (reformas simples, viagens)", "R$ 30 a 100 mil
  (reformas médias, formaturas)", "Acima de R$ 100 mil (grandes projetos)".
- ⚠️ **Inconsistência a validar:** o system-prompt (`system-prompt.ts:17`) declara step 5.000
  pro slider de serviço, mas `qualify-config.ts` usa step 10.000. Confirmar qual vale na UI.
- **Prazo típico de grupo** (`plan-estimate.ts:24-34`): serviços = 40 meses (o mais curto;
  imóvel 200, auto 80, moto 72). Taxa adm típica ~17,5%; range recomendação 15–20%
  (`recommendation.ts:53`). Isso muda parcela/estimativa exibidas.
- Bevi mapeia `SERVICOS → servicos` **e** `OUTROS BENS → servicos` (`offer-mapper.ts:52-55`).

## Simulador WhatsApp (como dirigir)

- Rota: `/admin/simulator/whatsapp`. Cria sessão via inbox lateral → `POST
  /api/admin/simulator/sessions {channel:"whatsapp"}` gera `waId = SIM-<uuid>`
  (`sessions/route.ts:44`), `isSimulated:true`.
- Mensagens do "lead" → `POST /api/admin/simulator/whatsapp/[conversationId]/send` chamam o
  **mesmo** `processTextMessage`/`processInteractiveReply` do webhook real
  (`src/lib/whatsapp/processor.ts`) — paridade de caminho de código garantida.
- Respostas voltam por SSE (`stream/route.ts`); `api.ts` intercepta `to` que começa com
  `SIM-` e publica no `simulator-bus` (in-memory) em vez de bater na Meta API.
- `isSimulatedWaId(waId) = waId.startsWith("SIM-")` (`src/lib/whatsapp/simulator-bus.ts`).

### Checkpoints de paridade web × WhatsApp (seção crítica desta rodada)

1. **Bolhas** (`whatsapp-bubble.tsx`): user = verde/direita ("sent"); assistant = cinza/
   esquerda ("received").
2. **Botões nativos** (`whatsapp-interactive.tsx`): `type:"button"` → até 3 reply buttons;
   `type:"list"` → Sheet inferior com seções/rows. Clique dispara `sendInteractive`.
3. **Fatiamento** (`whatsapp/adapter.ts:95-130` + `formatter.ts:34`): (a) split por
   fronteira de artifact/turn com pausas de typing simuladas; (b) split por 4096 chars
   (parágrafo → frase → corte duro). Validar que não gera bolhas quebradas no meio da frase.
4. **Typing** (`whatsapp-typing.tsx`) aparece antes de cada bolha do agente.
5. **Relógio simulado** (`processor.ts` `withSimulatorClockIfNeeded`) p/ assembleias/datas.

## Jornada canônica — passos a validar (resumo; oráculo = `jornada-canonica.md`)

1. Entender a necessidade (botões tipo de bem + nome).
2. Entender o cliente (já fez consórcio? → educação; valor via range; prazo; lance Sim/Não/
   Talvez → **valor do lance** + educação de **lance embutido universal**, FIX-4).
3. Buscar alternativas ("3 boas opções").
4. Avaliar/simular (recomendado primeiro + "outras opções"; simulador 3/6/12 meses; fluxo
   de caixa; card de decisão).
5. Contratar (dados + docs + proposta PDF `consortiumProposalLink`; resumo por WhatsApp/
   e-mail). ⚠️ DES-1: assinatura digital self-service NÃO é entregue aqui — a mesa efetiva.
6. Concluir. 7. Pós-venda (comunicados, assembleias, contemplação).

## Não-bugs conhecidos (decisões vigentes — não gritar como defeito)

- **Simulador é dev-only** (`isSimulatorEnabled()`, `env.ts`, Bug B-01): 404 em prod é
  intencional. Override pontual: flag `SIMULATOR_FORCE_ENABLE=true|1` (adicionada 2026-07-02,
  ainda não deployada). Ver ledger.
- **Cards de histórico selados** não são clicáveis por design.
- **DES-1** (contratação): proposta PDF, não assinatura self-service.
- **Bus in-memory single-process**: em prod multi-instância, painel pode não receber eventos
  SSE (`listeners=0`) — risco a considerar caso o simulador seja habilitado em prod.

## Dúvidas abertas / a confirmar em rodada com simulador de pé

- Rótulo do tipo "serviços" no WhatsApp (é "Serviços" ou "Outros"?).
- Step do valor de serviço na UI (5k do prompt × 10k do qualify-config).
- Fatiamento não quebra frase no limite de 4096.
- Educação de lance embutido dispara pra Sim/Não/Talvez (FIX-4) também no WhatsApp.
