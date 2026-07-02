---
projeto: aja-agora
dominio: TwoBrains
atualizado: 2026-07-02
oraculo: docs/jornada/jornada-canonica.md
escopo_padrao: "imóvel web ponta-a-ponta (do sonho à proposta)"
---

# Roteiro de QA do Dono — Aja Agora

> Fluxo de negócio + spec de teste do aja-agora para a skill `qa-dono-produto`. O oráculo é
> `docs/jornada/jornada-canonica.md` (fonte: `jornada.docx` do cliente); divergência
> código × oráculo é candidata a defeito, salvo os **não-bugs** do fim. Semeado na rodada
> 2026-07-02 (jornada imóvel, web, produção). Manter atualizado a cada rodada.

## 1. O que é o produto

Plataforma B2C de consórcio AI-first: o cliente **conversa** com um agente especialista
(Helena p/ imóvel) em vez de preencher formulário. Diz o que quer conquistar e recebe uma
recomendação personalizada com dados **reais** de administradoras (via Bevi) + botão pra
fechar proposta — sem corretor, sem redirect. Do sonho à proposta numa conversa.

## 2. Ambiente de teste

- **Produção:** `https://ajaagora.com.br` — dirigir o browser aqui. NÃO subir stack local, NÃO usar `.orb.local` (o pedido desta rodada foi PRODUÇÃO).
- **Local (quando aplicável):** skill `local-dev` (Postgres + app em container do workspace).
- **Contas de teste:** `~/.local/bin/secrets.sh decrypt contas-teste` → `CONTA2` (Mirella, CPF 037.802.511-24, celular 62994641111). **NUNCA inventar CPF.** Apagar `~/contas-teste.env` ao fim.
- **Bevi/Conexia = HOMOLOGAÇÃO:** fechar proposta é seguro/esperado; NÃO travar por "falta de sandbox".
- **Banco:** `postgres-homol`/`postgres-prod` via MCP — exigem VPN (não subir sem pedido). Nesta rodada o homolog deu ETIMEDOUT; evidência foi via UI/transcrito.
- **Gate de merge (todo-blocks):** `pnpm test:unit` (NÃO typecheck — tsc whole-repo já vermelho por dívida). Ver memória `project_aja_typecheck_debt_gate`.
- **Regressão de agent:** bug de comportamento do agente exige **3 camadas** (structural + cassette em `tests/regression/agent-trajectory.test.ts` + eval nightly) — ver CLAUDE.md do projeto.

## 3. Jornada canônica — passos, artefatos e critérios de aceite (imóvel/web)

### Passo 1 — Entender a necessidade
- **Usuário faz:** na landing, clica o chip **Imóvel** no chat hero (isso já abre o "chat theater" e envia "Quero comprar um imóvel"). Informa o nome no artefato inline "Como posso te chamar?".
- **Produto entrega:** Helena (Especialista em imóveis) entra; cumprimenta pelo nome.
- **Critério de aceite:** especialista correta pro tipo (Helena=imóvel); nome ecoado nas mensagens seguintes.
- **Seletores:** chip `Imóvel` (form do hero); input `name-input`; botão `name-submit`.

### Passo 2 — Entender o cliente
- **Usuário faz:** responde "Você já fez consórcio antes?" (É a primeira vez / Já conheço / Tenho dúvidas). Se primeira vez → lê educação de consórcio → "Entendi, pode continuar". Depois: gate de identidade (CPF+celular+LGPD) → valor do bem (slider/input) → lance (Sim/Talvez/Não) → se sim, valor do lance → educação de lance embutido → considerar? (Sim/Não).
- **Produto entrega:** artefatos inline por pergunta; educação de consórcio (grupo, contemplação sorteio/lance, sem juros, taxa adm) e de lance embutido.
- **Critério de aceite:** educação de consórcio presente e correta; **educação de lance embutido aparece pra QUALQUER resposta do lance** (FIX-4); coleta do **valor do lance** presente; gate de identidade com LGPD e CPF mascarado depois. **A canônica também pede o gate de PRAZO** ("em quanto tempo quer o bem?") entre valor e lance — ver defeito aberto `prazo-gate-ausente-imovel-prod`.
- **Seletores:** `identify-cpf`, `identify-phone`, checkbox LGPD, `identify-submit`; `value-input-credit`; botões de lance por texto.

### Passo 3 — Buscar alternativas
- **Usuário faz:** aguarda ("Comparando grupos").
- **Produto entrega:** recomendação com dados reais Bevi (parcela, valor do bem, prazo, contemplados/mês, tipo de grupo) + lista de administradoras alternativas (cotas clicáveis).
- **Critério de aceite:** dados REAIS (nunca mock); recomendada em destaque; alternativas comparáveis. **Canônica diz "3 boas opções"** — em prod vieram 5 (BB, Itaú, Canopus, Âncora, Rodobens); ver melhoria de copy.

### Passo 4 — Avaliar, simular e definir
- **Usuário faz:** "Por que esta recomendação?"; abre simulador ("Quero ver!"); ajusta prazo no slider; decide no card "Esse plano faz sentido?" (Sim, quero contratar agora / Ver outras opções / Falar com especialista).
- **Produto entrega:** detalhamento (cenário com lance, INCC, disclaimers "estimativa, não garantia"); simulador com "quando quer ser contemplado", chance, parcela até/após contemplação, lance pra contemplar, e reconhece o lance declarado; card de decisão canônico.
- **Critério de aceite:** estimativas sinalizadas (CDC); simulador usa o lance declarado; card de decisão com as 3 opções canônicas.

### Passo 5 — Contratar
- **Usuário faz:** "Sim, quero contratar agora" → funil de WhatsApp (Quero receber/Agora não) → gate de fechamento (dados reaproveitados + LGPD) "Continuar com segurança" → **carta real** confirmada → "Confirmar e contratar" → proposta gerada; upload opcional RG/CNH.
- **Produto entrega:** carta real da administradora; reforços canônicos ("você está contratando um consórcio da X, escolhida pela Aja Agora... seguimos com você até a contemplação e depois"); "Sua proposta está pronta" + "Ver minha proposta" (PDF real); "Parabéns!".
- **Critério de aceite:** proposta PDF real gerada; reforços presentes; **os números da carta real DEVEM bater com os da recomendação/decisão** — ver defeito crítico `numeros-recomendacao-vs-carta-real`.

## 4. Artefatos / telas
Chat theater (dialog fullscreen), artefatos inline: name-input, education, identify (CPF/celular/LGPD), credit-value (slider), lance/lance-embutido, recommendation-card + cotas, simulador, decisão, funil WhatsApp, fechamento (carta real), proposta pronta + upload doc.

## 5. Canais
Web (esta rodada) × WhatsApp. **QA de WhatsApp NÃO roda em prod** — usa DEV/local (memória `project_aja_simulador_404_prod`). O simulador admin `/admin/simulator/*` é 404 em prod por design.

## 6. Fluxos críticos (E2E de tela é TETO)
Descoberta → recomendação com dado real; simulador; **fechamento com números consistentes** (crítico — atualmente FALHANDO, ver defeito); geração da proposta PDF.

## 7. Não-bugs conhecidos
- **CPF antecipado** — coletar CPF/celular ANTES das perguntas de perfil é decisão de produto (Trilho B da Bevi exige identidade pra descoberta). Memória `project_jornada_canonica_bevi`.
- **Card selado** — CTAs de artefatos antigos (recomendação, "Seguir com...") ficam desabilitados quando um artefato mais novo os supera; prosseguir é via caixa de mensagem ou o artefato ativo. Não é bug.
- **`/admin/simulator/*` 404 em prod** — por design (`TB_ENV=production`).
- **5 administradoras em vez de "3 boas opções"** — dados reais Bevi; a canônica cita "3" como exemplo. Tratado como melhoria de copy, não defeito.

## 8. Armadilhas de teste (falso-bug)
- Clicar o chip Imóvel no hero JÁ dispara a conversa (não precisa digitar+enviar); o textbox do hero é ignorado nesse caminho.
- Botões de artefato superado dão timeout de clique (disabled) — não é trava, é card selado.
- Banco homolog exige VPN; ETIMEDOUT ≠ app quebrado.

## 9. Histórico de rodadas

### 2026-07-02 — imóvel / web / PRODUÇÃO (do sonho à proposta)
- **Resultado:** jornada completa ponta-a-ponta com proposta PDF real gerada (BANCO DO BRASIL). Dados reais Bevi (5 administradoras). Educação de consórcio e lance embutido (FIX-4) OK; coleta de valor de lance OK; simulador com disclaimers CDC OK; CPF mascarado no fechamento OK; transparência de "lance abaixo da média do grupo" OK.
- **Defeitos (inbox):**
  - `numeros-recomendacao-vs-carta-real` (ALTA) — recomendação R$ 1.863/mês → carta real/proposta R$ 2.745/mês (+47%), valor 283k→312k, prazo 200→210m, sem aviso.
  - `teto-declarado-fabricado` (ALTA) — agente afirma "93,17% do seu teto declarado" sem orçamento coletado.
  - `prazo-gate-ausente-imovel-prod` (MÉDIA) — gate de prazo da §2 não apareceu em prod (confirmar se intencional).
  - `valor-monetario-quebra-linha` (BAIXA) — "R$ 1.863,32" quebra em "R$ 1." / "863,32".
- **Melhorias propostas (report):** pré-preencher WhatsApp do funil com o celular já coletado; explicar por que a recomendada (283k) tem valor abaixo do pedido (300k) quando há opções que batem; copy "3 opções" × N reais; "3 perguntinhas de perfil" seguido de pedido de CPF/celular (identidade, não perfil).
