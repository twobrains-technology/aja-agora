# Plano de Teste — Jornada & Simulador Aja Agora (qa-noturno 2026-06-26)

> Fonte: Bernardo (docx) + relatório de contexto. Validar contra o sistema RODANDO,
> não contra teste unitário verde ou todo marcado done. Para cada caso: PASS/FAIL/BLOCKED
> + evidência observada no app + (em FAIL) esperado vs observado.
> **Regra de ouro:** "corrigido" só com evidência de comportamento observado no app.

## 0. Filosofia
1. Relatório ≠ realidade. Todo claim "corrigido (FIX-XX)" é hipótese a provar pelo app.
2. Teste unitário verde não basta — vale o E2E contra a Bevi real.
3. Caminho do dinheiro primeiro (Bloco 5 = P0). Se o fechamento não fecha, o resto é decoração.
4. Validar consistência, não só presença de card (números fecham entre si; nada arredondado na fala).
5. Uma conversa nova por caso (estado idempotente por conversa).

## 1. Pré-requisitos de ambiente (reportar valores, omitir segredos)
- App no ar no canal de conversa. Rodar em staging/tb-dev OU CPF sandbox homologado — NÃO produção (fechamento cria proposta REAL na Bevi + move lead no kanban).
- BEVI_SELFCONTRACT_HASH presente (sem ele descoberta falha alto — ver T-0.2).
- BEVI_API_TOKEN presente.
- **BEVI_PRODUCT_ID — anotar valor atual** (peça-chave da regressão do fechamento, Bloco 5).
- PROPOSAL_GATEWAY = bevi (nunca mock).
- CPF de teste com DV válido + celular DDD válido.
- Acesso ao kanban/raias do funil.
- (Se possível) captura de rede pros payloads HTTP à Bevi.

## 2. Blocos (P0 bloqueia receita · P1 quebra experiência · P2 polimento)

### Bloco 0 — Smoke & guardrails
- **T-0.1** (P1) App sobe, recepcionista responde. Conversa nova "oi". PASS: Sofia responde enxuto, PT-BR com acentos, 3 botões de categoria depois, sem chamar tool. FAIL: erro/sem acento/tenta buscar.
- **T-0.2** (P1) Mock proibido. Se der pra setar env: subir com PROPOSAL_GATEWAY="mock". PASS: app falha alto (mock removido). FAIL: sobe com mock.

### Bloco 1 — Coleta e ordem dos dados
- **T-1.1** (P1) CPF/telefone ANTES do valor (FIX-53). Conversa nova → "quero um carro" → nome → experiência/consentimento. PASS: card identidade (CPF+celular+LGPD) antes de qualquer seletor de valor. Ordem: nome→experiência→consentimento→identidade→valor. FAIL: valor antes do CPF.
- **T-1.2** (P1) Valor não é re-perguntado (FIX-53). Informe valor ("uns 90 mil"), depois "ok"/"beleza"/"e aí". PASS: confirma valor 1x, nunca re-mostra value_picker nem re-pergunta por texto. FAIL: picker reaparece OU pergunta de novo. Testar clique E texto.
- **T-1.3** (P1) CPF+telefone colados na mesma linha NÃO travam (FIX-52, era inbox — PROVAR). No texto livre, quando pedir CPF, mande `12345678901 11999999999`. PASS: isola CPF certo, card aparece, segue. FAIL: não isola/card não aparece/fallback proibido ("atualiza a página"). Variação: um de cada vez deve funcionar liso.

### Bloco 2 — Simulador
- **T-2.1** (P1) Teto carro 300k→500k (FIX-54). Auto, valor R$450.000. PASS: aceito, busca/simula em 450k. FAIL: corta pra 300k. Borda: R$600.000 → clampado pra 500k COM o agente confrontando ("máximo é R$500 mil"), não silencioso.
- **T-2.2** (P1) Número quebrado: valor exato vai à Bevi, cartas reais voltam. Peça R$137.450. PASS: (a) 137450 literal na chamada (`simulationValue: 137450`); (b) cartas são valores reais da admin (redondos); (c) agente comunica divergência ("carta real mais próxima é R$X"). FAIL: arredonda ANTES da Bevi, OU cartas inexistentes.
- **T-2.3** (P1) Prazo e lance são eixos INDEPENDENTES e rotulados separados. Até o dial de contemplação. PASS: prazo (meses) e lance distintos; lance embutido (≤30%) e lance total (bidPercentage ~74%) nunca fundidos. FAIL: mudar prazo mexe no lance como se fossem o mesmo, OU os 2 % de lance somados/trocados. Consistência: mais meses→parcela menor; lance→velocidade de contemplação, não parcela.
- **T-2.4** (P1) Sanidade aritmética. PASS: `parcela×prazo ≈ valor×(1+taxa_adm+fundo_reserva)` (+seguro), crédito líquido c/ lance embutido = carta − lance embutido, contemplados/mês inteiro ≥0. FAIL: números não fecham (campo trocado no mapper).

### Bloco 3 — Recomendação & decisão
- **T-3.1** (P1) Não 2 grupos da mesma admin (FIX-56 dedup). Vários reveals. PASS: ≤1 grupo por admin quando há admins distintas. FAIL: 2 da mesma admin com alternativas disponíveis. Atenção fallback: dedup repete admin só se < topN=3 admins distintas (ver T-7.1).
- **T-3.2** (P1) comparison_table com 2+ grupos (FIX-78 — PROVAR). Force reveal com exatamente 2 grupos. PASS: recommendation_card (1º destaque) + comparison_table com os 2+. FAIL: só 1 proposta, dropa tabela.
- **T-3.3** (P1) Card decisão "Esse plano faz sentido?". Após recomendação+simulação, "tenho interesse". PASS: present_decision_prompt com 3 botões fixos (contratar agora / ver outras opções / falar com especialista), no máx 1x. FAIL: inventa opções/pula/dispara >1. Sub: "ver outras opções" → comparativo de outro grupo sem recomeçar coleta.
- **T-3.4** (P1) Confronto honesto de orçamento (FIX-18). Bem R$250.000 c/ orçamento R$1.000/mês. PASS: agente transparente ("parcela R$X, bem acima dos R$1.000"), não celebra. FAIL: "achei opção próxima do objetivo!" pra parcela múltipla do orçamento.

### Bloco 4 — Anti-loop e re-busca
- **T-4.1** (P1) Anti-loop pós-reveal. Após reveal, só "bora"/"tá ótimo"/"show". PASS: não re-dispara search/recommend/simulate/cards; reage curto + card de decisão. FAIL: re-apresenta cards a cada afirmação.
- **T-4.2** (P1) Trocar faixa RE-BUSCA, nunca fabrica id (FIX-68/71/72). Após 256k, "e se fosse 130k?". PASS: re-busca (creditMax=130000), cards novos, simula com id literal. FAIL: trava em "instabilidade" OU simula id fabricado (`auto-130k-60m`/`auto-256k-kairo`). Distinção: mexer só na parcela do mesmo grupo → simulate_quota direto, sem re-buscar.

### Bloco 5 — FECHAMENTO (caminho do dinheiro) ⚠️ P0
- **T-5.1** (P0) Proposta REAL fecha na Bevi (regressão FIX-79). CPF/celular teste, jornada até "contratar agora" + confirmar oferta real. PASS na ordem: present_contract_form (CPF+celular+LGPD) → createProposal()+simulate()+pickClosestOffer() (status simulacao) → oferta real exibida → confirmOffer() gera link assinatura PDF + docs (status documentos) → lead move na raia. FAIL (regressão atual): Bevi rejeita "Proposta não pertence ao Bevi Consórcio" e trava. **Sem este verde, nada importa.**
- **T-5.2** (P0) Causa-raiz: paridade productId entre createProposal e simulate (FIX-79). Captura de rede no fechamento. PASS: createProposal() e simulate() enviam o MESMO productId (BEVI_PRODUCT_ID). FAIL: createProposal manda productId e simulate NÃO (ou outro). Pista: git log/bisect no adapter Bevi e no .env (BEVI_PRODUCT_ID trocado no EasyPanel sem o simulate acompanhar).
- **T-5.3** (P1) Identidade NÃO confundida com fechamento (FIX-12). Coleta CPF inicial. PASS: gate do servidor (card sozinho, agente narra curto e para); present_contract_form NÃO chamado pra "liberar simulações". FAIL: contract_form na coleta inicial.
- **T-5.4** (P1) Status sempre via tool real (FIX-14). Proposta criada, "qual o status?". PASS: chama check_proposal_status (Bevi ao vivo). FAIL: status de memória / inventa / re-busca grupos.

### Bloco 6 — CDC & anti-alucinação
- **T-6.1** (P1) Valores nunca arredondados na fala (CDC 30/37). PASS: R$X.XXX,XX exatos. FAIL: "uns R$800"/"cerca de R$1 mil".
- **T-6.2** (P1) Taxa adm nunca qualificada sem número (CDC 37). "a taxa é alta?". PASS: cita valor numérico exato. FAIL: "dentro da média"/"competitiva" sem número.
- **T-6.3** (P1) Coerção server-side dos números. PASS: card mostra valor real da simulação (coerceSimulationPayload sobrescreve). FAIL: número errado do LLM vaza.
- **T-6.4** (P1) Nome persiste no DB (save_contact_name). Informe nome por texto, inspecione lead. PASS: contact_name preenchido, form final com nome. FAIL: saudou mas contact_name=NULL.
- **T-6.5** (P2) Sem vazamento de mecânica. PASS: nenhum `[sistema:...]`, nome de tool, "botão"/"menu", raciocínio interno ("Motivo:"). FAIL: qualquer vazamento.

### Bloco 7 — Consistência estratégica (decisão de produto)
- **T-7.1** (P1 estratégico) Independência real? 8-10 reveals variando categoria/faixa. Some admins distintas. PASS: 3+ bancos distintos com regularidade. Alerta: 1-2 admins → independência retórica, dedup em fallback, "2 grupos mesma admin" por catálogo magro. Reportar contagem (decisão de produto).
- **T-7.2** (P1 estratégico) Taxa adm: card esconde vs site promete transparência. Confirmar contradição: site promete "sem letra miúda" + mockup mostra "Taxa adm 16%", mas card real não exibe taxa/fundo/seguro/custo total. Reportar como inconsistência (decisão Bernardo), não bug.

### Bloco 8 — Copy do site (visual em ajaagora.com.br)
- [ ] Não existe "sem cadastro" (usa "sem formulário").
- [ ] "as melhores administradoras" (não "o mercado inteiro").
- [ ] "melhor plano… não o que paga mais comissão ou taxa".
- [ ] "Preservamos sua privacidade… CPF só porque as administradoras exigem".
- [ ] Pilar "Alinhada" (não "Estratégica").
- [ ] "A gente viu… que nem todo mundo entende as regras de consórcio".
- [ ] "Viemos de grandes empresas… decidimos empreender". ⚠️ NOTA: esta copy foi ENCURTADA em 2026-06-26 a pedido do Kairo — hoje é "A gente viu que nem todo mundo entende as regras de consórcio direito. E resolvemos tomar uma atitude." (sem "empreender"/"grandes empresas"). Validar a copy ATUAL no ar, não a antiga.
- [ ] ⚠️ "Consórcio Bevi · Grupo 1042" NÃO aparece client-facing (exposição da marca-hub — crítico).
- [ ] (manual) Figura do hero + ícone WhatsApp mobile → conferência humana.

## 2.5 Protocolo de ambiente do Bloco 5 (fechamento real — resposta do agente do Kairo, 2026-06-26)
ANTES de rodar qualquer fechamento (T-5.1):
1. Inspecionar env (`.env.local`/`.env.test`): procurar `BEVI_API_URL` / `BEVI_ENV` / `BEVI_STORE_ID`.
2. Se apontar pra SANDBOX → usar o CPF de `BEVI_TEST_CPF` (ou equivalente).
3. Se não houver var de CPF de teste → `secrets.sh decrypt <projeto>` e procurar `BEVI_TEST_CPF` / `CPF_SANDBOX`.
4. Se NENHUMA evidência de sandbox nas envs → **PARAR antes do T-5.1 e escalar via AskUserQuestion** com as opções concretas (sandbox URL + CPF encontrado, se houver).
5. NUNCA inventar CPF. NUNCA assumir sandbox sem evidência nas envs. Risco real: proposta em loja de produção.

## 3. Relatório de saída
Por teste: `ID | PASS/FAIL/BLOCKED | evidência | (FAIL) esperado vs observado | arquivo/payload`.
Resumo executivo: (1) status do caminho do dinheiro T-5.1/5.2 em destaque (fecha? causa-raiz?); (2) FAILs por prioridade P0→P2; (3) claims do relatório que NÃO se sustentaram no app; (4) contagem de admins distintas (T-7.1) + veredito independência real vs retórica.

## Nota de contexto (rodada 2026-06-25/26 — o que já entrou na develop ANTES deste QA)
FIX-76 (alucinação busca + gate), FIX-77 (system-messages + memória em dobro), FIX-78 (comparison_table dropado — **deveria estar corrigido, PROVAR T-3.2**), FIX-79 (fechamento Bevi/propostaId — **deveria estar corrigido, PROVAR T-5.1/5.2; ação externa: confirmar BEVI_PRODUCT_ID com Bevi/AGX**), FIX-80 (estudo Letta), FIX-81 (remoção Letta → Postgres, em integração no momento deste QA). O qa-noturno deve tratar TODOS como hipótese.
