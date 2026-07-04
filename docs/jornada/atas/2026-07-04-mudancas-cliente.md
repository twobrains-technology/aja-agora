# Ata de Alinhamento — AJA AGORA (TwoBrains × Cliente)

**Reunião:** Alinhamento TB — jornada do agente, site e backoffice
**Quando:** sexta-feira (à tarde, conforme mencionado na call)
**Participantes:** Kairo Silva, Romulo Costa (TwoBrains) · Bruna Perrotta, Bernardo Canedo, Eduardo Ferreira (cliente)

**Legenda de prioridade:** `P0` bloqueia lançamento · `P1` importante p/ jornada · `P2` melhoria / backlog
**Status:** ⬜ a fazer · 🔄 em discussão · ✅ já feito

---

## 1. Premissa geral do lançamento

- **Prioridade zero é o agente + plataforma rodando redondo.** Ajuste de design/linguagem/branding não pode travar o lançamento.
- Ajustes subjetivos (pop-up, logo do WhatsApp, desdobramento de cores/redes) vão pro **backlog**, salvo se o cliente sinalizar explicitamente como crítico.
- Precisamos definir com o cliente **o "mínimo do mínimo"** pro lançamento (tanto do site quanto do agente).

---

## 2. Site / Landing page (Lucas + Figma)

- `P1` ⬜ Lucas entrega as telas no **Figma**; TwoBrains implementa em **HTML na plataforma homogênea** (Webflow foi cancelado).
- A **home atual deixa de existir** — será substituída pelo design do Lucas (institucional/corporativa + a de venda).
- Fluxo acordado: Lucas faz o Figma → **valida com o cliente** → passa pra gente → **plugamos o agente dentro** da mesma plataforma (local único, sem duplicidade).
- Cliente pode ajustar usabilidade direto no Figma com o Lucas (ex.: pop-up vs. conversa inline). Na entrega, replicamos a experiência exatamente igual ao protótipo.
- Reunião de acompanhamento do site: **quarta-feira da semana seguinte** (bom o time da TB participar).
- `P2` **Pop-up:** manter como está por ora → backlog. Só mexer se der ruído real de experiência.

---

## 3. Jornada do agente — mudanças no fluxo

### 3.1 Input do valor do bem
- `P1` ✅ Incremento ajustado de 5.000 → **1.000 em 1.000** (já subiu).
- `P1` ⬜ Permitir **valor livre / digitável** (ex.: 122 mil, 1.012.000) — sem depender do slider. Não há integração com grupos nesse ponto, então qualquer valor é válido.
- Observação: os grupos retornam por **ordem de grandeza**, não valor exato — então precisão fina no slider não é essencial (o cara digita e a gente traz o mais próximo).
- `P2` Granularidade por tipo de bem (ex.: moto sensível a valores pequenos; imóvel pode andar de 10/10 ou 50/50). Digitação resolve a dor principal.

### 3.2 Remoção da pergunta de lance no início ⭐
- `P0` ⬜ **Remover a pergunta de "reserva/lance" no começo da jornada** (antes de mostrar os grupos).
  - Motivo (Bernardo): **todo consórcio tem lance** — se não der, vai pro sorteio; se der, aumenta a chance. Perguntar "tem reserva pra lance?" na largada não faz sentido e o cara pode nem saber o que é embutido.
- `P0` ⬜ Novo fluxo: pede o **valor do bem** → **já busca os grupos** → mostra as opções. Só **depois** desenvolve a conversa sobre lance.

### 3.3 Busca na Bevi (com e sem lance embutido)
- `P1` ⬜ Na busca, consultar a Bevi **duas vezes**: **com** lance embutido e **sem** lance embutido (a API exige informar um valor de embutido — tratar como duas "queries").
- **Limitação de dados da Bevi:** o retorno traz `ID da oferta`, `administradora`, `tipo (destaque ou não)`, `código do grupo`, `valor da carta`, `valor da parcela`, `prazo` e `taxa de contemplação (%)`. **Não vem** nenhuma info de lance embutido (valor, percentual ou se a cota permite).
- **Fato confirmado:** existem grupos **sem** lance embutido (visto no Banco do Brasil).
- `P1` **Decisão pragmática:** por ora **assumir que todos podem ter embutido** (~30% utilizável — confirmar o teto real). Se a cota escolhida não permitir, vende-se outra equivalente. Melhor que travar a experiência. **Resolver o caso de borda depois.**

---

## 4. Cards / Recomendação

### 4.1 Primeira lista (sem recomendação)
- `P1` ⬜ Na 1ª lista, mostrar **basicamente todos** os grupos com **mesmo peso** — sem "preferencial", porque ainda não há dado de lance pra recomendar nada.

### 4.2 Card de recomendação
- `P1` ⬜ Adicionar o **logo da administradora** no card (traz confiabilidade e o cara sabe pra onde vai).
- `P1` ⬜ Exibir o **lance médio** no card (hoje falta — info importante).
- `P1` ⬜ **Reordenar** a sequência dos 3 blocos (recomendado / demais cards / simulação-lance estimado) — hoje está confusa. Avaliar consolidar a info do lance **dentro** do próprio card.
- `P0` ⬜ Mostrar **parcela antes e depois da contemplação** (ex.: 6.800 até contemplar → cai pra ~800 depois de dar o lance). **Indispensável.**
- `P0` ⬜ Deixar claro que **usar lance embutido = receber menos dinheiro** da carta.
- Para a opção **com embutido**: destacar a **parcela pós-contemplação** (grande) e a **parcela mensal normal** menorzinha embaixo — foco no que o cara vai pagar quando for contemplado.

### 4.3 Lógica de recomendação "de verdade" (dois estágios) ⭐
- `P1` ⬜ **Estágio 1 — plano padrão:** mostrar a carta exata que ele pediu, **com briefing completo** explicando que ela normalmente **não é a mais atrativa** (ex.: carta de 1M, parcela 6k, mas precisa 800k de lance). Não esconder — mas explicar.
  - Framing sugerido (Bernardo): *"Esse foi o plano que buscamos pra você, alinhado com sua expectativa de contemplação."*
- `P1` ⬜ **Estágio 2 — recomendação personalizada:** aí sim perguntar recurso próprio / lance embutido e montar o cenário que "brilha o olho":
  - Ex.: cara quer 1M, tem 300k e topa embutido → oferecer carta de ~2M, usa 300k próprio + embutido, **saca o 1M que queria agora** e a parcela cai depois da contemplação.
  - Framing: *"Existem os lances pra acelerar sua contemplação (recurso próprio ou embutido). Quer entender melhor? Aí eu busco uma carta maior pra sobrar o valor que você precisa."*
- `P2` ⬜ Permitir que o agente **sugira NÃO fechar** quando o lance for desproporcional (ex.: carro de 300k exigindo 250k de lance) e ofereça outras opções.
- **Nota estratégica:** por definição quase toda cota é "pouco atrativa" crua — o valor do agente é justamente **fazer o papel do vendedor**, cruzando as variáveis do cliente (valor do lance, tipo de lance, dinheiro que sobra, parcela pós-contemplação) e apresentando o melhor encaixe.

---

## 5. Terminologia / Copy

- `P0` ⬜ **Não é "consórcio fechado/contratado" — é RESERVA DE COTA.**
  - Botão "confirmar e contratar" → **"confirmar e reservar"**.
  - Evitar "fechar", "fechado com o Itaú", etc.
- `P0` ⬜ Comunicar: *"Você não paga nada agora — tipo booking. Só quando chegar o boleto na sua casa."*
- Polir todos os termos da jornada com cuidado.

---

## 6. Reserva concluída / trava de reabertura

- ✅ Comportamento correto: depois que a cota foi pra mesa, o agente **bloqueia reabrir a busca dentro daquela mesma contratação**.
- ⬜ Ajustar **wording** pra deixar claro que **é possível iniciar um NOVO consórcio** (outra cota, outro bem) — nova jornada. Não dizer "consórcio fechado".

---

## 7. "Voltar às opções" / scroll dos cards

- 🔄 Hoje os cards ficam **desabilitados** após avançar (força nova busca, pelo argumento da BV de que "muda a cada minuto").
- Direcionamento (Bernardo): reabilitar a possibilidade de **voltar às opções mostradas**; se uma opção não estiver mais disponível, responder de boa: *"Essa opção não está mais disponível."* — em vez de bloquear tudo.
- `P2` ⬜ Reavaliar essa trava.

---

## 8. Proposta final / PDF

- `P1` ⬜ **Não usar o PDF de proposta com marca de terceiro** (Conexa/Bevi) — tira credibilidade, parece terceirização.
- ⬜ Proposta deve ter a **marca AJA AGORA + a marca da administradora escolhida**, sincronizada com a identidade visual (sensação de "mesmo lugar", nada estranho no meio).

---

## 9. Canais WhatsApp × Web (bugs)

- **Arquitetura:** um único agente, dois canais (WhatsApp e Web). Algumas coisas funcionam na Web mas quebram no WhatsApp.
- `P0` ⬜ **Bug de contaminação entre canais:** componente de formulário (que na Web é um form) está sendo **enviado como texto literal no WhatsApp** (ex.: "me manda seu CPF, só os números"). Precisa de **renderização específica por canal**.
- No WhatsApp: pedir **CPF (só números)**; **celular** já é capturado automaticamente do próprio WhatsApp.
- Nota: a versão mostrada era a mais estável pra demo — há bugs recentes a estabilizar.

---

## 10. Número da mesa / Atendente (backoffice) — DECISÃO

- **Problema:** o atendente humano **não pode conversar como comprador no mesmo número** — a IA se perde (roteamento por número único). Se o Bernardo testa como comprador **e** atende no próprio número, quebra.
- `P1` ⬜ **Decisão: comprar um número extra na Meta (~R$30) = "número da mesa"** pro atendente.
  - **Comprador sempre fala com UM número** (número de venda) — **experiência dele não muda**.
  - Internamente: 2 canais → número de venda (agente) + número da mesa (atendente humano/backoffice).
  - É separação **interna de backoffice** apenas.
- O **número de venda** é por onde dispara o envio pra uma pessoa fazer o **contrato/compra da cota** (pedido que o Edu levantou).

---

## 11. Backoffice — agente de apoio ao cadastramento

- ⬜ Existe um **agente de backoffice** que "ensina a fazer o cadastramento" — seria demonstrado, mas o Kairo teve intermitência de conexão.
- **Pendência:** mandar mock/vídeo no grupo **ou** marcar call rápida **segunda de manhã** pra apresentar.

---

## 12. Já implementado ✅

- ✅ **Persistência de conversa:** se o navegador/celular reinicia, o cara **retoma exatamente de onde parou** (estava no backlog técnico, já feito).
- ✅ Incremento do valor do bem de 1.000 em 1.000.

---

## 13. Método de trabalho / Próximos passos

- ⬜ TwoBrains produz **mockup + vídeo** do que foi discutido (experiência do atendente + jornada) e posta **no grupo** pra confirmação **assíncrona** → mais celeridade.
  - **Prazo:** hoje ou, no máximo, **amanhã de manhã** (Romulo + Kairo).
- ⬜ Daqui pra frente, **todo change validado por mock/vídeo no grupo** antes de subir.
- ⬜ Reagendar demo do agente de backoffice (segunda cedo ou via vídeo).

---

## Resumo priorizado (checklist rápido)

**P0 — bloqueia lançamento**
- [ ] Remover pergunta de lance no início; buscar grupos direto após o valor
- [ ] Card: parcela antes/depois da contemplação
- [ ] Card: deixar explícito que embutido = recebe menos
- [ ] Copy: "reserva de cota" (não "contratar/fechar"); botão "confirmar e reservar"; "não paga nada agora, tipo booking"
- [ ] Bug de contaminação form Web → texto no WhatsApp

**P1 — jornada / go-to-market**
- [ ] Valor do bem digitável / livre
- [ ] Busca Bevi com e sem embutido (assumir embutido ~30% por ora)
- [ ] 1ª lista com todos os grupos, mesmo peso, sem preferencial
- [ ] Logo da administradora no card
- [ ] Lance médio no card + reordenar os 3 blocos
- [ ] Recomendação em 2 estágios (padrão explicado → personalizada)
- [ ] Proposta/PDF com marca AJA AGORA + administradora (tirar marca de terceiro)
- [ ] Comprar número da mesa (backoffice) e separar canais
- [ ] Site: Figma do Lucas → validar → implementar

**P2 — backlog**
- [ ] Reavaliar trava de "voltar às opções"
- [ ] Agente sugerir não fechar quando lance for desproporcional
- [ ] Pop-up / desdobramento de branding / granularidade por tipo de bem
