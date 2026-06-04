# Jornada Canônica — Aja Agora (fonte: jornada.docx do cliente)

> **REGRA, não referência.** Este documento é a visão do cliente de como a jornada DEVE ser
> (diretiva do Kairo, 2026-06-04: *"considerar a jornada como regra de como o cliente quer"*).
> Toda divergência entre código e este fluxo é defeito do código, não interpretação.
> Original versionado em [`jornada.docx`](./jornada.docx). Contexto e decisões em [`CONTEXT.md`](./CONTEXT.md).

---

## 1. Entender a necessidade

- "O que vc deseja conquistar?" — **Botões: Imóvel, carro ou moto?**
- "Como posso te chamar?"
- "Perfeito, precisamos fazer mais algumas perguntinhas para buscar o melhor consórcio para um **[carro/imóvel/moto] de cerca de X**."

## 2. Entender o cliente

- "Você já participou de um consórcio antes?"
  - **Se não** → explicação rápida: consórcio = juntar com outras pessoas pra comprar um bem **sem juros**, parcelas mensais, contemplação por **sorteio ou lance**. Diferente de financiamento: lá você paga juros e recebe o crédito na hora; aqui paga só a **taxa de administração** (bem menor) e espera ser contemplado. "Nosso papel na Aja Agora é encontrar o grupo com maior chance de atender seu objetivo no prazo que você deseja."
  - Botão: **"Entendi, pode continuar"**
- "Qual o valor aproximado do bem que você quer conquistar?" (**range/slider**)
- "Em quanto tempo você gostaria de estar com seu bem?"
  - Opções: **O mais rápido possível · Até 6 meses · 1 ano · 2 anos+ · Sem pressa, quero menor parcela** (adaptar pelo tipo de consórcio)
- "Você pretende dar um lance para antecipar sua contemplação?" — **Sim / Não / Talvez**
  - **Se "sim"** → "Qual valor aproximado?" *(coleta do VALOR do lance — hoje ausente no código)*
  - Educação de **lance embutido**: "Você sabe o que é lance embutido? Fique tranquilo, a gente te ajuda! O lance embutido permite usar parte da própria carta de crédito como lance — ex.: numa carta de R$ 100 mil, você pode usar parte desse valor pra aumentar suas chances. Ajuda quem não possui todo o valor do lance hoje."
  - "Agora que você já sabe o que é, quer considerar esse tipo de lance nas suas simulações?"
- "Com essas informações, a Aja Agora vai analisar várias administradoras e selecionar as opções mais aderentes ao seu perfil e objetivo."

## 3. Buscar alternativas

- "Encontramos **3 boas opções** para o seu perfil. Agora vamos te recomendar a mais adequada."

## 4. Avaliar, simular e definir com o cliente

- Mostrar **PRIMEIRO** "Plano recomendado pela Aja Agora" (**destaque**).
- Permitir ver **"Outras opções"** (as outras 2) pra comparação simples.
- Resumo por opção: valor da carta · parcela aproximada · prazo total · tipo de grupo · lance/lance embutido · benefícios específicos (histórico de contemplações, reputação da administradora, qtde de contemplados/mês).
- **Simulador** (oferecer): "Se quiser, temos o nosso simulador para ver como ficariam as suas parcelas, caso seja contemplado em **3, 6 ou 12 meses**, que tal?"
  - "Se você for contemplado em 3 meses, suas parcelas ficariam assim…" Em 6? Em 12?
  - Mostrar variação **com/sem lance** e **com lance embutido**.
- **Fluxo de caixa** (oferecer): "Se preferir, posso montar um **fluxo de caixa mês a mês**: valor total, parcelas ao longo de todos os meses, taxa de administração, lance/lance embutido, **comparativo com financiamento**. O que acha?"
- **Card de decisão**: "Esse plano faz sentido para você?"
  - "Sim, quero contratar agora" · "Quero ver outras opções" · "Quero falar com um especialista da Aja Agora"

## 5. Contratar

- Coleta de dados pessoais básicos.
- Upload ou captura de documentos.
- Encaminhamento pro fluxo de **assinatura digital da administradora escolhida** (sem o cliente sentir que "mudou de empresa"). ⚠️ **Desvio de entendimento (DES-1, ver CONTEXT.md):** a API de Parceiro não entrega assinatura digital self-service aqui — o `consortiumProposalLink` é o **PDF da proposta**; a **assinatura/efetivação é etapa posterior da mesa** (back office). Hoje o fechamento entrega a proposta pronta + coleta de documentos; assinatura embutida depende de negociação com a Bevi.
- Sempre reforçar: "Você está contratando um consórcio da **administradora X, escolhida pela Aja Agora** para o seu perfil." · "A Aja Agora **segue com você até a contemplação** e depois dela."
- **Mandar por WhatsApp/e-mail o resumo da contratação.**
- "Parabéns! Agora você está oficialmente mais perto da sua conquista!"

## 6. Concluir

## 7. Pós-venda

- Comunicados automáticos: confirmação de participação no grupo · lembretes de assembleias e oportunidades de lance · acompanhamento ("Próxima assembleia dia X; quer receber sugestão de lance?" · "Você está próximo da faixa histórica de contemplação." · "Vale aumentar seu lance em 5%.").
- Pós-contemplação: celebração ("Parabéns, você conquistou seu [bem] com a Aja Agora!") + convite gentil pra avaliação e indicação.
- *(Ideia em aberto no docx: dash de acompanhamento — posição no grupo, evolução, contemplações recentes, melhor lance vencedor, projeção futura.)*

---

**Lema:** *"Seu objetivo primeiro. O melhor consórcio depois."*
