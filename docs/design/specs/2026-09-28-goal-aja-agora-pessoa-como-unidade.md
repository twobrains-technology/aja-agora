# Aja Agora · pessoa como unidade, régua que entrega e reconciliação de mídia

> 28/09/2026 · Kairo + Nebulosa · Status: draft

## Contexto e problema

O painel mede o mesmo funil em unidades diferentes — o funil conta **conversa** e a tela de destino conta **pessoa** — e por isso as três telas de medição se contradizem na frente do cliente, que está levantando o CAC. Em paralelo, a régua de remarketing está ligada e ciclando, mas **não entra ninguém** (0 elegíveis em 210 avaliadas) porque a cadência combinada na reunião não existe no código e a janela de 7 dias fecha a porta do bolo parado. E a cliente comparou o painel (0) com o relatório da administradora (5): os 5 são **testes do mesmo telefone em 16/09** — o painel está certo e o teste excluído não aparece em lugar nenhum, então a conclusão dela é que o painel mente.

O que sustenta o problema, medido nesta sessão:

- DB de produção: 5 propostas em 01–21/09, **todas** `is_simulated = true`, mesmo telefone `1196…`, todas em 16/09 (15:35–16:09); a única proposta real do período é de 26/08.
- Painel 01–21/09: funil `conversas 123 · se identificaram 10 · viram oferta 12 · proposta 0`; Percurso `10 pessoas · 12 · 0`; a Porta: `2.835 pessoas / 123 conversas / 102 pessoas que conversaram`.
- Log do worker: `[remarketing-cycle] avaliadas 210, elegíveis 0` — `sem_contato 180`, `teste 9`, `telefone_da_equipe 8`, `ja_na_regua 8`, `parada_mais_de_7_dias 4`.
- Régua 28/08–28/09: 8 pessoas, 4 esgotaram, 1 respondeu, 2 ativos, 1 segurado.

## Norte (objetivo + critérios de sucesso verificáveis)

Fechar a frente de medição, remarketing e base do Aja Agora em cinco ondas independentes, cada uma provada por comando. O sucesso é verificável por:

- [ ] As três telas (Performance, Campanhas, Percurso) mostram **o mesmo número** para o mesmo degrau e a mesma janela; nenhum rótulo diz "conversa" onde o número é gente.
- [ ] O caso da cliente é um teste que passa: **5 simulações do mesmo telefone em 16/09 ⇒ 1 pessoa**.
- [ ] O funil declara em texto quantas conversas de teste ficaram fora do recorte.
- [ ] A régua entra com **elegíveis > 0** numa janela real, e o toque 2 e o 3 saem (teste de integração no ciclo provando que o portão de retomadas não os mata em silêncio).
- [ ] A reentrada do bolo parado é idempotente, não reabre quem tem opt-out e registra quem autorizou.
- [ ] "Quem são os 9" existe como lista pessoa a pessoa, com nome, telefone, etapa, última interação com autor, se pediu simulação e o motivo nomeado de estar fora da régua.
- [ ] O investimento aparece com as duas leituras (Meta reportado × CRM atribuído), a diferença em reais e o motivo; ausência de preço significa "não calculável", nunca "R$ 0,00".

## Design

### Arquitetura

Cinco ondas independentes, cada uma provada por comando:

- **(A)** o funil, o `pararamAqui` e o clique-para-o-Percurso passam a contar **pessoa** pela chave única que a escada já usa;
- **(B)** o recorte declara quantas conversas de teste ficaram fora;
- **(C)** a régua ganha a cadência intra-janela, o portão de retomadas destravado, as três comunicações por macro-fase e a reentrada deliberada dos parados;
- **(D)** a reconciliação Meta × CRM com o rótulo honesto do investimento e o custo de IA e de mensagem;
- **(E)** a entrega para a cliente: "quem são os 9" pessoa a pessoa, com nome e telefone para ela ligar, etapa, última interação e o motivo nomeado quando a pessoa está fora da régua.

A ordem é A → B → C → D → E, porque B depende do recorte de A e E depende do motivo nomeado de C.

**Grandes ideias que governam o desenho:**

- **Uma chave de pessoa, uma verdade.** `chaveDaPessoa` (`src/lib/admin/sinais-do-funil.ts`) já é a definição usada pela escada do Percurso — o funil de mídia passa a usá-la em vez de contar `c.id` / `bp.id`. Nada de segunda definição de "pessoa".
- **O teste fica visível, não invisível.** O funil exclui `is_simulated = true` por desenho; isso precisa aparecer em texto na tela, senão a cliente compara com a administradora e conclui que o painel está errado.
- **A régua só existe quando entra gente.** Hoje ela roda 2.880×/dia para achar 0 elegíveis: o ganho não está em tocar mais, está em destravar o portão (`MAX_RETOMADAS`/backoff), abrir a janela do bolo parado e encurtar a cadência dentro das 24 h.
- **O texto da comunicação é conteúdo, não código.** As chaves por fase entram no dispatcher; o texto vem do cadastro na Meta e do prompt — nunca fixo no servidor.
- **Número que não fecha não é consultado, é discutido.** Toda onda fecha com um teste de integração que prova `lista == escada == funil` para a mesma janela.

### Componentes

- **Funil de mídia** — `computeFunilMidia` (`src/lib/admin/performance-queries.ts:86`), 7 etapas: visitas → conversas → engajadas → identificados → viram_oferta → propostas → fechados. Toda etapa após "visitas" exige `conversations.visit_id IS NOT NULL` (senão o funil crescia e mostrava 328%).
- **Escada do Percurso** — `src/lib/admin/percurso-queries.ts` e `src/lib/admin/percurso-types.ts`; o degrau "Abriu o chat" (`percurso-types.ts:53`) e "Escreveu" (`:59`) já existem desenhados.
- **Chave de pessoa** — `chaveDaPessoa()` em `src/lib/admin/sinais-do-funil.ts`: `COALESCE(contact_id resolvido na janela, visitor_id)`. As três telas contam pessoas pela mesma chave. Trabalho deliberado de 24/08.
- **Régua de remarketing** — `src/lib/remarketing/regua.ts` (elegibilidade), `src/lib/workers/remarketing-cycle.ts` (ciclo), `remarketing_config` (cadastro: `espera_silencio_minutos`, `dias_ate_segundo_toque`, `dias_ate_terceiro_toque`, `max_toques`, `teto_toques_30_dias`), `remarketing_touches` (`next_touch_at`, `ultimo_toque_em`, `step`, `status`).
- **Tela da régua** — `src/lib/admin/remarketing-tela.ts` (`SITUACOES`, `Contadores`, `RespostaDaRegua`, `proximoToqueDe`, `passoLegivel`, `cotaLegivel`) e `src/components/admin/remarketing/cartoes-da-regua.tsx`.
- **Reconciliação Meta × CRM** — `src/lib/meta-ads/resolver-do-banco.ts`, `src/lib/admin/agrupar-origens.ts` (leads da Meta) × `src/lib/admin/performance-queries.ts` (quantos viraram conversa).
- **Dossiê da pessoa** — `src/lib/bevi/pessoa.ts` (`dossieDaPessoa`, `dossieDaConversa`, `chaveDeTelefone`, `variantesDeTelefone`, `escolherContato`) e o bloco injetado no turno por `blocoDaPessoa` (`src/lib/agent/langgraph/nodes/contexto-da-tela.ts`).

### Fluxo de dados

**Planejar → Construir → Verificar, por onda, com um escritor por frente.**

- **Planejar** — cada onda vira tarefa por arquivo, com o gate declarado antes de escrever código.
- **Construir** — TDD onde houver comportamento. O teste que falha primeiro é o da cliente: 5 simulações do mesmo telefone em 16/09 ⇒ 1 pessoa. Cada onda tem um escritor por frente; nenhuma onda mexe em duas frentes ao mesmo tempo.
- **Verificar** — `pnpm vitest run <diretório da costura>` + `pnpm typecheck`; integração só quando a costura é exatamente a coberta. Nada de suíte inteira como hábito. Sem deploy sem o antes/depois medido em produção, porque os números vão cair.

**Variáveis que atravessam o fluxo:**

- **Período** — a janela é sempre a da tela (`from`/`to`, cookie `aja_periodo`); a prova da cliente é `2026-09-01 → 2026-09-21`.
- **Flags de produção** — `REMARKETING_ATIVO`, `REMARKETING_ENTRADA_WEB`, `TELEFONES_DA_EQUIPE`, `TRANSCRICAO_AUDIO_ATIVA`; toda mudança de cadência entra com `REMARKETING_ATIVO` desligado e é validada contra número da equipe.
- **`ALERTA_SLA_MESA_TO`** — esvaziado hoje (o alarme de lead parado está desligado); qualquer item novo não pode depender dele.

**Custo de IA (decisão fechada nesta sessão):** o valor é **capturado da fonte atual** — o custo de LLM que já existe no Langfuse, por canal/modelo/dia, cruzado com o Postgres pelo `sessionId` do Langfuse = `conversationId` do Postgres. Não se cria tabela de preço versionada em código nem gravação de tokens por turno no banco nesta rodada. Se houver divergência entre o que a fonte atual reporta e o que o painel exibe, **o Gustavo é o responsável por apontá-la** — a divergência vira item de operação, não correção silenciosa no código.

### Erros

- **Leitura que falha não vira fato vazio.** `dossieDaPessoa` lança se a leitura falhar — devolver um dossiê vazio num erro de banco faria o modelo receber "nada registrado" como fato, que é exatamente a mentira que o módulo existe para desfazer (`src/lib/bevi/pessoa.ts`).
- **Telefone compartilhado não vaza PII.** `avisarTelefoneCompartilhado` loga contagem + prefixo hasheado do telefone, nunca o número (`src/lib/bevi/pessoa.ts`).
- **Contato ambíguo tem desempate determinístico.** `contacts_phone_idx` não é único; `escolherContato` resolve pelo mais recente com o `id` como desempate estável, senão o dossiê agrega conversas e propostas de outra pessoa.
- **Ausência de preço é "não calculável", nunca "R$ 0,00".** O rótulo tem que dizer qual dos dois motivos: falta de dado (zero qualificado no período) ou falta de vínculo (campanha sem atribuição).
- **Rótulo que o cálculo não sustenta é falha imediata** — foi o defeito de hoje, corrigido em `d418085b`.

## Riscos e gaps honestos

**Decisões em aberto (o dono precisa responder; travam C4, C5, D1 e D3):**

1. Qual investimento é o **oficial** na tela: o reportado pela Meta ou o atribuído no CRM.
2. Limite de toques por pessoa: **2** (pedido da cliente) ou **3–4** (posição do dono).
3. Ao esgotar os toques: marcar **perdido automático** ou **sugerir revisão humana**.
4. Na reentrada dos parados, a cota de 30 dias **conta** o histórico ou **zera** junto com o passo.
5. Texto das três comunicações (inicio / viu_oferta / fechamento) — com a cliente e o Gustavo.

**Riscos:**

- **Divergência de custo de IA entre a fonte atual e o painel.** Mitigação: o Gustavo aponta a divergência; ela vira item de operação registrado, não ajuste silencioso.
- **Duas normalizações de telefone com semânticas opostas** — `src/lib/memory/identity.ts:43` devolve E.164 (`+55…`); `src/lib/leads/phone.ts:8` devolve só dígitos e é o que grava `contacts.phone`. A chave tolerante (`chaveDeTelefone`, `variantesDeTelefone`) reconcilia as duas; comparar direto diverge.
- **Duas verdades para "viu oferta"** — `sinais-do-funil.ts` define `['real_offer','simulation_result']`; `funil-scores.ts` define `['comparison_table','recommendation_card','real_offer']`. Painel e score contam coisas diferentes; a onda A precisa escolher uma e alinhar a outra.
- **O Pixel dispara dentro do `/admin`** — navegação da equipe contamina remarketing e denominador.
- **A fila do CAPI só é esvaziada quando um lead muda de raia** — dia sem transição = fila parada; 7 dias = `skipped`.
- **`ALERTA_SLA_MESA_TO` esvaziado** — qualquer item novo não pode depender dele.
- **Custo/latência/tokens do agente não estão no banco** — só no Langfuse; o cruzamento é por `sessionId` = `conversationId`, e é o que a decisão desta sessão usa.

## Fora de escopo (YAGNI)

- **Tabela de preço versionada em código e gravação de tokens por turno no banco** — descartado nesta rodada; o custo de IA vem da fonte atual.
- **Pipeline em R$ por raia, receita, comissão e margem** — `leads.credit_value` é NULL em 49/49 e não há fonte; não entra.
- **Integração com a Marketing API da Meta e Google Ads para investimento** — a reconciliação usa o que já existe (Meta reportado × CRM atribuído), não uma integração nova.
- **`lost_reason` estruturado** — não existe hoje; a perda por inatividade continua indistinguível de reprovação da Bevi nesta rodada.
- **Tabela de quota/meta** — "estamos X% da meta" não tem fonte; não entra.
- **Ranking de vendedor no funil inteiro** — depende de dono do lead no funil todo, que não é montável hoje.
- **`claimed_at` na mesa** — "tempo até alguém assumir" não é medível com precisão; não entra.
- **Categorização dos comentários** — segue despriorizada e condicionada a volumetria (Bruna, 12:18).
- **CAC / conversão mínima** — saiu da pauta desta semana (Bruna, 12:18).
- **Exportação CSV/XLSX** — não existe em nenhum lugar do repositório; não entra nesta frente.

## Como você será avaliado

**Nota contínua por item da Definição de pronto.** Cada item vale igual; item sem prova de comando não conta.

**FALHAS IMEDIATAS:**

- Mexer no número sem medir o antes/depois.
- Criar uma segunda definição de "pessoa" ou de "parado".
- Escrever texto de comunicação fixo no servidor.
- Deixar teste novo cobrindo só o caminho feliz.
- Entregar rótulo que o cálculo não sustenta (foi o defeito de hoje, corrigido em `d418085b`).

**Aprovação** exige: teste de integração que fecha as três telas para a mesma janela e o caso da cliente; número da régua saindo de 0 elegíveis para um valor medido; cada decisão em aberto resolvida por escrito no PR, não por omissão.

## Comandos de validação

```bash
pnpm vitest run src/lib/admin/            # funil, percurso, sinais
pnpm vitest run src/components/admin/performance/
pnpm vitest run src/lib/remarketing/      # régua, motor, ciclo
pnpm typecheck                            # prova mais que a suíte inteira
```

Produção (somente leitura): `GET /api/admin/performance`, `/api/admin/percurso`, `/api/admin/campanhas` e `/api/admin/remarketing?from&to` com o período `2026-09-01 → 2026-09-21`; log do ciclo em `/ecs/tb/prod` filtrando `remarketing-cycle`.