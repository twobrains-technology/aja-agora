# Conversão: site, mídia e funil — PRD de execução

**Goal:** executar os 26 itens das abas **Site (CRO)** e **Plano de Ação por Etapa** da planilha
"Aja Agora — Cenários de Investimento e Plano de Conversão" (Gustavo, 28/08/2026), cada um levado
até prova de que funciona.

**Origem:** auditoria externa feita sobre a produção de ~20/08. Entre a auditoria e hoje entraram
os commits de 20/08 e 28/08 (hero, CTAs, colagem) — **parte da lista já está entregue**, e isso
está marcado item a item abaixo.

**Escopo:** a aba Site (CRO) inteira (8) + a aba Plano de Ação por Etapa inteira (25), unidas em 26
itens (o sticky só existe na aba CRO; os outros 7 de site se repetem nas duas). As linhas de Bot
entram como **validação** — você já as deu por resolvidas, e o trabalho aqui é provar isso contra o
código, não refazer.

---

## Restrições globais

- **Nada de regra-no-prompt para o que é fala.** Invariante verificável vira código; tom, ordem e
  empatia continuam do modelo (`CLAUDE.md`).
- **Mexeu em `SYSTEM_PROMPT` ou `BASE_SYSTEM_INSTRUCTION` → `pnpm sync-prompts`.** Sem isso a
  produção continua rodando o texto velho e o item volta como "não funcionou".
- **TDD para bug, integração para número.** Nada de Playwright; smoke de jornada é agente Haiku via
  `claude-in-chrome`.
- **Português com acento** em toda copy nova.
- **Toda mudança de conversão nasce medível.** Item que não diz como será medido não entra em
  execução — o mapa de calor (`data-heat-id`, `section_view`, `chat_open`) já dá o instrumento.

## Legenda de status

| Marca | Significado |
|---|---|
| 🟢 **Entregue** | já está no código; o trabalho é confirmar e medir |
| 🟡 **Parcial** | metade feita, falta um pedaço nomeado |
| 🔴 **Aberto** | não existe; é construção |
| 🔵 **Não é código** | mídia, processo ou operação da mesa |

---

# Bloco A — Site (CRO)

## A1. Affordance do campo do agente 🟡

**O que entendi.** A auditoria viu um campo de texto que não parece campo: sem borda, sem cursor de
texto, com um aviãozinho de 37px como única saída — alvo pequeno demais para dedo. A pessoa chega no
hero e não percebe que ali se digita. É o item de melhor retorno por esforço da aba (Alto impacto,
esforço "Baixo (CSS)"), e o modelo estima +15% conservador a +40% otimista sobre `%Conv Chat`.

**Estado real.** Metade já caiu: o aviãozinho virou `Quero minha simulação`, um `KvCtaButton` de 58px
de altura e largura total (`kv-hero.tsx:203`). O campo em si continua `bg-transparent outline-none`,
sem borda e sem `cursor-text` (`kv-hero.tsx:160`) — o que sinaliza "isto é editável" hoje é só o
placeholder que se digita sozinho (`usePlaceholderDigitando`), que é bonito mas não é affordance:
texto animado também aparece em banner.

**O que vou fazer.** Dar ao input a moldura que o form de identidade já usa (`gate-identity-form.tsx:95`
— `border border-input rounded-xl`, foco com `--ring` e `--shadow-focus`), mais `cursor-text`. Reusar
esse conjunto em vez de inventar um novo mantém o site coerente com o chat. Ajusto o padding para o
campo não brigar com o cabeçalho do card.
**Arquivos:** `src/components/kv/kv-hero.tsx`.
**Como valido:** teste de componente afirmando que o input tem borda e `cursor-text`; depois,
`chat_open` com `label="digitada"` versus `label="chip"` no mapa de calor — se o campo passou a ser
percebido, a fatia de "digitada" sobe.

## A2. Bolhas de chat decorativas do hero 🟡

**O que entendi.** No hero havia balões que pareciam mensagens de chat e não faziam nada ao toque.
Isso gasta a intenção de quem estava disposto a clicar: a pessoa toca, não acontece nada, e conclui
que a página é enfeite. A recomendação é remover ou transformar em CTA de verdade.

**Estado real.** Mudou de natureza e ficou mais difícil, não mais fácil: os balões agora fazem parte
do **PNG único** da colagem (`public/kv/hero-collage.png`, 1419×1355). Não são mais nós de DOM — não
dá para "converter em CTA" sem refazer a arte no Figma. Em compensação, a mitigação certa já entrou
em 28/08: o `Comparar agora` só-mobile aparece logo depois da colagem, quando o card do hero já saiu
da tela.

**O que vou fazer.** Medir antes de mexer na arte. O tracker já registra `click` com coordenadas de
página e `rage_click` (`src/lib/heatmap/events.ts`) — se houver toque concentrado sobre a área da
colagem, é prova de que os balões continuam prometendo clique, e aí o pedido vai para o Figma com
evidência. Se não houver, o item se encerra como resolvido pelo `Comparar agora` e eu registro isso.
**Arquivos:** consulta em `src/lib/heatmap/queries.ts` / painel `/admin/mapa-de-calor`.
**Como valido:** o próprio número de toques mortos sobre a colagem, nos mesmos 28 dias da planilha.

## A3. Botão fixo (sticky) de chat ao rolar 🟡 — *e o furo de medição da campanha*

**O que entendi.** No celular, todo caminho para a conversa estava no topo. Quem rolou até o FAQ —
justamente quem se interessou — precisava voltar ao hero. A auditoria pede um sticky de chat (Alto
impacto, esforço médio, +10% a +25%).

**Estado real.** O sticky existe desde 20/08, mas **é do WhatsApp, não do chat**: `chat-flutuante.tsx`
é uma âncora `wa.me` com a primeira fala pré-escrita, decisão sua registrada no próprio arquivo. Ele
resolve o problema de alcance — mas por um caminho que **sai do site**.

E é aí que está o furo: esse link não carrega `ctwa_clid`, então quem converte por ele entra no
WhatsApp **sem `visitId`** e não aparece nas 39 conversas de "origem conhecida" que servem de base
para a planilha inteira. Ou seja, `%Conv Chat = 1,68%` é **piso, não taxa** — e todo o cálculo de
investimento (R$ 84 mil a R$ 616 mil/mês) foi construído em cima dele.

**O que vou fazer.** Duas frentes. (1) **Medir agora**: o botão tem `data-heat-id="whatsapp-flutuante"`,
então conto os toques dos mesmos 28 dias e comparo com as 39 conversas — isso dá o tamanho do que
está fora da conta. (2) **Fechar o vazamento**: carimbar a URL do `wa.me` com um código curto de
visita dentro do próprio texto da primeira fala, e reconhecê-lo no webhook para amarrar a conversa de
WhatsApp à visita que a originou. É a mesma amarração que o `ctwaClid` já faz para anúncio
Click-to-WhatsApp (`src/lib/conversions/registry.ts:120`), aplicada ao tráfego do site.
**Arquivos:** `src/components/chat/chat-flutuante.tsx`, `src/app/api/webhook/whatsapp/route.ts`,
`src/lib/attribution/`.
**Como valido:** teste de integração — mensagem de entrada com o código carimbado cria conversa com
`visitId` preenchido. E o funil da planilha recalculado com o denominador certo.

## A4. Reformular a 1ª dobra mobile 🟢

**O que entendi.** Excesso de texto antes de qualquer ponto de ação: selo + manchete + subtítulo
empurravam o card para baixo da dobra. A recomendação é badge fora do hero, pills virando blocos
ícone+rótulo, chamada "Fale com a Aja" e placeholder rotativo.

**Estado real.** Praticamente tudo entregou-se em 20/08: o chapéu virou texto e deixou de parecer
botão (`kv-hero.tsx:107`), o parágrafo do problema saiu, os pills viraram blocos de ícone + rótulo +
apoio em grade de 3, "Fale com a Aja" é o título do card e o placeholder rotativo existe.

**O que vou fazer.** Não reabrir. Confirmar no smoke mobile (agente Haiku via `claude-in-chrome`, na
janela do perfil Twin) que o card do hero cabe na primeira dobra em viewport de 390×844, e anexar o
screenshot como prova de encerramento do item.
**Como valido:** screenshot + `section_view` da seção do hero versus scroll_depth 25% — se a ação
está na dobra, quase toda visita vê a seção sem rolar.

## A5. CTA unificado sitewide 🟡

**O que entendi.** Mais de 7 textos de botão diferentes pelo site, sem padrão. Cada rótulo novo é uma
decisão nova para o visitante, e a repetição do mesmo verbo é o que constrói reconhecimento. A
sugestão é padronizar em "Quero minha simulação".

**Estado real.** Já caiu de 7+ para **3 rótulos vivos**: `Comparar agora` (5 lugares — hero mobile,
independente, journey, menu, numbers), `Quero minha simulação` (o fecho do card do hero) e
`Fale com a AJA` (depoimentos, `kv-depoimentos.tsx:121`).

**O que vou fazer.** Fechar em um verbo só. Minha recomendação é manter **`Comparar agora`** como
rótulo único, e não o sugerido pela planilha: ele é o que já está em 5 dos 7 pontos, e "comparar" é a
promessa da marca (comparador independente), enquanto "simulação" é o que a concorrência toda diz. A
exceção que eu preservaria é o botão dentro do card do hero, que fecha um formulário já preenchido —
ali "Quero minha simulação" descreve o resultado do envio. Levo a decisão a você antes de aplicar.
**Arquivos:** `src/components/kv/kv-depoimentos.tsx` e o que sobrar divergente.
**Como valido:** teste que varre os componentes da landing e falha se aparecer um rótulo de CTA fora
do conjunto aprovado — assim o item não regride no próximo commit de copy.

## A6. Feedback visual ao toque 🔴 — *maior do que a planilha viu*

**O que entendi.** A auditoria aponta os pills de segmento sem resposta ao toque (Baixo-Médio
impacto, +4% a +12%). Sem feedback, a pessoa não sabe se o toque registrou e toca de novo — que é o
`rage_click` que o nosso próprio tracker mede.

**Estado real e por que é maior.** Não é só nos pills: **nenhum CTA do site tem estado `active:`**. O
`KvCtaButton` traz só `hover:brightness-110` (`kv-cta-button.tsx:14`) e os blocos do hero só
`hover:border`/`hover:bg` — e **hover não existe em celular**. Ou seja, hoje, no aparelho onde está o
tráfego pago inteiro, todo botão da home responde ao dedo sem nenhum sinal.

**O que vou fazer.** Estado `active:` no átomo compartilhado — que já é o lugar certo, porque o
`KvCtaButton` existe justamente para não copiar a pill em cada seção — e nos blocos de segmento do
hero. Como a transição atual lista propriedades explícitas
(`transition-[filter,color,background-color]`), incluo `transform` para o feedback de escala não sair
seco. Respeito `prefers-reduced-motion`.
**Arquivos:** `src/components/kv/ui/kv-cta-button.tsx` (resolve o site inteiro),
`src/components/kv/kv-hero.tsx` (os 3 blocos).
**Como valido:** teste de componente sobre as classes de estado; e queda de `rage_click` sobre os
alvos de CTA no mapa de calor.

## A7. Core Web Vitals mobile + validação de UTM/pixel 🔴

**O que entendi.** Connect Rate de 94% significa que **6 de cada 100 cliques pagos não viram sessão** —
some antes de a página existir. Em 2.473 cliques são ~149 pessoas pagas e perdidas por mês. A
recomendação é auditar CWV mobile e validar que UTM e pixel sobrevivem à navegação.

**Estado real.** Há um suspeito nomeado: a colagem do hero é PNG de **1,9 MB** (já reduzida de 3,9 MB
em 28/08), 1419×1355, servida com `priority` e `quality={100}` — qualidade que passou a valer ontem,
quando `qualities: [75, 100]` entrou no `next.config.ts` para manter legível o texto fino dos balões.
Isso é o LCP da home, e foi uma decisão consciente de qualidade, não um descuido.

**O que vou fazer.** Medir antes de tocar, porque aqui o trade-off é real e a decisão é sua. Rodo
Lighthouse mobile na produção, isolo a contribuição da colagem no LCP e trago três opções com número:
manter, baixar para q90, ou cortar a arte em uma versão mobile de menor densidade. **Não vou usar
`chrome-devtools` nem `playwright` para isso** — aba em segundo plano inventa métrica de frame; uso
Lighthouse por CLI, que não depende de apresentação. A parte de UTM/pixel eu resolvo por teste: uma
visita com `utm_*` e `fbclid` na URL tem de terminar com esses campos gravados na visita.
**Arquivos:** `src/components/kv/kv-hero.tsx`, `public/kv/hero-collage.png`, `src/lib/attribution/`.
**Como valido:** LCP mobile antes/depois; teste de integração de atribuição ponta a ponta.

## A8. Instrumentar scroll-depth por seção 🟢

**O que entendi.** A auditoria pede Hotjar ou Clarity para saber onde a pessoa para de rolar, e trata
isso como pré-requisito de diagnóstico para as próximas decisões.

**Estado real.** Já existe, e é melhor do que a ferramenta sugerida: o mapa de calor próprio, no ar
desde 18/08, registra `scroll_depth`, `section_view`, `click`, `rage_click` e — o que Hotjar não faria
— `chat_open` **com a seção que originou a abertura** e a semente da conversa
(`src/lib/heatmap/events.ts:103`). Painel em `/admin/mapa-de-calor`.

**O que vou fazer.** Nada de construção; **usar**. Extraio a curva de scroll por seção dos mesmos 28
dias e ponho no relatório da campanha — é o dado que decide A2 e prioriza as seções. Um aviso que
entra no relatório: a coleta começou em 18/08, então janela anterior a essa data é **período sem
medição**, não é comportamento — não dá para ler queda onde não havia coletor.
**Como valido:** o próprio relatório, com a data de início da coleta declarada.

---

# Bloco B — Mídia Paga

## B1. Propagar UTM/fbclid até o evento "chat iniciado" 🟢

**O que entendi.** Sem carregar a origem da campanha até o evento de conversa, não se sabe qual anúncio
gera conversa — e nenhuma das outras ações de mídia pode ser avaliada. A planilha marca como
pré-requisito de tudo.

**Estado real.** Existe: `src/lib/attribution/params.ts` e `visit-store.ts` capturam a visita, a
conversa carrega `visitId`, e o registro de conversão já monta `fbc` a partir do `fbclid`, envia `fbp`
e trata `ctwaClid` (`src/lib/conversions/registry.ts:116-121`).

**O que vou fazer.** Auditar cobertura em vez de construir: medir que percentual das conversas dos
últimos 28 dias tem `visitId` e `utm_campaign` preenchidos. O buraco que eu já espero encontrar é o
do A3 (tráfego que sai pelo botão do WhatsApp) — os dois itens se fecham juntos.
**Como valido:** consulta no banco de produção via túnel SSM; percentual declarado no relatório.

## B2. Auditoria de Event Match Quality (Pixel/CAPI) 🟡

**O que entendi.** O EMQ é a nota que a Meta dá à qualidade dos dados de conversão que recebe. Nota
baixa faz o algoritmo otimizar às cegas, e é pré-requisito técnico para otimizar por evento de
conversa.

**Estado real.** O nosso lado da ponte está construído: CAPI server-side com e-mail e telefone em
hash (`src/lib/conversions/hash.ts`), `fbc`, `fbp`, `ctwaClid`, `actionSource` correto para
business messaging e chave de deduplicação por lead+evento.

**O que vou fazer.** Rodar `pnpm tsx src/scripts/smoke-capi.ts` contra produção para confirmar que os
eventos estão sendo aceitos, e levantar quantos eventos saem **sem** telefone ou e-mail (o que derruba
o EMQ). A leitura da nota em si é no Gerenciador de Anúncios — isso eu preparo e o Gustavo executa.
**Arquivos:** `src/scripts/smoke-capi.ts`, `src/lib/conversions/`.
**Como valido:** contagem de eventos por completude de campo; nota de EMQ reportada pela agência.

## B3. Trocar o evento de otimização para "Início de Conversa" 🔴 — *o item de mídia que é nosso*

**O que entendi.** As campanhas otimizam hoje por tráfego. Otimizar pelo evento de conversa ensina o
algoritmo a buscar quem conversa, e não quem clica — é a ação de maior impacto estimado da aba de
mídia (+50% a +90% relativo em `%Conv Chat`).

**Estado real.** Falta metade da ponte. O `ChatIniciado` existe **só no browser**, como `trackCustom`
(`src/lib/analytics/meta-pixel.ts:46`); o CAPI server-side só envia `lead_qualificado`,
`proposta_criada` e `contrato_fechado` (`registry.ts:19`). Otimizar campanha por um evento que só
existe client-side é o caminho frágil: bloqueador de anúncio, iOS e falha de rede comem o sinal
exatamente no público que mais importa.

**O que vou fazer.** Levar o início de conversa para o servidor, com o mesmo desenho dos eventos que já
existem — `eventKey` para deduplicar contra o pixel, `fbc`/`fbp` da visita, `actionSource` conforme o
canal. Vou tratá-lo como evento de sinal, não de conversão de negócio: ele entra separado dos três
marcos de venda, para não ensinar o algoritmo a buscar curioso (é a razão registrada no schema para a
lista de eventos ser curta, `src/db/schema.ts:57`).
**Arquivos:** `src/lib/conversions/registry.ts`, `src/db/schema.ts` (novo valor no enum + migration),
`src/components/chat/theater/theater-context.tsx`.
**Como valido:** teste de integração — abrir o teatro grava um evento de conversão pendente com
`visitId` e chave de dedup; e o evento aparecendo no Gerenciador com deduplicação correta.

## B4. Consolidar CBO + reservar ABO para remarketing 🔵

**O que entendi.** A estrutura atual tem 5 campanhas, e três delas (BOFU R$ 174, MOFU R$ 202, RMKT
R$ 122) estão com volume baixo demais para sair da fase de aprendizagem — o MOFU tem o CPM mais caro do
conjunto, R$ 107, justamente por isso. Consolidar em CBO deixa o algoritmo distribuir, e o ABO reservado
protege o remarketing de ser sufocado.

**Estado real.** É operação de conta de anúncio. Não há código envolvido.

**O que vou fazer.** Nada no repositório — mas isto **não sai da lista**: entra no relatório da campanha
como item do Gustavo, com a data de execução e o antes/depois de CPM e CPC, porque o modelo de CPC em
escala das nossas premissas depende do resultado dele.
**Como valido:** CPM e CPC por campanha, 14 dias depois da mudança.

## B5. Expandir o peso orçamentário do remarketing 🔵

**O que entendi.** O remarketing tem o maior CTR do conjunto (12,21%, contra média de 5,68%) com o menor
orçamento (R$ 122). É o público que já conhece a marca e converte melhor; está subfinanciado.

**Estado real.** Operação de conta, como o B4.

**O que vou fazer.** Também fica com a agência — com uma ressalva nossa que vale registrar: o
remarketing só escala se as audiências estiverem sendo alimentadas, e isso depende do B1/B2. Se o EMQ
estiver ruim, aumentar orçamento de remarketing gasta mais para alcançar as mesmas pessoas.
**Como valido:** CTR e custo por conversa do RMKT depois do aumento.

---

# Bloco C — Bot: etapa de identificação

> Você deu o bot por resolvido. Estes 7 itens entram como **validação**: provar contra o código o que
> já está feito e nomear o que sobrou. O que encontrei já muda a leitura da planilha.

## C1. Mostrar faixa estimada de carta/parcela ANTES de pedir CPF 🟢 — *a causa raiz nº 1 já tem motor*

**O que entendi.** É a alavanca principal da auditoria: o bot pede o dado mais sensível do Brasil (CPF)
antes de entregar qualquer valor concreto, invertendo a reciprocidade do funil. 69% das pessoas somem
nesse ponto. A recomendação é mostrar uma estimativa antes de pedir.

**Estado real — e é o achado que mais muda o plano.** O motor existe e está no lugar certo:
`src/lib/consorcio/plan-estimate.ts` calcula parcela em **"modo estimativa de mercado"**, com premissas
documentadas por categoria e o selo "estimativa — valores reais virão da busca", exatamente porque a
Bevi não simula sem CPF. E a ordem do funil em `nextGate` já é **`credit` → `identify` → `search`**
(`qualify-state.ts:356-375`): o passo da estimativa vem **antes** do pedido de CPF.

Mas o roteiro real transcrito na planilha (Madalena e Mario) mostra nome → bem → valor → "preciso do
seu CPF e WhatsApp", **sem a estimativa aparecer**. As duas coisas não podem ser verdade ao mesmo
tempo.

**O que vou fazer.** Este item deixa de ser construção e vira investigação — que é onde está o dinheiro.
Duas hipóteses a separar com dado: (a) o `plan-estimate-picker` não está sendo renderizado nas conversas
reais, ou (b) as conversas auditadas são anteriores ao componente. Puxo as conversas dos 28 dias e conto
em quantas o artefato de estimativa foi emitido antes do gate `identify`. Se for (a), o defeito é de
emissão de card e vale mais do que qualquer item de CSS desta lista.
**Arquivos:** `src/lib/consorcio/plan-estimate.ts`, `src/components/chat/artifacts/plan-estimate-picker.tsx`,
`src/lib/agent/orchestrator/`.
**Como valido:** contagem, por conversa, de artefato de estimativa emitido antes do `identify`.

## C2. Garantia explícita de privacidade/anti-spam no momento do pedido 🟡

**O que entendi.** No instante em que se pede CPF, o silêncio sobre o destino do dado é preenchido pela
pior hipótese: consulta de crédito, ligação de vendas, dado vendido. Uma frase curta de garantia no
ponto exato do pedido vale mais que uma política de privacidade no rodapé.

**Estado real.** O que existe é o **aceite LGPD** — "Autorizo a consulta dos meus dados nas
administradoras parceiras (LGPD) pra simular as ofertas. Não é compromisso de contratação."
(`gate-identity-form.tsx:126`). Isso é uma **autorização que eu peço**, não uma **garantia que eu dou**;
somada ao CPF, é mais uma coisa para a pessoa conceder. "Não é compromisso de contratação" é a única
meia-garantia presente.

**O que vou fazer.** Acrescentar ao form uma linha curta de garantia — o que **não** fazemos com o dado —
mantendo o aceite LGPD onde está. Copy em português correto, sem promessa que a operação não cumpra
(nada de "nunca ligamos" se a mesa liga). É copy de **UI do servidor**, não fala do agente: entra no
componente, não no prompt.
**Arquivos:** `src/components/chat/artifacts/gate-identity-form.tsx`.
**Como valido:** taxa do gate `identify` (conversas que passam / conversas que chegam), antes e depois.

## C3. Desacoplar: só WhatsApp primeiro, CPF ao gerar a oferta real 🔴 — *decisão de produto, não de código*

**O que entendi.** Pedir os dois dados de uma vez é tudo ou nada: quem não quer dar CPF agora não tem
caminho e a conversa morre. Dando só o WhatsApp a pessoa avança, e o CPF é pedido quando há oferta real
na mesa.

**Estado real.** Colide de frente com um invariante do produto: **a Bevi não simula sem CPF**
(`gate-identity-form.tsx:9` e `qualify-state.ts:774`), e `nextGate` bloqueia `search` sem
`identityCollected`. Ou seja, "avançar só com WhatsApp" só é possível se existir algo real para mostrar
entre um passo e outro — que é precisamente o C1. Os dois itens são o mesmo item visto de dois lados.

**O que vou fazer.** Não implemento antes de C1 estar respondido. Se a estimativa já aparece e mesmo
assim 69% somem, desacoplar é a próxima aposta e eu desenho: gate `identify` dividido em
`identify-phone` (só WhatsApp, libera a estimativa detalhada) e `identify-cpf` (imediatamente antes da
busca real). Isso mexe na cascata do funil, que é **código** e tem teste de ordem — não é ajuste de
prompt.
**Arquivos:** `src/lib/agent/qualify-state.ts`, `src/lib/agent/orchestrator/gate-questions.ts`,
`src/components/chat/artifacts/gate-identity-form.tsx`.
**Como valido:** teste de integração da nova cascata + comparação de taxa de identificação.

## C4. Avançar só com WhatsApp; CPF como 2º microcompromisso 🔴

**O que entendi.** É o C3 levado ao limite: o CPF migra para a formalização, deixando de ser porteiro da
simulação e virando etapa da contratação.

**Estado real.** Hoje o produto já tem um passo de contratação com CPF próprio — o gate `contract`, com
CPF, celular e LGPD (`qualify-state.ts:22`, `contract-form.tsx`). A estrutura para receber esse desenho
existe; o que impede é a Bevi exigir CPF para a **busca**.

**O que vou fazer.** Tratar como a variante B de um teste A/B com o C3, não como item separado — são a
mesma mudança com dois graus de agressividade. Executo depois de C1 e C3, e trago o desenho para você
decidir, porque muda a jornada e é decisão de produto.
**Como valido:** teste A/B com taxa de identificação e, principalmente, taxa de proposta — adiar o CPF
pode subir a identificação e derrubar a etapa seguinte; só o funil inteiro responde.

## C5. Prova social/autoridade no momento do pedido 🔴

**O que entendi.** Consórcio carrega ceticismo público. No instante do pedido de dado sensível, uma
credencial ("comparador independente", "administradoras autorizadas pelo Banco Central") reduz o risco
percebido — a mesma função da bandeira de cartão no checkout.

**Estado real.** O form do `identify` traz só "Pra buscar suas ofertas reais". A landing **já** usa esse
argumento — a colagem do hero cita administradoras autorizadas pelo Banco Central e existe uma seção
inteira de independência (`kv-independente.tsx`) — mas nada disso viaja para dentro do chat, que é onde
o dado é pedido.

**O que vou fazer.** Levar uma linha de autoridade para o form de identidade, reusando a formulação que
já está na landing (não invento credencial nova; uso a que a marca já assina). Copy de UI, no componente.
**Arquivos:** `src/components/chat/artifacts/gate-identity-form.tsx`.
**Como valido:** medido junto com C2 — as duas mudanças vivem no mesmo card, então testo o card, não cada
frase.

## C6. Reduzir fricção de digitação do CPF 🟢

**O que entendi.** Digitar CPF no celular é chato; máscara e teclado numérico reduzem o atrito.

**Estado real.** Feito nos dois formulários: `maskCpf` formatando durante a digitação,
`inputMode="numeric"` e placeholder `000.000.000-00` (`gate-identity-form.tsx:85-88`,
`contract-form.tsx:16`).

**O que vou fazer.** Encerrar com prova. Confirmo no smoke mobile que o teclado numérico abre no aparelho
real e que a máscara não trava a colagem de um CPF já formatado — o caso que costuma quebrar máscara
feita à mão.
**Como valido:** smoke mobile com screenshot; teste unitário de `maskCpf` com entrada já mascarada.

## C7. Quebrar o pedido duplo em dois passos sequenciais 🔴

**O que entendi.** Um formulário com CPF + celular + caixa de LGPD é uma parede. Pedir um dado por vez
reduz a carga percebida — mesmo somando o mesmo total.

**Estado real.** Não feito: `gate-identity-form.tsx` pede os três de uma vez. Vale registrar uma nuance
que a auditoria não tinha: **no WhatsApp isso já acontece**, porque o celular é o próprio `waId` e só o
CPF é pedido (`gate-questions.ts:224`). O problema é só da web.

**O que vou fazer.** É o mesmo eixo de C3/C4 e não deve virar uma terceira mudança concorrente na mesma
tela — três experimentos disputando o mesmo card não produzem leitura. Entra como a variante mais barata
do teste: mesma cascata, mesmo gate, dois passos visuais dentro do card. Se C3 for aprovado, este item é
absorvido por ele.
**Arquivos:** `src/components/chat/artifacts/gate-identity-form.tsx`.
**Como valido:** o mesmo teste A/B do C3.

---

# Bloco D — Bot: etapa de proposta

## D1. Instrumentar as 3 sub-etapas do handoff 🟡

**O que entendi.** Entre "viu oferta" e "proposta criada" há uma caixa-preta com vários passos —
respondeu no WhatsApp, especialista contatou, documentos, proposta. Com 12,5% de conversão agregada não
se sabe qual dos passos derruba. É pré-requisito analítico.

**Estado real.** Os dados existem: `leadStageEnum` tem `proposta_enviada`, `na_administradora`,
`em_atendimento`, `aguardando_pagamento`; há tabela de transição com `fromStage`/`toStage` e timestamp
(`schema.ts:465`); e `mesaHandoffStatusEnum` registra o estado do atendimento. O que não existe é a
**leitura**: nenhum relatório expõe o tempo e a taxa entre esses estágios.

**O que vou fazer.** Construir a consulta de funil por sub-etapa sobre a tabela de transição — taxa e
tempo mediano entre estágios — e expor no painel, ao lado do funil que já existe. Não é instrumentação
nova; é dar olhos ao que já é gravado.
**Arquivos:** `src/lib/admin/performance-queries.ts`, painel admin.
**Como valido:** os números batendo com contagem direta no banco para o mesmo período.

## D2. Link direto clicável no lugar de pedir "oi" 🟢

**O que entendi.** Mandar o cliente digitar "oi" num número copiado à mão é fricção gratuita no ponto de
maior intenção do funil. A auditoria estima +10 a +25 p.p. — a maior estimativa isolada da aba.

**Estado real.** Já resolvido: o handoff na web emite o artefato `atendimento_handoff` com número e
**mensagem inicial pré-preenchida** (`closing-presentation.ts`), e no WhatsApp o beat inteiro some
porque a conversa já está no canal certo (FIX-344). O "responde por lá com um oi" descrito na planilha
já não é a copy vigente.

**O que vou fazer.** Encerrar com prova, não com afirmação: confirmo no smoke que o card aparece no fecho
e que o link abre o WhatsApp com o texto preenchido. E aproveito o mesmo carimbo de origem do A3 aqui — o
handoff é justamente onde a continuidade de atribuição entre web e WhatsApp mais vale.
**Como valido:** smoke da jornada de fechamento + verificação do texto pré-preenchido.

## D3. SLA de resposta humana da especialista 🔵🟡

**O que entendi.** De nada adianta entregar o lead quente se ninguém responde. A auditoria estima +5 a
+15 p.p. e classifica o esforço como dependente da capacidade do time.

**Estado real.** Este item tem um histórico documentado no próprio código, e ele é grave: em 14/08 uma
cliente fechou proposta de R$ 211 mil, escreveu e recebeu silêncio — a notificação de handoff levou
**42 minutos** para ser entregue e **17h24** para ser lida (`src/lib/mesa/acolhida-n1.ts`). Já existe o
cobertor (a acolhida N1, que fala com o cliente enquanto ninguém atende), e o próprio arquivo é honesto
ao dizer que isso **não conserta a campainha**.

**O que vou fazer.** A parte de processo (quem responde, em quanto tempo) é sua e da mesa. A parte que é
nossa é a campainha: medir o tempo entre handoff e primeira resposta humana a partir da tabela de
transição do D1, e alarmar quando passar do limite. Sem essa medição, "definir SLA" é combinar um número
que ninguém verifica.
**Arquivos:** `src/lib/admin/performance-queries.ts`, alarme via Langfuse Monitors.
**Como valido:** distribuição do tempo até a primeira resposta humana, com p50 e p90.

## D4. Sequência de reengajamento automático 🟢

**O que entendi.** Lead que não responde em N horas some para sempre se ninguém puxar. Uma sequência
automática recupera parte.

**Estado real.** Existe em duas camadas, ambas rodando no worker de produção desde 25/08:
`gate-reengage-poll` reabre funil parado em gate pendente (`FIX-207`), e `retomada.ts` é um **turno de
servidor de verdade** para a conversa que morreu sem marcador — entra pelo mesmo grafo, com teto de 2
tentativas e 30 minutos de intervalo, e sem texto enlatado: o servidor informa o fato, a fala continua
do modelo.

**O que vou fazer.** Validar cobertura no recorte que a planilha aponta, que é **depois** do handoff:
`retomada` e `gate-reengage` cuidam do funil da conversa; quem foi entregue à mesa e não respondeu no
WhatsApp está fora desse alcance. Meço quantos leads ficam nesse estado e, se houver volume, o item vira
construção — dentro da regra da janela de 24h, que não recupera lead antigo.
**Arquivos:** `src/lib/workers/retomada.ts`, `src/lib/workers/gate-reengage-poll.ts`.
**Como valido:** contagem de leads entregues sem resposta, por faixa de tempo.

## D5. CTA de confirmação de interesse antes da troca de canal 🔴

**O que entendi.** A troca de canal (web → WhatsApp) é o ponto de maior perda. Um micro-compromisso antes
da troca — a pessoa dizendo "sim, quero" ainda dentro do chat — aumenta a chance de ela completar o
salto, por consistência.

**Estado real.** O funil já tem gates de confirmação em pontos vizinhos (`reco-consent` antes do card de
recomendação, `decision`), então o padrão existe e é reusável. No fecho, porém, o handoff é emitido
direto.

**O que vou fazer.** Verificar primeiro se a confirmação já não acontece de fato via `decision` — não
quero somar um gate a mais numa cascata que já tem quinze, e gate duplicado é como o funil trava. Se não
houver, adiciono a confirmação no fecho, reusando o padrão do `reco-consent`.
**Arquivos:** `src/lib/agent/qualify-state.ts`, `src/lib/agent/orchestrator/`.
**Como valido:** teste de integração de ordem do funil + taxa de `viu oferta → proposta`.

---

# Bloco E — Bot + time humano: fechamento

## E1. SLA de documentos e follow-up humano pós-proposta 🔵🟡

**O que entendi.** Zero contratos fechados em 1 proposta criada. A auditoria é honesta ao marcar como
hipótese com n=1 e ao dizer que a alavanca aqui é **operacional, não do bot**: depois da proposta, o que
converte é alguém cobrando documento e acompanhando.

**Estado real.** A infraestrutura existe — gestão de documentos com os mesmos slots de KYC do fechamento
Bevi (`schema.ts:109`), estágios `aguardando_pagamento` e `fechado_ganho`, mesa com handoff rastreado.
Falta a leitura e o lembrete.

**O que vou fazer.** Mesma resposta do D3, um passo adiante no funil: medir o tempo em cada estágio
pós-proposta a partir da tabela de transição e disparar alerta para a mesa quando um lead ficar parado.
E registrar no relatório o que essa etapa **não** suporta: com n=1, qualquer taxa de fechamento é
hipótese, e nenhuma decisão de investimento deveria se apoiar nela.
**Arquivos:** `src/lib/admin/performance-queries.ts`, alarme.
**Como valido:** tempo mediano por estágio pós-proposta, e o número de leads parados.

---

# Ordem de execução

**Onda 1 — medir (não muda produto, destrava as decisões):** A3 (contar o vazamento do WhatsApp),
A8 (curva de scroll), B1 (cobertura de atribuição), **C1 (a estimativa aparece ou não?)**, D1 (funil por
sub-etapa). Sem esta onda, metade das decisões seguintes seria palpite.

**Onda 2 — quick-wins de site (baixo risco, alto retorno):** A6 (feedback ao toque, um arquivo cobre o
site inteiro), A1 (borda no campo), A5 (CTA único), A4 e C6 (encerrar com prova).

**Onda 3 — o que a onda 1 apontar:** C2+C5 (garantia e autoridade no mesmo card), A7 (LCP, com o número
na mão), A2 (arte, se houver toque morto).

**Onda 4 — estrutural, uma coisa de cada vez:** B3 (evento de conversa no CAPI), C3/C4/C7 como um único
teste A/B, D5, D3/E1 (medição + alarme).

**Fora do repositório, com o Gustavo:** B4, B5, e a leitura de EMQ do B2.

---

# O que valida a campanha inteira

O critério de sucesso não é a lista marcada — é `%Conv Chat` e a taxa do gate `identify` medidas **com o
denominador corrigido pelo A3**. Enquanto o tráfego que sai pelo botão do WhatsApp não estiver na conta,
qualquer melhora de conversão medida contra 1,68% está medindo contra um número errado.

E fica registrado o que este plano **não** promete: o CAC de R$ 20.549 do cenário "Atual" da planilha sai
de uma taxa de fechamento de 15% que não é dado observado — o observado é 0 contratos em 1 proposta. As
ações se sustentam por si; o modelo de investimento, não.
