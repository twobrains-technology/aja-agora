# Jornada de vendas de consórcio — matador pra prod (rodada 9)

**Data:** 2026-07-12 · **Selo:** Fable 10/10 (MATADOR PRA PROD: SIM) no modelo de produção (claude-sonnet-5) · **Deploy:** develop → main

## O que foi entregue

O agente de vendas de consórcio agora conduz a jornada do cliente de ponta a ponta em **nível de produção comprovado** — não por auto-elogio, mas por um juiz independente (Fable) que percorreu 5 conversas reais ao vivo e validou contra uma rubrica de 6 dimensões, com a suíte de testes 100% verde por baixo.

O cliente entra, escolhe o bem (imóvel/automóvel/moto), recebe uma **carta recomendada ancorada no que ele realmente pediu**, vê o comparativo com outras administradoras, simula contemplação, e fecha com uma **proposta REAL criada na Bevi** — tudo sem beco-sem-saída, sem número inventado e sem promessa que o produto não cumpre.

## O valor de negócio

- **Confiança comercial blindada.** O agente parou de "arredondar a verdade": quando a carta diverge do valor pedido, ele **diz honestamente** (não jura "é o mesmo valor"); quando o cliente pergunta direto "é 120k como pedi?", ele **responde** em vez de enrolar; e nunca afirma ter recebido um documento que não recebeu. Isso é o que separa um vendedor em que o cliente confia de um que ele desconfia.
- **Compliance no ponto do compromisso.** Terminologia correta ("**reserva de cota**", nunca "consórcio fechado/contratado" — exigência da Ata), taxa de contemplação nunca exposta como %, dois-caminhos sem % de chance de sorteio, aviso de divergência de valor propagado **até o card do fechamento** (onde a assinatura acontece).
- **Nenhuma tela morta no momento crítico.** O reveal (a hora que o cliente vê a oferta) agora é **emitido pelo servidor de forma determinística** — a carta recomendada E o comparativo aparecem sempre, juntos, sem depender de o modelo "lembrar" de chamá-los. Antes, um deles podia sumir.
- **Degrada com elegância.** Se a integração externa (Bevi) engasga, o agente avisa o cliente com clareza e se recupera — em vez de seguir roteirizado com dados vazios até quebrar no fechamento.

## Qualidade entregue

- **Verificação independente em loop:** 4 ondas de correção + 1 onda cirúrgica, cada uma validada por um juiz Sonnet ao vivo; o selo final foi de um agente **Fable** independente, com contexto zerado, no **modelo de produção**. Trajetória da nota: 3 → 4 → 4 → 4 → **8 → 10/10** (o salto final veio de atacar a raiz, não os sintomas).
- **15 correções reais** (FIX-277 a FIX-295) — todas ancoradas na jornada canônica e na Ata, nenhuma cosmética.
- **Suíte verde:** 3335 testes unitários + 312 de integração, **zero falha** — incluindo testes de regressão novos que pinam cada correção (o selo só saiu depois de a integração ficar verde; a barra "não deploya HEAD com suíte vermelha" foi respeitada).
- **Lição-mãe aplicada:** invariante crítico vira **código server-side determinístico**, não regra-no-prompt. Foi isso que finalmente moveu a nota.

## Riscos tratados

- Falsa exatidão de valor (CDC art. 30/37) · terminologia de compliance · carta do reveal sumindo · fabricação de estado (documentos/busca) · justificativa inventada · degradação silenciosa da Bevi.

## Gaps honestos (não-bloqueantes, próxima onda)

- **Latência do reveal ~60s** — é fricção real, mas **é da Bevi** (app DigitalOcean com cold-start, third-party). Mitigado por um chip de progresso que evolui ("Buscando... consultando administradoras... quase lá"). Cortar de verdade exige **paralelizar as chamadas Bevi — PENDENTE de confirmação com a AGX** (a Bevi é stateful; não dá pra fazer às cegas).
- **G-R1..G-R6** — acabamento de UX/copy (pergunta redundante no reveal, entrega determinística do "ver mais opções") que o Fable classificou como polish, não bloqueio.

## Nota operacional

A validação intermediária das ondas 3-4 rodou no **OpenAI gpt-4.1** (por sua escolha, com a key salesbox), mas o **selo final e o deploy são no claude-sonnet-5** (o modelo de prod) — a nota reflete produção. O OpenAI-direto foi um patch reversível, já revertido.
