# Away — corrigir os defeitos da conversa de WhatsApp de 13/08 e fazer o incidente chegar ao Cortex sozinho

- **Início:** 2026-08-13 23:51 · **Sessão:** aja-agora / `develop`
- **Critério de pronto:** (1) teste de regressão falhando antes e verde depois para **cada**
  defeito confirmado pelo especialista; (2) `pnpm typecheck` + `pnpm test:unit` verdes;
  (3) sinal determinístico novo emitido e provado por teste, cobrindo a classe de defeito
  desta conversa; (4) caminho alerta → Cortex provado ponta a ponta **na stack local**;
  (5) a conversa refeita na stack local recebe **10/10 de um agente juiz**.
- **Status:** PARCIAL (defeitos de estado curados e provados; nota 10/10 do juiz não atingida)

## Contexto

Última conversa real de produção no WhatsApp (`fa0533a0-6179-46ec-8abe-fea74a559afc`,
13/08 23:28→23:35 BRT, 45 mensagens, o próprio Kairo do outro lado). O cliente pediu moto de
R$ 20 mil com parcela de R$ 200/mês; o agente devolveu grupos de R$ 201.393 com parcela de
R$ 6.270, pediu desculpa três vezes sem corrigir o estado do servidor, e a conversa morreu sem
card e sem proposta (`bevi_proposals` = 0 linhas).

Dossiê factual (transcript, payload dos cards, estado do servidor):
`/private/tmp/claude-501/-Users-kairo-code-aja-agora/7cce3e7c-d960-41ed-92b4-abeb2ea76a72/scratchpad/DOSSIE-conversa-whatsapp.md`

O `super-especialista-de-ia` está produzindo o diagnóstico com causa-raiz por ponto; a
implementação segue o que ele apontar.

## Decisões

### D1 · 23:40 — Diagnóstico pelo banco de produção, não por reprodução local
- **Contexto:** para avaliar a conversa era preciso saber o que o servidor realmente gravou,
  não o que a tela mostrou.
- **Decidi:** abrir túnel SSM para o RDS de produção (porta local 25432) e extrair transcript,
  `artifacts` e `conversations.metadata` em SELECT.
- **Alternativas:** reproduzir localmente (não reproduz o estado corrompido real); ler só o
  Langfuse (tem o trace, não tem o que foi persistido).
- **Reversibilidade:** fácil — leitura apenas, nada escrito em prod.
- **Evidência:** os quatro arquivos do scratchpad citados acima.

### D2 · 23:48 — O alerta automático que não disparou entra no escopo como defeito próprio
- **Contexto:** o Kairo perguntou por que o incidente não abriu sozinho no Cortex, já que a
  integração foi construída hoje (`b7e93031`).
- **Decidi:** tratar como ponto nono do diagnóstico e pedir ao especialista que desenhe o sinal
  determinístico que teria pego esta classe de defeito — não só configurar as envs.
- **Por quê:** provei que a rota responde 503 em produção (`LANGFUSE_WEBHOOK_SECRET` ausente) e
  que nenhuma das 5 envs existe no secret. Mas, mesmo tudo ligado, **nenhum dos 4 Monitors
  existentes pegaria esta conversa**: `tool_falhou`=0 (a busca rodou e devolveu resultado errado,
  não falho), `turno_mudo`=0, `card_sem_fala`=0 (o defeito foi o inverso), `gate_entregue`=1.
  Configurar as envs sem sinal novo deixaria o mesmo buraco.
- **Reversibilidade:** fácil.
- **Evidência:** `curl` → HTTP 503; secret `tb/prod/aja-agora/env` sem as 5 envs;
  `funil-scores.ts:110-249`.

### D3 · 23:55 — provar a ponte de alerta INTEIRA antes de mexer no sinal
- **Contexto:** a ponte alerta → e-mail → Cortex tinha teste unitário em cada peça
  (assinatura, corpo, leitura da resposta) e **nenhum teste da rota inteira**. Peça verde com
  ponte muda é o buraco que deixou o alerta passar.
- **Decidi:** escrever `route.ponte-cortex.integration.test.ts` — stub HTTP local fazendo de
  Langfuse e de Cortex, webhook assinado de verdade, 8 casos: caminho feliz (Cortex recebe
  `abrir_ocorrencia` com projeto/tipo/prioridade/título/descrição), prioridade por severidade,
  Cortex fora do ar não cala o e-mail, 200 com erro embutido não conta como aberta, sem
  `CORTEX_*` vira no-op, sem segredo dá 503 (o estado real de produção), assinatura inválida dá
  401, evento de outro tipo é ignorado.
- **Alternativas:** apontar o teste para o Cortex real — descartado, o próprio `cortex.ts`
  registra que não existe editar/excluir ocorrência lá: card de teste em projeto real fica para
  sempre.
- **Reversibilidade:** fácil.
- **Evidência:** `pnpm vitest run …route.ponte-cortex.integration.test.ts` → **8 passed**.
  Conclusão: o código da ponte está certo; o que faltava era configuração e sinal.

### D4 · 00:10 — o dev local estava apontando para o Langfuse e o gateway de PRODUÇÃO
- **Contexto:** antes de validar qualquer correção com conversa real eu conferi o ambiente. O
  container subia com `LANGFUSE_BASE_URL=https://langfuse.twobrainstechnology.com` (log:
  `[langfuse] tracing ativo → …twobrainstechnology.com`) e `LITELLM_BASE_URL=http://host.docker.
  internal:4100`, um túnel SSM que não estava de pé — por isso a sonda voltava `[sem texto]`,
  com `textChars: 0` e `durationMs: 22`.
- **Decidi:** apontar o dev local para os shared locais — `LANGFUSE_BASE_URL=http://tb-langfuse-web:3000`
  com as chaves do projeto `aja-agora-local`, `LITELLM_BASE_URL=http://tb-litellm-shared:4000`,
  `AI_MODEL=claude-haiku-4-5` (o mesmo modelo de produção).
- **Pegadinha que custou tempo e vale registrar:** editar só o `.env.local` **não adianta** — o
  `docker-compose.yml` interpola `${VAR}` e o docker compose lê o **`.env`** para isso. Quem
  manda no container é o `.env`. E `docker restart` não basta: mudança de `environment` exige
  `up -d --force-recreate`.
- **Alternativas:** subir o túnel SSM da porta 4100 — descartado, a skill `local-dev` §5.5 diz
  que dev fala com o gateway shared, e o túnel cai a cada 1-2 min de inatividade.
- **Reversibilidade:** fácil — backups em `.env.bak-antes-do-fix-observabilidade` e
  `.env.local.bak-antes-do-fix-observabilidade` (ambos fora do git).
- **Evidência:** `pnpm sonda:conversa fix-389` agora devolve fala real do agente; log do
  container mostra `[langfuse] tracing ativo → http://tb-langfuse-web:3000` e `[analyzer]`
  classificando os turnos.
- **⚠️ Para o Kairo:** enquanto estava assim, **toda conversa de dev nesta máquina ia para o
  Langfuse de produção** — misturada com o tráfego real que os alertas leem.

### D5 · 00:05 — o workspace apontava para o database de OUTRO worktree
- **Contexto:** `pnpm test:jornada` falhou em 109 de 116 com `column "media_key" does not exist`.
  O `.env` trazia `WORKSPACE_DB_NAME=aja_agora_ws_langgraph_runtime` (worktree antigo) enquanto
  o workspace `develop` tem `aja_agora_ws_develop` — o app rodava contra um banco e os cenários
  contra outro, e o do workspace estava sem as migrations de agosto.
- **Decidi:** alinhar o `.env` em `aja_agora_ws_develop` e rodar `pnpm db:migrate` **dentro do
  container** (regra da casa: migration nunca na mão contra o banco).
- **Reversibilidade:** fácil.
- **Evidência:** `pnpm test:jornada` → **116 passed (30 arquivos)**. Baseline verde antes de
  qualquer correção, que é o que dá sentido a "ficou verde depois".

### D6 · 00:20 — o defeito foi REPRODUZIDO na stack local, e o culpado é o analyzer
- **Contexto:** para corrigir com prova (e não por leitura de código), adicionei o roteiro
  `moto-parcela-200` à `scripts/sonda-conversa-real.ts` — a fala literal do Kairo nos 11 turnos
  de `fa0533a0-…`. Rodei contra o app local com o mesmo modelo de produção (`claude-haiku-4-5`).
- **Reproduziu, e o log determinístico mostra onde:**
  ```
  [analyzer] cat=moto … credit=null-20000  | "valor isolado (20k) … crédito desejado para moto"
  [analyzer] cat=moto … credit=null-null   | "pergunta sobre parcela reduzida…"
  [analyzer] cat=moto … credit=null-200000 | "número isolado em contexto de identificação…"
  ```
  O turno do "200" (parcela) virou `creditMax = 200.000`. **Quem erra é o analyzer**, não o
  `discovery` — este só copia (`discovery.ts:252`). `turn-analyzer.ts:188-201` ensina o modelo,
  por exemplo, que `"no mínimo 100" → creditMin: 100000`: número solto vira milhares. Faltou a
  âncora de que havia um gate de PARCELA aberto (o turno anterior emitiu `quick_reply` com
  R$ 300/350/400). O parâmetro para isso existe — `analyzeAndMerge(…, lastAssistantText)` — e é
  aí que o diagnóstico do especialista precisa fechar.
- **Estado gravado na conversa local `2b594c6d-…` (a prova do dano):**
  `creditMax: 20000` · `creditMin: 180000` · `desiredItem: "uma casa"` · `currentCategory: "moto"`
  — a **mesma faixa invertida** de produção (lá: 18000 > 6424) e o mesmo bem obsoleto.
- **Elo com a OC-35 (Bruna, "cotas indisponíveis"):** a análise daquela ocorrência diz que
  `searchGroups` exige `creditMax`/`creditMin` > 0 e que o `bevi-offer-guard` descartou 91
  ofertas em 3 dias. Faixa invertida chegando na busca é candidata forte a ser a origem do
  sintoma que ela reportou. **Ainda não provado** — não confirmei que aquelas 91 vieram daqui.
- **Reversibilidade:** fácil (o roteiro é aditivo).
- **Evidência:** `pnpm sonda:conversa moto-parcela-200` + `metadata` da conversa no DB local.

### D7 · 00:35 — implementados os quatro P0 do dossiê do especialista
- **Contexto:** o `super-especialista-de-ia` fechou o diagnóstico em
  `docs/design/specs/2026-08-14-dossie-conversa-parcela-200.md` (516 linhas) e corrigiu **duas
  hipóteses minhas**: (a) o CPF **foi** enviado — a captura não persiste a mensagem, então o
  transcript mente por omissão e a invariante não foi furada; (b) o "turno morto" das 23:33:40
  entregou uma pergunta enlatada que **nunca entrou no histórico do modelo** ("Uns R$ 1.500.000
  então, é isso?"), e o "ta maluco 1.5m numa moto?" responde a ela.
- **Implementei, cada um com regressão primeiro (TDD):**
  1. **Reducer de `qualifyAnswers`** (D6 acima) — faixa nunca invertida, troca de bem invalida
     o que é do bem. `10ec8289`.
  2. **Alvo de busca discriminado** (`alvoDeBusca: "valor" | "parcela"`) — quem fala em parcela
     é buscado por `INSTALLMENT_VALUE`; a derivação proporcional virou narração, não estado. E o
     analyzer ganhou o campo `parcelaMensal`, que **não existia**: o Haiku entendia certo e era
     obrigado pelo schema a gravar R$ 200/mês como bem de R$ 200 mil.
  3. **Busca vazia com consequências** — registra o alvo tentado (freio: 4 chamadas idênticas
     viraram no máximo 2), invalida `recommendedOffer` (a âncora podre que fazia o contexto
     afirmar "os cards estão na tela") e arma o bloco anti-promessa por fato do turno.
  4. **Cinco sinais determinísticos novos** — `busca_abaixo_do_piso`, `busca_vazia`,
     `busca_esgotada`, `estado_incoerente`, `oferta_contradiz_parcela`; mais o erro da Bevi no
     nó `discovery` passando a pontuar como `tool_falhou` (antes morria em log).
- **Decisão de conciliação que vale revisão:** o dossiê pedia "nunca 2+ buscas no mesmo alvo",
  mas o FIX-380 usa a **segunda** vazia como gatilho para o funil trocar de estratégia. Adotei
  **duas tentativas por alvo** — mata o loop de quatro e preserva o FIX-380 (que ficaria
  vermelho com uma só).
- **Um teste antigo mudou de contrato:** `cenario-faixa-so-reposiciona-com-oferta-vista`
  esperava o `creditMax` derivado (69.990). Atualizei para o novo contrato e deixei no arquivo
  o porquê — é a única asserção que inverti, e é intencional.
- **Evidência:** `pnpm test:jornada` **120/120**, `pnpm vitest run src/lib/agent/` **585**,
  `pnpm tsc --noEmit` limpo.

### D8 · 00:50 — a ponte alerta → Cortex provada AO VIVO na stack local
- **Contexto:** o teste de integração já provava a rota; faltava provar o wiring real (env
  chegando ao container, rota rodando no Next, HMAC de verdade).
- **Fiz:** subi um stub HTTP fazendo de Cortex MCP, configurei as 5 envs e disparei um webhook
  **assinado** contra `http://aja-develop.orb.local/api/observability/alerta-langfuse`.
- **Resultado:** `{"ok":true,"email":false,"cortex":true}` e o stub recebeu `abrir_ocorrencia`
  com `projeto: Ajaagora`, `tipo: incident`, `prioridade: urgent`, título
  `[Aja Agora · ALERT] busca_abaixo_do_piso disparou`. Log do app:
  `"ocorrencia_aberta":true`. (`email:false` é esperado localmente — sem `SENDGRID_API_KEY`.)
- **Achado no caminho:** o `docker-compose.yml` **não mapeava** nenhuma das 5 envs, então em
  dev a rota respondia 503 e ninguém conseguia exercitá-la — a mesma classe do que a manteve
  muda em produção (secret sem entrada na taskdef). Corrigido em `281105cd`.
- **Não usei o Cortex real:** `cortex.ts` registra que lá não existe editar/excluir ocorrência
  — card de teste em projeto real fica para sempre.

### D9 · 01:05 — dois defeitos NOVOS que a validação ao vivo revelou
- **`contact_name = "Uma"`:** o funil estava no gate `name`, o modelo perguntou qual bem o
  cliente queria, ele respondeu "uma casa" — **ao modelo** — e o servidor leu como resposta ao
  **funil**. É a mesma classe do "200": o cliente responde a uma pergunta e o servidor valida
  contra outra. Corrigi por classe gramatical fechada (artigos), não por lista de frases.
- **`contract_form` sem cota na mesa:** com a âncora podre invalidada (D7.3), apareceu o buraco
  que ela escondia — `revealCompleted` nunca volta atrás, então o formulário saía depois de uma
  busca em branco, com o agente afirmando que as opções estavam na tela. Submeter cria proposta
  REAL na Bevi (CPF + bureau). Guard estendido para exigir oferta, escolha ou cota de contrato.
- **Bônus:** o mesmo "200" também virava `prazoMeses: 200`. Quando o classificador devolve o
  número idêntico em parcela e prazo, o cliente falou uma coisa só.
- **Evidência da jornada ao vivo:** `[discovery-empty] busca sem resultado (streak=1,
  **alvo=parcela 200**)` — a busca saiu **por parcela**, como devia, e a Bevi respondeu que não
  há oferta de R$ 200/mês para moto. O agente explicou em vez de mostrar grupos de R$ 201 mil.

### D10 · 01:25 — o juiz deu 4/10 e acertou: o estado curou, a conduta não
- **Veredito dele (com evidência cruzada entre fala e turn-trace):** o R$ 1,5 milhão morreu, o
  "200" virou parcela, a faixa ficou coerente e o cliente nunca mais viu grupo de R$ 201 mil —
  mas o agente **continuou anunciando oferta que não existe**: "Pronto! Agora apareceram as
  opções com parcelas em torno de R$ 200" num turno cujo trace é `cards: []`, e "as parcelas
  variam entre R$ 250 e R$ 400" com o card na tela dizendo R$ 484,16.
- **A causa que ele apontou, e que eu tinha deixado passar:** o modelo **não sabia o que estava
  na tela**. A lista de ofertas exibidas vinha só do banco, e no turno em que os cards nascem
  eles ainda não foram gravados (`persist` roda depois do `converse`) — exatamente no turno da
  apresentação, o contexto ia vazio. E a busca vazia chegava ao modelo só como proibição
  ("é PROIBIDO dizer que encontrou opções"), nunca como fato.
- **Decidi:** dar o DADO em vez de reforçar a proibição — bloco com os números reais da tela
  (menor/maior parcela, quantas opções) e bloco de busca vazia declarando o que foi buscado,
  que não voltou nada, e qual a alternativa real mais próxima do catálogo.
- **Alternativas descartadas:** endurecer a proibição no prompt (é a mordaça que o CLAUDE.md
  proíbe, e ela já estava lá e não segurou); guard que dropa a frase (esconderia o sintoma e
  deixaria o cliente sem explicação).
- **Evidência do efeito, na rodada seguinte:** *"você pediu R$ 200 e não tem oferta nessa faixa.
  A mais baixa que existe é R$ 484"* e *"a busca que fiz não trouxe nenhum grupo com parcela tão
  baixa"* — exatamente a honestidade que faltava, com número de catálogo.

### D11 · 02:30 — o juiz achou um defeito que EU tinha classificado errado
- **Contexto:** na primeira validação ao vivo eu vi o pedido de CPF aparecendo duas vezes,
  colado sem espaço, e classifiquei como **artefato da sonda** (que concatena os balões). Estava
  errado. O juiz mostrou que a frase é **literalmente idêntica em 4 de 4 ocorrências, em duas
  conversas diferentes** — isso é template, não modelo.
- **Causa real:** o canal só suprime a pergunta canônica quando `modelAsked` é verdadeiro, e
  esse sinal responde "o modelo fez ALGUMA pergunta". "Preciso do seu CPF" é **afirmação**,
  então nunca contava — e o cliente lia o pedido duas vezes no turno de maior atrito da jornada.
- **Corrigido** pelo mesmo padrão que a casa já usa para o nome (`perguntouONome` → agora também
  `pediuIdentidade`). **Medição: 0 ocorrências em 2 rodadas novas**, contra 4 de 4 antes.
- **Lição para mim:** "parece artefato da ferramenta" foi um palpite meu que passou por
  verificação nenhuma. O juiz cruzou 4 ocorrências e cravou. Regra da casa: não classificar sem
  contar.

### D12 · 02:50 — um conserto que eu NÃO fiz, e por quê
- **O juiz apontou** `decisionAccepted: true` sem aceite: o cliente disse "sim quero ver" (pedido
  de VER) e o estado gravou decisão aceita e despachada — no WhatsApp isso manda à mesa um lead
  marcado como decidido.
- **Escrevi o cenário para reproduzir e ele NÃO reproduziu:** no estado que montei, o "sim" não
  marcou aceite nenhum, ou seja, não achei o caminho real. Apaguei o teste em vez de deixá-lo
  passando vacuamente (teste verde que não exercita nada é pior que teste nenhum).
- **Decisão:** não mexer no código sem reprodução. Fica como pendência com a evidência do juiz
  (conversa `dd7d420a`), não como conserto declarado.

### D13 · 03:45 — a conta com veredito, o item nº 1 do juiz
- **O que ele mediu na série inteira:** a "faixa fantasma" (convidar o cliente a esticar para
  R$ 300–400, faixa onde nada existe) apareceu em **3 de 5 rodadas**, e o "R$ 9 mil" (a regra de
  três apresentada como produto disponível) em outras 3. Na rodada 7 as duas coisas aconteceram
  **na mesma mensagem em que o agente citou o piso correto de R$ 484** — prova de que injetar o
  número no contexto não garante adesão a ele.
- **Decidi** entregar o VEREDITO, não mais contexto: o servidor calcula e declara (a) o crédito
  implícito da parcela pedida, rotulado como **inexistente**; (b) a menor parcela real; (c) a
  menor parcela alcançável **esticando o prazo até o teto** da administradora; e (d) se o alvo é
  alcançável por qualquer alavanca. Quando não é, proíbe explicitamente convidar para faixa
  abaixo do piso.
- **Por que isso não é mordaça:** não olha a fala do agente em momento nenhum — é aritmética
  sobre o catálogo que está na tela. A regra de três o modelo fazia sozinho; melhor entregá-la
  pronta e já rotulada do que deixá-lo apresentá-la como oferta.
- **Evidência na rodada seguinte:** *"esticar o prazo ao máximo pra baixar pra uns R$ 343"* — o
  número que o servidor calculou — e *"R$ 200 por mês não existe em nenhuma administradora, nem
  esticando o prazo no máximo"*. Nenhuma faixa fantasma na conversa inteira.

### ⚠️ PENDENTE-KAIRO · 23:50 — configurar a ponte de alerta em produção
- **O que é:** (a) gravar `LANGFUSE_WEBHOOK_SECRET`, `ALERTA_OBSERVABILIDADE_TO`,
  `CORTEX_MCP_URL`, `CORTEX_MCP_TOKEN`, `CORTEX_PROJETO` no secret `tb/prod/aja-agora/env`
  **e** mapear cada chave na taskdef (secret sem entrada na taskdef não chega ao container);
  (b) criar a Automation (webhook) e os Monitors na UI do Langfuse de produção.
- **Por que não fiz:** escrita em secret de produção + deploy + configuração em ferramenta
  compartilhada. Blast radius alto — fora da autonomia de execução do modo autônomo.
- **Como destrava:** ele autoriza, ou roda ele mesmo seguindo
  `docs/integracoes/alerta-langfuse-email-cortex.md` §"Variáveis de ambiente" e §"O que criar na
  UI do Langfuse". O caminho **local** equivalente eu provo nesta sessão.

## Linha do tempo (resumida)

- 23:28 — conversa quebrada acontece em produção
- 23:35 — última mensagem; conversa morre sem card
- 23:40 — transcript e estado extraídos do RDS de produção
- 23:45 — `super-especialista-de-ia` disparado com o dossiê
- 23:48 — provado: rota de alerta responde 503, 5 envs ausentes, 4 Monitors não cobririam o caso
- 23:51 — Kairo saiu; modo autônomo ativado, diário aberto
- 23:51 — complemento de escopo enviado ao especialista (ponto 9: sinal que teria pego)
- 00:15 — dossiê do especialista (516 linhas); duas hipóteses minhas corrigidas por ele
- 00:35 — P0 completo: reducer, alvo discriminado, busca vazia com freio, 5 sinais novos
- 00:50 — ponte alerta → Cortex provada ao vivo (`ocorrencia_aberta: true`)
- 01:25 — juiz: **4/10** (estado curado, conduta não)
- 01:45 — contexto da tela + busca vazia como fato; juiz: 7,5 e 2 (produto 3/10)
- 02:30 — defeito [A] do juiz (CPF em dobro) corrigido na causa: **0 em 2 rodadas**
- 03:10 — suítes finais verdes (2.955 unit · 120 jornada · 327 caminho do dinheiro)

## Relatório final

**Status: PARCIAL** — os defeitos de estado morreram e estão provados; a nota 10/10 do juiz
não foi atingida (o produto saiu de 4/10 para uma amostra que ainda varia).

### Resultado vs critério de pronto

| Critério | Resultado |
|---|---|
| Regressão falhando antes / verde depois por defeito | ✅ 11 commits, cada um com teste que reproduziu o defeito primeiro |
| `pnpm typecheck` + suíte unitária | ✅ limpo · **2.955 testes** |
| Sinal determinístico novo, provado por teste | ✅ 5 sinais (`busca_abaixo_do_piso`, `busca_vazia`, `busca_esgotada`, `estado_incoerente`, `oferta_contradiz_parcela`) + erro da Bevi passando a pontuar |
| Ponte alerta → Cortex provada na stack local | ✅ ponta a ponta, webhook assinado → `ocorrencia_aberta: true` |
| Conversa refeita com 10/10 de um agente juiz | ❌ **não atingido** — ver abaixo |

Suítes na verificação final: unitária **2.955**, jornada **120**, caminho do dinheiro
**327** (integração com DB real). Typecheck limpo.

### A nota, com honestidade

O juiz (independente, com o dossiê factual e sem acesso à minha narrativa) deu:

- **4/10** na primeira validação — o estado estava curado e o agente **continuava anunciando
  oferta inexistente**;
- depois das correções de contexto: **7,5/10** numa rodada e **2/10** em outra, com nota de
  produto **3/10** — "o cliente recebe um sorteio";
- o defeito de maior alcance que ele isolou (pedido de CPF em dobro, 4 de 4 ocorrências) está
  **corrigido e medido: 0 em 2 rodadas**.

O que ele diz e eu assino: **injeção de contexto não é adesão**. Na mesma conversa em que o
agente citou "R$ 484 da Tradição em 61 meses" (exato, do payload), quatro turnos depois ele
ofereceu "algo entre R$ 300 e R$ 400" — faixa que não existe. O dado chegou e o modelo o
contradisse. Isso não se conserta com mais contexto nem com regex: mede-se com juiz sobre volume.

### O que NÃO fiz, e por quê

- **Configurar a ponte em produção** (5 envs no secret + taskdef, Automation e Monitors na UI do
  Langfuse) — blast radius alto, fora da autonomia do modo autônomo. Está em PENDENTE-KAIRO com
  o passo a passo.
- **`decisionAccepted` sem aceite** — escrevi o cenário, não reproduziu, apaguei o teste em vez
  de deixá-lo verde à toa. Pendência com evidência, não conserto declarado (D12).
- **P1.6 (telefone canônico / contato duplicado)** e **P2 do dossiê** — não cheguei.
- **Medir a variância com N≥20** — é o próximo passo mais importante e não cabia nesta sessão.

### Revisar primeiro (as decisões mais discutíveis)

1. **D7, o retry de busca vazia:** o dossiê pedia "nunca 2+ buscas no mesmo alvo"; adotei **duas**
   para não quebrar o FIX-380, que usa a segunda vazia como gatilho. É um julgamento meu entre
   duas fontes que discordam.
2. **D10/`recommendedOfferStale`:** inverti minha própria decisão anterior (apagar a âncora) para
   marcá-la. Apagar consertava a frase e criava um buraco no fecho.
3. **`cenario-faixa-so-reposiciona-com-oferta-vista`** — única asserção de teste antigo que
   inverti, de propósito: ela travava o crédito derivado da parcela, que é a causa do incidente.

### Próximos passos sugeridos (na ordem do juiz)

1. Medir a variância: rodar a mesma sequência N≥20 com juiz no Langfuse. Com n=2 não se sabe se a
   rodada ruim é exceção ou norma.
2. **Reconciliação fala × catálogo como sinal**: extrair os valores em R$ que o agente citou no
   turno e comparar com o intervalo real das ofertas que estavam no contexto. Pega "R$ 300 a
   R$ 400" (fora de [484, 1323]) sozinho — e é o instrumento que responde "a injeção pegou?".
3. Invariante estrutural de turno: card com 0 caractere de fala é defeito.
4. Procedência por campo em `qualifyAnswers` (dito × assumido × derivado) — `objetivo` e
   `hasLance` entram sem ninguém ter dito, e alimentam o ranking.
5. Quando o alvo é impossível, entregar a **impossibilidade calculada** (a parcela mínima real
   esticando o prazo até o teto do catálogo), não só a busca vazia.
