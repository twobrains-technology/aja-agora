---
data: 2026-06-19
bloco: bloco-c-landing-copy-ui
escopo: FIX-59 (lote de copy da landing) + FIX-60 (figura do hero + ícone WhatsApp)
autor: executor do bloco (decisão autônoma — operador autorizou no _prompt.md passo 2)
---

# ADR — Decisões de design do Bloco C (copy + identidade visual da landing)

Origem: "Comentários Gerais" da revisão 2 da jornada (`jornada2_revisão.docx`,
stakeholder Bernardo). A maior parte de FIX-59 é troca direta de copy (sem
decisão de design). Os pontos abaixo tiveram julgamento real — tomados com o
raciocínio da skill `brainstorming` (explorar contexto, levantar opções, pesar
trade-offs, YAGNI), mas o executor é o decisor: sem perguntas, best practice +
design system + regras de produto do repo.

---

## Decisão 1 (FIX-59 #4) — Onde re-ancorar `lance`/`assembleia`/`contemplação`

**Conflito real detectado.** O stakeholder pediu trocar o passo 3 do Process
("Seguimos juntos" → mensagem de privacidade/CPF). Esse passo era o único lugar
da landing que carregava as keywords educativas `assembleia`, `lance` e
`contemplação`. Mas duas regressões existentes exigem que TODAS as keywords
educativas continuem ancoradas na landing:

- `src/components/landing/copy.test.ts` → `BENEFIT_KEYWORDS` (landing-wide).
- `src/components/landing/process.test.tsx` → keywords dentro de `PROCESS_STEPS`.

Reescrever o passo 3 pra privacidade **sem mais nada** quebraria as duas (e a
regra de produto "termos educativos ancorados").

**Opções consideradas:**
- (a) Aceitar a quebra e relaxar os testes. ❌ Viola a regra inviolável de não
  afrouxar regressão pra "fechar".
- (b) Re-ancorar as 3 keywords no passo 1 ("Você conta o sonho"). ❌ Antinatural:
  o passo 1 é sobre intenção/orçamento, não sobre acompanhamento de grupo.
- (c) **Re-ancorar no passo 2 ("Nós comparamos").** ✅ Natural: comparar
  administradoras *inclui* comparar histórico de **assembleias**, de
  **contemplação** e a hora certa de dar um **lance**. O passo 2 já dizia
  "histórico de cada **grupo**" — só estendi a mesma frase.

**Escolhida: (c).** O passo 2 passa a comparar "taxa, prazo, histórico de
assembleias e de contemplação de cada grupo, e a hora certa de dar um lance".
Mantém as 5 keywords de `process.test.tsx` (sem juros + parcela no passo 1;
lance + assembleia + contemplação + grupo no passo 2) e as 6 de `copy.test.ts`.
O passo 3 fica 100% dedicado à mensagem de privacidade pedida pelo Bernardo.

**Efeito colateral assumido:** o ícone do passo 3 deixa de ser `Heart`
(acompanhamento) e vira `ShieldCheck` (privacidade) — coerência semântica.
`process.test.tsx` tinha `titles[2]).toMatch(/juntos|seguimos/i)`; atualizei
pra `/privacidade/i` (o título novo é "Preservamos sua privacidade").

---

## Decisão 2 (FIX-59 #7) — "Estratégica" → "Alinhada" (não "Convergente")

O docx ofereceu "Alinhada" OU "Convergente". **Escolhida: "Alinhada".**

- "Alinhada" comunica direto o reposicionamento do lote: estamos do lado do
  cliente (independência, sem comissão escondida). Casa com a nova pílula
  "Nosso compromisso é achar o melhor plano… não o que paga mais comissão"
  (FIX-59 #3) e com o footer.
- "Convergente" é mais abstrato/corporativo e abre interpretação (convergente
  com o quê?). Menos legível pro público de massa (constraint mobile-first/B2C).

O body do valor 03 foi reescrito de "Comparamos o mercado e miramos o plano
certo…" (ecoa o overclaim "mercado inteiro" que o #2 está removendo) para
"Trabalhamos alinhados ao seu interesse — miramos o plano certo pro seu
momento, não a maior comissão." O footer (#8) acompanha: "Transparente,
**alinhada** e do seu lado."

---

## Decisão 3 (FIX-59 #6) — "Quem somos": história anônima

O docx pediu incluir "A gente viu que nem todo mundo entende as regras de
consórcio direito. E resolvemos tomar uma atitude" + algo anônimo do tipo
"fomos executivos de grandes empresas, e resolvemos empreender".

**Decisão:** um parágrafo novo no bloco de prosa do `institutional.tsx`,
mantendo o tom da marca (caloroso, sem jargão) e **anônimo** (zero nomes
próprios). Texto: "A gente viu de perto que nem todo mundo entende as regras de
consórcio direito — e resolveu tomar uma atitude. Viemos de grandes empresas,
onde aprendemos como esse mercado funciona por dentro, e decidimos empreender
pra colocar esse conhecimento do seu lado." Cobre as duas frases pedidas sem
soar como depoimento assinado.

---

## Decisão 4 (FIX-60 #1) — Figura do hero "mais brasileira"

**Contexto:** `public/brand/hero-scene.png` (1672×941) é uma stock corporativa
genérica — executiva de blazer azul com laptop conversando com um homem (nuca).
Visual "internacional", sem leitura de identidade brasileira (cenário, traços,
luz). O Bernardo pediu "figura mais brasileira".

**O que "mais brasileira" significa, operacionalmente** (sem cair em
estereótipo): pessoas com **diversidade fenotípica do Brasil** (tons de pele
variados, traços miscigenados), ambiente com **luz quente/natural** em vez do
cinza-escritório-corporativo, vestuário acessível (não terno executivo formal),
e o mesmo enquadramento centro-direita pra não quebrar a máscara do componente
(`object-cover`, fade horizontal). A cena permanece "consultora conversando com
cliente" — é o que a marca vende (consultoria de gente pra gente).

**Decisão de processo:** a escolha visual final é do Kairo/Bernardo. O executor
gera UMA candidata (GPT Image via `open-design-gen`) salva em `public/brand/` e
aponta o hero pra ela **marcando explicitamente como PROPOSTA** no `.done/`. Se
a geração não estiver disponível no ambiente (BYOK OpenAI), o hero **continua
apontando pro asset existente** (build/`next/image` não pode quebrar — é a
regressão exigida) e a troca visual fica registrada como pendência no `.done/`.
Em nenhum cenário o build fica apontando pra asset inexistente.

---

## Decisão 5 (FIX-60 #2) — Interpretação de "Ícone o WA móvel"

O feedback é ambíguo. Duas leituras possíveis:
- (a) **Usar o logo oficial do WhatsApp** no lugar do `MessageSquare` genérico
  (lucide) no artifact `whatsapp-optin.tsx`, com boa aparência no mobile.
- (b) Adicionar um acesso ao WhatsApp visível no mobile da landing (FAB/nav).

**Escolhida: (a).** Razões:
- A Explore confirmou que **não existe FAB/atalho de WhatsApp na landing** — o
  WhatsApp só aparece no artifact do chat (`whatsapp-optin.tsx:83`), e ali com
  ícone **genérico** (`MessageSquare`), que não comunica "WhatsApp". O feedback
  "ícone do WA" lê muito mais como "esse ícone devia ser o do WhatsApp" do que
  como "crie um canal novo de WhatsApp na home".
- (b) seria criar superfície/feature nova (FAB de contato) sem o canal de
  WhatsApp estar habilitado como entrada da landing — YAGNI, e fora do escopo
  "ajuste de copy/identidade visual" do bloco. Se o Bernardo quiser o FAB, vira
  item próprio.

**Implementação:** lucide-react não traz o logo de marca do WhatsApp (logos
proprietários foram removidos do lucide). Criei um componente de ícone
dedicado `src/components/icons/whatsapp-glyph.tsx` com o glyph oficial do
WhatsApp (bolha + telefone, path SVG de marca, `fill="currentColor"`),
renderizado na **cor de marca do WhatsApp `#25D366`** pra ser reconhecível.
`data-testid="whatsapp-icon"` pro teste de regressão (Camada 2 — componente).
Tamanho mantido em `size-[17px]` (legível no mobile; o artifact já renderiza em
contexto mobile-first). "móvel" = garantir boa leitura no mobile, validada.
