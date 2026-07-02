# Roteiro QA — Aja Agora (jornada de negócio, dono de produto)

> Fonte de verdade do QA manual crítico. O **método** vem da skill global `qa-dono-produto`;
> o **fluxo de negócio** é este arquivo. Oráculo do comportamento esperado:
> [`../jornada/jornada-canonica.md`](../jornada/jornada-canonica.md) (REGRA, origem `jornada.docx`) +
> decisões em [`../jornada/CONTEXT.md`](../jornada/CONTEXT.md).
>
> Criado em 2026-07-02 na rodada **moto × WhatsApp** (primeira semeadura do roteiro).

## Escopo padrão desta rodada

- **Tipo de bem:** moto.
- **Canal:** WhatsApp (paridade com a web).
- **Objetivo:** jornada ponta-a-ponta do sonho à proposta (passos 1→5 do docx), validando os
  **artefatos WhatsApp** (bolhas, botões interativos, listas, fatiamento) e a paridade com a web.

## Ambientes e como exercitar o canal WhatsApp

| Ambiente | Simulador WhatsApp | Observação |
|---|---|---|
| local (`TB_ENV=local`) | ✅ habilitado | via container do workspace |
| DEV AWS (`TB_ENV=dev`) | ✅ habilitado | precisa URL pública do dev |
| **PRODUÇÃO (`TB_ENV=production`)** | ❌ **404 por design** | ver bloqueio abaixo |

### ⚠️ BLOQUEIO CONHECIDO — simulador não existe em prod (by design)

Todas as rotas `/api/admin/simulator/*` são gateadas por `isSimulatorEnabled()`
(`src/lib/utils/env.ts:12-16`), que **retorna `false` quando `TB_ENV=production`/`prod`**.
Em prod, `/admin/simulator/whatsapp` carrega a casca da UI mas o inbox mostra `HTTP 404` e
não cria/lista sessões (`GET`/`POST /api/admin/simulator/sessions` → 404 "Not Found").
**Não é bug do simulador — é o guard funcionando** (ferramenta de dev não vaza pro público).

Consequência pro QA: **não dá pra rodar a jornada WhatsApp via simulador em produção**. Para
exercitar o canal WhatsApp use DEV/local (simulador ligado) OU o canal real (Meta webhook,
depende de `WHATSAPP_WABA_ID` — PENDENTE-KAIRO). Registrado em
`docs/correcoes/inbox/2026-07-02-simulador-whatsapp-404-prod.md`.

### Como abrir o simulador WhatsApp (ambiente com simulador ligado)

1. `/admin/login` (credenciais de admin do ambiente).
2. `/admin/simulator/whatsapp` → botão **"Nova conversa"** → cria conversation `is_simulated`
   com `waId` sintético `SIM-<uuid>` (a chave que o `processTextMessage` real usa).
3. O `WhatsAppStage` conecta no SSE `/api/admin/simulator/whatsapp/<id>/stream` e envia texto /
   respostas de botão via `POST .../send`. A saída pra Meta API é interceptada e renderizada na UI
   (bolhas cinza = recebidas do agente; verde/direita = enviadas pelo cliente).

## Dados de teste (nunca inventar CPF)

- `secrets.sh decrypt contas-teste` → **CONTA1 (Kairo)**: nome, CPF, celular `5562992496793`,
  nascimento `1993-02-09`. Bevi/Conexia é **homologação** — simular/fechar é seguro; não travar
  por falta de sandbox. Apagar `contas-teste.env` ao fim.

## Jornada canônica — passos e critérios de aceite (moto × WhatsApp)

Cada passo referencia o docx. Critério = binário (passa/não passa). Artefato = o que a UI
WhatsApp deve emitir.

### Passo 1 — Entender a necessidade (docx §1)
- **AC1.1** Boas-vindas emite **3 botões** interativos: **Imóvel · Carro · Moto** (ids
  `category_imovel`/`category_auto`/`category_moto`). NÃO aparece "Serviços" (Bv2-01).
  Fonte: `welcomeButtonsToWhatsApp()`.
- **AC1.2** Selecionar **Moto** → agente pergunta o nome ("Como posso te chamar?").
- **AC1.3** Copy confirma o tipo escolhido como **"moto"** (não "bem" genérico, não "carro").

### Passo 2 — Entender o cliente (docx §2)
- **AC2.1** "Já participou de consórcio?" — se **não**, explicação curta (juntar sem juros,
  contemplação por sorteio/lance, paga só taxa de administração) + botão "Entendi, pode continuar".
- **AC2.2** Faixa de valor da **moto** vem como **lista interativa** com as faixas REAIS
  (`valuePickerToWhatsApp({category:'moto'})`): Até R$15 mil (~R$250) · R$15-25 mil (~R$400) ·
  R$25-40 mil (~R$650) · R$40-70 mil (~R$1.100) · Acima de R$70 mil (~R$1.800). Rótulo = "Moto",
  **não** as faixas de auto.
- **AC2.3** Prazo desejado (mais rápido possível / 6m / 1 ano / 2 anos+ / menor parcela).
- **AC2.4** Lance: Sim/Não/Talvez. Educação de **lance embutido** dispara pra **QUALQUER**
  resposta (FIX-4/D10). Se "Sim" → pergunta o **valor** do lance (fim da derivação silenciosa).
- **AC2.5** Coleta de **CPF + celular + aceite LGPD** ao fim do passo 2 (D1 — exigência técnica
  da Bevi pra simular; identidade cifrada AES-256-GCM). Não pedir identidade duas vezes (D12).

### Passo 3 — Buscar alternativas (docx §3)
- **AC3.1** Anúncio com o número **REAL** de opções (reveal honesto, D13). Não cravar "3" se não
  houver 3. Números vêm da Bevi (Trilho B self-contract), nunca de mock.

### Passo 4 — Avaliar/simular (docx §4)
- **AC4.1** Recomendado PRIMEIRO (destaque) + carrossel/lista das outras opções (D15).
- **AC4.2** Card NÃO exibe taxa adm / seguro / fundo de reserva / custo total / taxa efetiva
  (D14 — decisão Bernardo). Exibe: carta, parcela, prazo, tipo de grupo, lance/embutido.
- **AC4.3** Todo número vem da oferta real; sem fonte → linha OMITIDA (D11). Nada de "36/mês"
  fabricado.
- **AC4.4** Simulador (dial/agulha) calibrado na oferta real (dial == card, D18).
- **AC4.5** Card de decisão: "Sim, quero contratar" · "Ver outras opções" · "Falar com especialista".

### Passo 5 — Contratar (docx §5)
- **AC5.1** Fechamento entrega **PROPOSTA pronta** ("Sua proposta está pronta" / "Ver minha
  proposta"), **NÃO promete "assinatura"** (DES-1). `consortiumProposalLink` = PDF da proposta.
- **AC5.2** Upload de documentos (portal Conexia/AGX) é etapa separada, válida.
- **AC5.3** Resumo da contratação vai por **WhatsApp** (D5). Sem canal → `contractSummaryPending`
  (nunca envio fingido).
- **AC5.4** Reforço de continuidade: "consórcio da administradora X, escolhida pela Aja Agora" +
  "a gente segue com você até a contemplação".

### Artefatos WhatsApp — critérios transversais
- **AC-W1** Botões interativos: máx **3** por mensagem (limite Meta). Listas quando >3 opções.
- **AC-W2** Fatiamento de bolhas: mensagens longas quebradas em bolhas legíveis, sem estourar
  limite de caracteres da Meta, sem cortar palavra no meio.
- **AC-W3** Voz do agente: humano, sem narrar mecanismo ("vou buscar no sistema"), sem fórmulas
  de robô, PT-BR correto com acentuação. Erro com graça (nunca stack trace).
- **AC-W4** Paridade com a web: mesma jornada, mesmos números, mesma ordem de gates.

## Não-bugs conhecidos (não tratar como defeito)
- Simulador 404 em prod = **by design** (guard `isSimulatorEnabled`), não defeito do simulador.
- Card sem taxa adm / composição de custos = **D14** (decisão Bernardo), intencional.
- Fechamento não faz "assinatura digital self-service" = **DES-1** (mesa manual), intencional.
- Cards de histórico selados não são clicáveis por design.
- Camada 3 (eval LLM real) pula como INCONCLUSIVO se cota Anthropic esgotada (voltava 2026-07-01).

## Gate de merge do projeto (para ondas de correção)
- `pnpm test:unit` (NÃO typecheck whole-repo — dívida em test files já deixa `tsc` vermelho na
  develop). Ver memória "Gate de merge aja-agora".
- Bug de comportamento de agent/LLM exige regressão nas **3 camadas** (structural + cassette em
  `tests/regression/agent-trajectory.test.ts` + eval nightly) — ver CLAUDE.md do projeto.

## Histórico de rodadas
- **2026-07-02 — moto × WhatsApp (esta):** BLOQUEADA no ambiente — simulador 404 em prod.
  Jornada não exercitada. Roteiro semeado; bloqueio registrado no inbox. Aguarda decisão do Kairo
  sobre ambiente (DEV/local/habilitar em prod).
