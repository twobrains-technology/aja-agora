# Roteiro de QA — Aja Agora (dono de produto)

> Oráculo do QA manual crítico da jornada. Método na skill global `qa-dono-produto`;
> o fluxo de negócio específico do Aja Agora mora aqui. Fonte de verdade do
> comportamento esperado = `docs/jornada/jornada-canonica.md` (REGRA). Este roteiro
> traduz a jornada canônica em passos verificáveis + registra não-bugs conhecidos.
> Criado em 2026-07-02 na 1ª rodada de QA da jornada de SERVIÇOS (web).

## Ambiente & acesso

- **Produção:** `https://ajaagora.com.br` — dirija o browser aqui (não subir local pra QA de prod).
- **Admin:** `https://ajaagora.com.br/admin/login`.
- **Contas de teste (NUNCA inventar CPF):** `secrets.sh decrypt contas-teste` → usar `CONTA2` (Mirella,
  CPF 037.802.511-24, celular (62) 99464-1111). **Apagar `contas-teste.env` ao fim.**
- **Bevi/Conexia = HOMOLOGAÇÃO:** fechar proposta é seguro e esperado. NÃO travar por "falta de sandbox".
- **DB de produção:** exige VPN (MCP `postgres-prod` dá timeout sem ela). Não subir VPN no host por padrão;
  ancorar evidência pela tela + PDF gerado quando o DB não estiver acessível.
- **Gate de merge do projeto:** `pnpm test:unit` (NÃO typecheck — dívida na develop). Bug de agent exige
  regressão nas 3 camadas (structural + cassette + eval) — ver CLAUDE.md do projeto.

## Canais

- **Web:** chat na landing (`ajaagora.com.br`) — este roteiro cobre o canal WEB.
- **WhatsApp:** canal paralelo; QA de WhatsApp roda em DEV/local, não em prod (memória `project_aja_simulador_404_prod`).

## Segmentos / tipos de bem

- Landing expõe botões **Imóvel / Carro / Moto** apenas. **Serviços NÃO tem botão na landing** — mas o chat
  aceita objetivo de serviço via texto livre e há **persona dedicada (Camila · Especialista em serviços)**.
  Serviços cobre: viagens, estudos, reformas pequenas, cirurgias (ver PDF Conexia). Ver MELHORIA aberta abaixo.

## Passos da jornada (canônica) × critérios de aceite verificados na rodada de serviços

### Passo 1 — Entender a necessidade
- Usuário digita objetivo no hero (ex.: "Quero uma viagem de R$ 25 mil, ~R$ 500/mês") → chat abre.
- ✅ Persona entra por segmento ("Camila entrou na conversa · Especialista em serviços").
- ✅ Pergunta o nome ("como posso te chamar?") → confirma.

### Passo 2 — Entender o cliente
- ✅ "Você já fez consórcio antes?" → botões [É a primeira vez / Já conheço / Tenho dúvidas].
- ✅ "É a primeira vez" → educação de consórcio adaptada ao objetivo (sem jargão), botão "Entendi, pode continuar".
- ✅ **Gate de identidade (CPF antecipado)** logo após a experiência: CPF + celular + consentimento LGPD
  ("Autorizo a consulta… Não é compromisso de contratação") → "Buscar minhas ofertas". CPF antecipado = decisão vigente.
- ✅ **Lance:** "Você teria reserva pra dar lance?" [Sim / Talvez / Por enquanto não].
- ✅ **Valor do lance** (era "ausente no código" na canônica — hoje IMPLEMENTADO): faixas adaptadas ao objetivo.
- ✅ **Educação de lance embutido** (FIX-4): aparece após escolher o valor; texto correto; pergunta se quer considerar.

### Passo 3 — Buscar alternativas
- ✅ "Encontramos 3 opções pra você" — busca real Bevi (dados reais, não mock).

### Passo 4 — Avaliar, simular e definir
- ✅ **Recomendação em destaque** primeiro (card ÂNCORA: parcela, valor do bem, prazo, tipo de grupo=Serviços,
  badge "Boa compatibilidade").
- ✅ "Por que esta recomendação?" → score breakdown (Orçamento / Contemplação / Prazo em %).
- ✅ **Outras opções** (listbox de cotas: ÂNCORA / TRADIÇÃO / RODOBENS) — dados reais.
- ✅ **Simulador** (oferecido) interativo com slider de meses; recalcula chance/lance/valor; usa o lance declarado;
  cenário "sem lance (sorteio)" em prazos longos. Tudo sinalizado "estimativa, não garantia" (CDC ok).
- ✅ Cenário com lance + lance embutido, IPCA sinalizado como estimativa.
- ✅ **Card de decisão** (após intenção de contratar): "Esse plano faz sentido para você?" com os 3 botões
  canônicos [Sim, quero contratar agora / Quero ver outras opções / Quero falar com um especialista].

### Passo 5 — Contratar
- ✅ Reusa CPF/celular já dados (não faz repetir) + aceite de termos LGPD de contratação → "Continuar com segurança".
- ✅ **Carta "confirmada com a administradora"** (valor, parcela, prazo, grupo, lance médio do grupo, administradora)
  + aviso honesto quando o lance do usuário fica abaixo do lance médio do grupo.
- ✅ "Confirmar e contratar" → **proposta gerada** ("Sua proposta está pronta") + reforço de consultoria
  ("ANCORA escolhida pela Aja Agora… segue até a contemplação") + upload opcional RG/CNH + frase canônica
  "Parabéns! Agora você está oficialmente mais perto da sua conquista!".
- ✅ **"Ver minha proposta"** → baixa o **PDF real da Conexia** (`<id>_consortium.pdf`) com dados do cliente,
  segmento, valor, parcela, taxa adm (35%), comparativo consórcio×financiamento, jornada e ressalvas legais.
- ⚠️ Assinatura digital self-service NÃO embutida (DES-1): o link entrega o PDF da proposta; assinatura/efetivação
  é etapa posterior da mesa. Esperado (não-bug).

### Passo 6/7 — Concluir / Pós-venda
- Não exercido nesta rodada (fora do escopo "do sonho à proposta").

## Não-bugs conhecidos (decisões vigentes — não tratar como defeito)

- **CPF antecipado** (antes de buscar ofertas) — decisão de produto vigente.
- **Card de recomendação enxuto** (sem taxa adm/contemplados na tela) — retorno Bevi real é enxuto
  (memória `project_aja_tela_recomendacao_dados_reais`). Taxa adm e comparativo aparecem no PDF.
- **Card antigo selado/não-clicável** após surgir um card mais novo (ex.: "Tenho interesse" do card de
  recomendação fica disabled quando o simulador vira o card ativo) — padrão de card-histórico.
- **Assinatura digital não self-service** (DES-1) — proposta = PDF; efetivação é da mesa/back office.
- **Serviços sem botão na landing** — decisão de layout atual; chat aceita via texto livre (ver MELHORIA).

## Defeitos abertos (rodada 2026-07-02, serviços web) — inbox

1. `servicos-simulacao-infla-valor-credito` (ALTA) — simulação usa nominal do grupo (R$ 36k / R$ 554,83, regra
   Bv2-08) enquanto card/carta/PDF usam valor pedido (R$ 25k / R$ 385,30); texto da simulação contradiz o PDF oficial.
2. `servicos-copy-quebrada-separador-milhar` (MÉDIA) — "R$ 25.000,00" partido em 2 parágrafos no ponto de milhar.
3. `servicos-agente-pede-dado-que-ja-tem` (MÉDIA) — no card de decisão o agente pede à cliente a parcela/prazo
   que ele mesmo mostrou (perda de estado da oferta).
4. `servicos-simulador-apos-receber-nao-recalcula` (BAIXA) — "Após receber — menor, depois do lance" idêntico e
   legenda persiste em cenário de sorteio.
5. `servicos-deadend-pos-whatsapp` (BAIXA) — após capturar WhatsApp, não retoma a intenção de contratar; exige nudge.

## Melhorias propostas (produto/UX — Kairo decide)

- **Expor "Serviços" na landing** (botão + placeholder de exemplo), já que há persona e produto real de serviços.
- **Prazo longo para serviço curto:** viagem de R$ 25 mil veio com 97 meses (~8 anos). Considerar sugerir/priorizar
  prazos mais curtos para segmento serviços, ou explicar por que o prazo é longo.
- **Trazer taxa adm e comparativo com financiamento pra conversa** (hoje só no PDF) — a canônica pede o comparativo
  no fluxo; hoje é degradação (só no documento).
