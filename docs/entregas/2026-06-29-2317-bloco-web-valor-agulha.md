---
titulo: "Agulha simples de valor na web — entrada conversacional"
data: 2026-06-29
status: needs-validation
projeto: aja-agora · branch: feat/web-valor-agulha-simples
jornadas_afetadas: [jornada-canonica]
tags: [chat-ui, jornada-entrada, value-picker]
---
# Agulha simples de valor na web (FIX-107)

## 1. Pitch
Trocamos o seletor de valor cheio de alavancas (três réguas que se moviam juntas:
valor, parcela e prazo) por uma **única agulha simples** — o cliente só desliza
"quanto custa o que eu quero", de R$ 1.000 em R$ 1.000. Menos engrenagem na cara,
mais conversa.

## 2. Problema que resolveu
A entrada da web fazia o cliente operar um painel de três réguas interligadas que
recalculavam parcela e prazo ao vivo. Isso transformava um momento simples ("quero
um carro de uns 80 mil") em um exercício de planilha — exatamente o oposto da
proposta AI-first do Aja Agora, onde o cliente conversa em vez de preencher
controles. Além disso, a parcela estimada ali era um número de mercado, não a oferta
real — gerava expectativa antes de a Bevi entrar.

## 3. Solução entregue
- **Uma régua só**, do valor do bem, andando de R$ 1.000 em R$ 1.000.
- Quem quer ser exato digita o valor cheio (ex.: R$ 347.500) no campo ao lado, sem
  "pular" pro múltiplo mais próximo.
- Some a estimativa de parcela na entrada: a parcela passa a vir das **ofertas reais
  da Bevi**, não de um cálculo de mercado.
- Prazo sai da entrada (decisão da revisão da jornada) — menos pergunta, mais fluxo.

## 4. Por que importa
Consórcio é produto de massa, acessado majoritariamente por celular. Cada régua a
menos é menos atrito num momento decisivo do funil. A agulha simples cabe melhor na
tela do celular e conversa com a promessa central: o cliente diz o que quer e o
agente conduz — não o contrário.

## 5. Arquitetura — visão de 1 minuto
- O componente `ValuePicker` foi reduzido a uma agulha única do valor do bem
  (shadcn `Slider`, `step` de R$ 1.000) com input numérico livre ao lado.
- A inteligência de réguas interligadas (estimar parcela/prazo) saiu do componente.
- O caminho legado do seletor (`gate-renderer`, `kind: "slider"`) passou a mandar o
  valor por **texto** no chat (coerente com "valor por conversa"), sem inventar
  parcela.
- Nada de backend/agent foi alterado neste bloco. Onde o contrato com o agente muda
  (ele deixa de oferecer o seletor antigo e coleta o valor conversando), ficaram
  marcadores `TODO(bloco-jornada-entrada)` para o bloco que cuida dessa parte.

## 6. Qualidade entregue
- `pnpm test:unit` (Camadas 1 + 2 da política de regressão): **189 arquivos, 1.980
  testes, 0 falhas** (rodado em container com Postgres migrado).
- Teste novo de componente cobre: uma régua só, passo de R$ 1.000, valor emitido no
  submit, ausência de estimativa de parcela e de campos extras do payload legado.
- Lint (Biome) e checagem de tipos limpos nos arquivos tocados.

## 7. Decisões registradas
- Spec da revisão: `docs/specs/2026-06-28-jornada-entrada-simulador-conversacional-design.md`.
- Card do fix: `docs/correcoes/done/fix-107-agulha-simples-valor-web.md`.

## 8. Riscos e tratamento
- **Componente legado de réguas interligadas (FIX-16):** seu teste foi removido porque
  o comportamento foi descontinuado por decisão de produto. A engine de cálculo
  (`src/lib/consorcio/value-picker-link.ts`) ficou sem uso em runtime, mas o teste
  unitário dela segue verde — limpeza fica para o bloco-jornada-entrada (fora do
  escopo deste bloco, território de backend).

## 9. Gaps honestos
- A agulha simples ainda não é o componente que aparece por padrão na entrada — hoje a
  entrada mostra o gate "Planeje sua conquista" (`plan-estimate-picker`). Trocar isso
  (remover prazo/intenção da entrada) depende do **bloco-jornada-entrada**, que altera
  o contrato `credit` consumido pelo backend. Este bloco entrega o componente pronto e
  os pontos de troca marcados.

## 10. Próximos passos
- Integração na base pela orquestradora da onda (merge-wave).
- Bloco-jornada-entrada: fazer o agente coletar valor por conversa e plugar a agulha
  simples como apoio onde antes vinha o seletor complexo; remover o código morto da
  engine de réguas interligadas.

## 11. Métricas da sessão
- Arquivos de produção tocados: 2 (`value-picker.tsx`, `gate-renderer.tsx`).
- Testes: +1 arquivo novo (`value-picker.fix-107.test.tsx`), −1 removido
  (`value-picker.linked.test.tsx`).
- Commit único `test+feat:` (TDD: teste falhou antes, passou depois).
