# Roteiro de QA — Aja Agora (jornada de negócio)

> Fonte da verdade do FLUXO: [`../jornada/jornada-canonica.md`](../jornada/jornada-canonica.md) (regra, origem `jornada.docx`).
> Contexto/decisões: [`../jornada/CONTEXT.md`](../jornada/CONTEXT.md). Este roteiro é o oráculo do QA
> manual crítico (skill `qa-dono-produto`): passos, critérios de aceite, dados de teste e não-bugs.
> Atualizado: 2026-07-02 (1ª rodada: jornada MOTO, canal WEB, em PRODUÇÃO).

## Ambiente e dados de teste

- **PRODUÇÃO:** `https://ajaagora.com.br` (dirigir o browser aqui; NÃO subir stack local pra QA de prod).
- **DEV/local (quando aplicável):** via skill `local-dev` (`http://aja-agora-<workspace>.orb.local`).
- **Contas de teste (NUNCA inventar CPF):** `secrets.sh decrypt contas-teste` → usar `CONTA1` (Kairo:
  CPF `02874137138`, celular `5562992496793` = DDD 62). **Apagar `~/contas-teste.env` ao fim.**
  - ⚠️ **Máscara de celular:** o campo espera formato BR SEM código de país. Digitar `62992496793`
    (não `5562...`, senão a máscara lê "55" como DDD e trunca).
- **Bevi/Conexia = HOMOLOGAÇÃO:** fechar proposta é seguro/esperado. NÃO travar por falta de sandbox.
- **DB homologação (`postgres-homol`):** exige VPN/port-forward (não conecta direto do host; não subir VPN
  "por precaução"). Verificação de persistência de lead/proposta fica como opcional quando houver acesso.
- **Gate de merge do projeto (correções):** `pnpm test:unit` (NÃO typecheck whole-repo — dívida na develop).
- **Regressão de bug de agent:** 3 camadas obrigatórias (structural + cassette `tests/regression/agent-trajectory.test.ts` + eval nightly). Não aceitar fix de comportamento sem cassette.

## Escopo padrão da rodada
Jornada ponta-a-ponta por tipo de bem × canal. Rodada 2026-07-02: **MOTO × WEB**. (Carro/imóvel e
WhatsApp são escopos irmãos com o mesmo método.)

## Passos da jornada e critérios de aceite (WEB)

### Passo 1 — Entender a necessidade
- Entrada: landing → botão **Imóvel/Carro/Moto** (hero) abre o chat e já envia o objetivo; especialista
  entra por tipo (**Bruno = motos**). ✅ moto abre "Bruno · Especialista em motos".
- Pergunta o **nome** ("como posso te chamar?"). ✅
- **AC:** persona correta por tipo de bem; nome coletado antes de qualificar.

### Passo 2 — Entender o cliente
- "Você já fez consórcio antes?" (É a primeira vez / Já conheço / Tenho dúvidas). ✅
- **Se primeira vez** → educação (sem juros, taxa de administração, contemplação por sorteio/lance,
  papel da Aja Agora) + botão "Entendi, pode continuar". ✅ fiel ao docx.
- **Gate de identidade (D1 — CPF antecipado):** CPF + celular + aceite LGPD, com selo de proteção e
  "não é compromisso". ✅
- **Qualify:** valor do bem (ValuePicker) → **PRAZO (timeframe)** → lance (Sim/Não/Talvez) → valor do
  lance → educação de **lance embutido (FIX-4, pra qualquer resposta)** → opt-in embutido.
  - ✅ valor, lance, valor-do-lance e lance-embutido presentes e fiéis.
  - ⚠️ **DEFEITO (2026-07-02):** o gate **PRAZO (timeframe) NÃO apareceu** — após o valor foi direto ao
    lance. Ver `inbox/2026-07-02-funil-moto-pula-timeframe-prazo.md`.
- **AC:** ordem canônica `valor → prazo → lance → lance-embutido`; nenhum número inventado; agente
  confirma como vendedor sem re-perguntar o já respondido.

### Passo 3 — Buscar alternativas
- Reveal honesto (D13/D15): anuncia com o número REAL de opções (não crava "3" se não forem 3) +
  recomendado em destaque + carrossel de TODAS as opções (`present_comparison_table`, highlight=0). ✅
  (rodada: 1 recomendado + 5 no carrossel, copy "boas opções").

### Passo 4 — Avaliar, simular e definir
- Recomendado PRIMEIRO (card enxuto D14: parcela, valor do bem, prazo, contemplados/mês, tipo de grupo;
  SEM taxa adm/seguro/fundo). ✅ (obs: card do hero da LANDING ainda mostra "Taxa adm. 16,0%" — é
  conteúdo estático de marketing da landing, não o card do chat; não confundir).
- **Simulador (dial, D18):** "quer ver em 3/6/12 meses?" → dial com chance de contemplação, lance
  necessário, validação do lance declarado, disclaimer "dados da oferta". ✅ dado correto.
  - ⚠️ **DEFEITO:** "APÓS RECEBER" mostra parcela idêntica à "ATÉ CONTEMPLAR" mas rotulada "menor".
    Ver `inbox/2026-07-02-dial-parcela-apos-lance-identica-rotulada-menor.md`.
- **Apresentação/copy do plano:**
  - ⚠️ **DEFEITO GRAVE:** usa o valor do LANCE (R$ 5.000) como "teto de orçamento mensal" ("42,8% do
    seu teto de R$ 5.000"). Ver `inbox/2026-07-02-recomendacao-usa-lance-como-teto-orcamento.md`.
  - ⚠️ **DEFEITO:** "R$ 2.140,65" quebra em dois parágrafos. Ver
    `inbox/2026-07-02-apresentacao-quebra-valor-em-dois-paragrafos.md`.
- Card de decisão: "Tenho interesse / Ajustar valor / Ver outras opções". ✅
- **AC:** simulador com números 100% da oferta ativa; recomendação ancorada no perfil declarado.

### Passo 5 — Contratar
- Confirmação de identidade (D12): CPF **mascarado** (`028.•••.•••-38`), celular preenchido, "Usar outros
  dados", LGPD, "Continuar com segurança". ✅ CPF completo nunca volta ao browser.
- Real offer (Bevi real): "Confirmei com a BANCO DO BRASIL… sua carta real"; aviso honesto de lance abaixo
  da média do grupo (R$ 5.000 < R$ 8.341,41). ✅
- Fechamento: reforço "consórcio da administradora X escolhida pela Aja Agora… segue com você até a
  contemplação" (docx §5) + **"Sua proposta está pronta"** (copy DES-1 — proposta, NÃO "assinatura") +
  "Ver minha proposta" (PDF) + **upload opcional** RG/CNH ("Pular por agora") + "Parabéns! Agora você está
  oficialmente mais perto da sua conquista!". ✅ tudo fiel.
- **AC:** proposta real criada em homologação; copy não promete assinatura self-service (DES-1);
  identidade não re-pedida.

### Passo 6/7 — Concluir / Pós-venda
- Passo 6 vazio no docx; passo 7 (pós-venda) fora do escopo desta fase (D8). Não testar como defeito.

## Não-bugs conhecidos (não gritar)
- **Landing** exibe card de exemplo com "Taxa adm. 16,0%" e valores fixos — é marketing estático, não o
  card real do chat (que segue D14, sem taxa).
- **"Assinatura digital" ausente no fechamento** — decisão DES-1: assinatura é da mesa (back office),
  não self-service. Copy entrega "proposta pronta", correto.
- **Cards de histórico selados** não são clicáveis (design).
- **Camada 3 (eval LLM real)** volta 2026-07-01 (cota) — evals nightly, não bloqueiam.

## Histórico de rodadas
- **2026-07-02 — MOTO × WEB × PROD:** jornada 1→6 percorrida com sucesso e ofertas REAIS da Bevi;
  fechamento de proposta concluído. 4 defeitos registrados (1 grave "teto=lance", 1 alto "prazo pulado",
  2 médios de UI/copy). Ledger: `.processo/qa/2026-07-02-ledger.md`.
