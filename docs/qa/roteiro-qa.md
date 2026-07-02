# Roteiro de QA — Aja Agora (fluxo de negócio + spec de teste)

> **Fonte da verdade do que testar.** Método = skill global `qa-dono-produto`.
> O **fluxo de negócio** é a [`jornada-canonica.md`](../jornada/jornada-canonica.md) (REGRA, origem `jornada.docx`).
> Divergência código × jornada = defeito do código. Contexto/decisões em [`docs/jornada/CONTEXT.md`](../jornada/CONTEXT.md).
> Criado na rodada **2026-07-02** (piloto QA-contra-prod, escopo AUTO web).

## Ambientes

| Ambiente | URL | Observações |
|---|---|---|
| **Produção** | https://ajaagora.com.br | Bevi/Conexia em **homologação** — fechar proposta com CPF de teste é seguro e esperado. |
| Local (dev) | `http://aja-<workspace>.orb.local` | Via skill `local-dev`; não usado no piloto contra-prod. |

- **Gate de merge do projeto:** `pnpm test:unit` (NÃO typecheck — `tsc` whole-repo já vermelho por dívida em test files).
- **Regressão de comportamento de agent:** 3 camadas obrigatórias (structural + cassette `tests/regression/agent-trajectory.test.ts` + eval nightly). Ver `CLAUDE.md`.

## Contas de teste (NUNCA inventar CPF)

`secrets.sh decrypt contas-teste` → usa **CONTA1** (Kairo) no gate de identidade. Apagar o `.env` decriptado ao fim.

## Escopo padrão

Jornada do tipo de bem **AUTO (carro)**, canal **WEB**, do sonho à proposta (passos 1→6). Viewport mobile-first.

---

## Passos e critérios de aceite (contra a jornada canônica)

### Passo 1 — Entender a necessidade
- **Landing:** textbox "Conte o que você quer conquistar" + chips **Imóvel / Carro / Moto** + **Enviar**.
- Ao enviar, abre o chat e roteia para o **especialista por categoria** (AUTO → **Rafael**).
- Pergunta o nome ("Como posso te chamar?") com gate dedicado (input + "Confirmar nome").
- **CA1.1:** o texto livre digitado (com valor/orçamento) chega íntegro ao agente.
  ⚠️ **DEFEITO conhecido (auto-web, 2026-07-02):** selecionar um **chip de categoria** após digitar **descarta** o texto e envia um canned ("Quero trocar de carro.") — perde o orçamento. Caminho de **texto puro** funciona. Ver `inbox/2026-07-02-chip-descarta-texto-digitado.md`.
- **CA1.2:** o valor do bem é extraído do texto livre (ex.: "R$ 70 mil" → Rafael responde "carro de R$ 70 mil…"). ✅

### Passo 2 — Entender o cliente
- "Você já fez consórcio antes?" → **É a primeira vez / Já conheço / Tenho dúvidas**.
  - **"É a primeira vez"** → educação (grupo, sem juros, taxa de administração, sorteio/lance) + "Entendi, pode continuar / Entender mais antes". ✅
  - **"Já conheço"** → pula educação ("Show, vamos direto ao ponto") + "Bora! / Entender mais antes". ✅
- **CA2.1 — prazo:** a jornada pede "Em quanto tempo você gostaria de estar com seu bem?" (opções: mais rápido · até 6 meses · 1 ano · 2 anos+ · sem pressa).
  ⚠️ **A CONFIRMAR (auto-web, 2026-07-02):** o gate de **prazo/timeframe NÃO disparou** no run em prod (texto só com valor + orçamento mensal, sem prazo). Possível regressão do fix `inbox/2026-06-21-analyzer-infere-prazo-de-orcamento.md`. Ver `inbox/2026-07-02-timeframe-gate-nao-dispara.md`.
- **CA2.2 — lance:** "Você teria uma reserva pra dar um lance…?" **Sim / Talvez / Não**. Se **Sim** → coleta do **valor do lance** (opções ~10–40% do bem). ✅
- **CA2.3 — lance embutido:** educação de lance embutido aparece (para qualquer resposta, FIX-4) + "considerar lance embutido? Sim/Não". ✅ (visto no path "Sim").

### Passo 3 — Buscar alternativas (Bevi real, descoberta)
- Gate de **identidade antecipado** (CPF + celular + consentimento LGPD "não é compromisso"). **Decisão vigente: CPF antecipado.** ✅
- Dispara busca real na Bevi → "Encontramos **3 boas opções** pro seu perfil". ✅
- **CA3.1:** dados **reais** da Bevi, nunca mock. ✅

### Passo 4 — Avaliar, simular e definir
- **Recomendação em destaque** + comparativo das outras 2 (cards selecionáveis) + "Ver outras opções" + "Ajustar valor" + "Por que esta recomendação?". ✅
- Resumo por opção: parcela, valor do bem, prazo, contemplados/mês, tipo de grupo. (Sem taxa adm no card real — retorno Bevi enxuto, decisão vigente.)
- **Simulador** (conceito do Bernardo — não finalizar sem aval): slider de prazo, chance de contemplação, lance necessário por mês, "seu lance declarado cobre a parte em dinheiro". ✅ live em prod.
- **CA4.1 — coerência de números (CRÍTICO):** os valores da **recomendação/simulador** (parcela, valor do bem) DEVEM ser os mesmos da **proposta real** do fechamento.
  🔴 **DEFEITO conhecido (auto-web, 2026-07-02):** recomendação = bem **R$ 70.000 / parcela R$ 892,48** ("99,2% do seu teto de R$ 900"); proposta real = crédito **R$ 100.000 / parcela R$ 1.438,28**. Bait-and-switch. Ver `inbox/2026-07-02-recomendacao-diverge-da-proposta-real.md`.

### Passo 5 — Contratar
- Card de decisão "Tenho interesse" → gate de fechamento ("Vamos fechar sua proposta", administradora, CPF mascarado, consentimento LGPD de contratação, "Continuar com segurança"). ✅
- "Confirmei com a ANCORA. Essa é a sua carta real" (crédito, parcela, prazo, grupo, lance médio) → "Confirmar e contratar". ✅
- Reforço: "Você está contratando um consórcio da ANCORA, escolhida pela Aja Agora… segue com você até a contemplação." ✅
- **Proposta pronta** + "Ver minha proposta" → gera/baixa **PDF real** (`..._consortium.pdf`). ✅
- Upload de documentos (RG/CNH frente/verso, opcional, "Pular por agora"). ✅ (bucket cliente destravado 2026-07-01)
- "Parabéns! Agora você está oficialmente mais perto da sua conquista!" ✅
- **CA5.1 — resumo WhatsApp/e-mail:** a jornada pede envio do resumo da contratação por WhatsApp/e-mail.
  ⚠️ **A CONFIRMAR:** não houve confirmação visível no chat de que o resumo foi enviado. Verificar no backend/DB. Ver dúvidas abertas.

### Passo 6 — Concluir / Passo 7 — Pós-venda
- Fora do escopo do piloto (comunicados automáticos, dash de acompanhamento).

---

## Não-bugs conhecidos (decisões vigentes — não tratar como defeito)

- **CPF antecipado** (identidade antes do perfil completo) — decisão vigente.
- **Retorno Bevi real enxuto** (sem taxa adm/INCC/assembleia no card) — decisão vigente.
- **Simulador live** — conceito do Bernardo, em prod; não finalizar versão sem aval dele.
- **`/admin/simulator/*` = 404 em prod** por design (`TB_ENV=production`); QA WhatsApp não roda em prod.
- **Cards de histórico selados não são clicáveis** por design.

## Seletores úteis (data-testid observados em prod)

- `name-input`, `name-submit`; `identify-cpf`, `identify-phone`, `identify-lgpd`, `identify-submit`.
- Botões de artifact via texto (ex.: "Buscar minhas ofertas", "Tenho interesse", "Confirmar e contratar", "Ver minha proposta").

## Histórico de rodadas

| Data | Escopo | Resultado | Ledger |
|---|---|---|---|
| 2026-07-02 | AUTO web ponta-a-ponta (piloto contra-prod) | Jornada completa até PDF; **1 defeito alto** (recomendação × proposta real), **1 médio** (chip descarta texto), **1 a-confirmar** (timeframe gate) | `.processo/qa/2026-07-02-auto-web-ledger.md` |
