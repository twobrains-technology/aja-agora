---
id: FIX-59
titulo: "Lote de ajustes de copy da landing (comentários gerais do stakeholder)"
status: todo
bloco: bloco-c-landing-copy-ui
arquivos:
  - src/components/landing/hero.tsx
  - src/components/landing/trust.tsx
  - src/components/landing/process.tsx
  - src/components/landing/demo.tsx
  - src/components/landing/institutional.tsx
  - src/components/landing/brand-footer.tsx
  - src/components/landing/copy.test.ts
rodada: 2026-06-19 — jornada2_revisão.docx (comentários gerais Bernardo)
---

# FIX-59 — Ajustes de copy da landing

## Palavras do operador (docx — "Comentários Gerais")
> - Excluir "sem cadastro"
> - Trocar "o mercado inteiro" por "as melhores administradoras"
> - Trocar "Acompanhamos…" por "Nosso compromisso é achar o melhor plano para você. E não o que paga mais comissão ou mais taxa de administração"
> - Trocar "Seguimos juntos" por "Preservamos sua privacidade. Até pedimos seu CPF, mas só pq as administradoras requisitam pra passar as informações dos planos. Mas é só pra isso"
> - Excluir "Consórcio Bevi · Grupo 1042"
> - Em quem somos, incluir "A gente viu que nem todo mundo entende as regras de consórcio direito. E resolvemos tomar uma atitude"
> - Trocar "Estratégica" por "Alinhada" ou "Convergente"
> - Em quem somos, será que colocamos algo do tipo "fomos executivos de grandes empresas, e resolvemos empreender…". Algo anônimo, mas contando a história

## Mapa exato (arquivo:linha — Explore) e correção
| # | Trecho atual | Arquivo:linha | Ação |
|---|---|---|---|
| 1 | "Sem cadastro. Sem compromisso." | `hero.tsx:215` | **Excluir** "Sem cadastro." (manter "Sem compromisso." se fizer sentido) |
| 2 | "…Comparamos o mercado inteiro pra você." | `trust.tsx:9` | Trocar "o mercado inteiro" → "as melhores administradoras" |
| 3 | "Acompanhamos a vida do seu plano — do primeiro 'oi' até a conquista." | `trust.tsx:19` | Trocar pelo texto novo: "Nosso compromisso é achar o melhor plano para você. E não o que paga mais comissão ou mais taxa de administração" |
| 4 | "Seguimos juntos" (título do passo 3) | `process.tsx:38` | Trocar por: "Preservamos sua privacidade. Até pedimos seu CPF, mas só pq as administradoras requisitam pra passar as informações dos planos. Mas é só pra isso" (ajustar título+corpo do step à mensagem — título curto + corpo com o texto, conforme estrutura do PROCESS_STEPS) |
| 5 | "Consórcio Bevi · Grupo 1042" | `demo.tsx:92` | **Excluir** o `<span>` |
| 6 | Seção "Quem somos" (#sobre) | `institutional.tsx` | Incluir as 2 frases novas: "A gente viu que nem todo mundo entende as regras de consórcio direito. E resolvemos tomar uma atitude" + uma frase de história anônima "fomos executivos de grandes empresas, e resolvemos empreender…" |
| 7 | "Estratégica" (valor 03) | `institutional.tsx:17` | Trocar por "Alinhada" ou "Convergente" (escolher 1 — "Alinhada" recomendado; ajustar o body do valor se mencionar "estratégia") |
| 8 | "…Transparente, estratégica e do seu lado." | `brand-footer.tsx:37` | Trocar "estratégica" coerente com o #7 |

## Notas para o executor
- Copy está **hardcoded** em arrays nos componentes (PILLARS, PROCESS_STEPS, VALUES) — não há i18n central.
- Existe `src/components/landing/copy.test.ts` (regressão de copy: proíbe overclaim de IA, ancora termos educativos). **Rodar e ajustar** esse teste para refletir os novos textos sem quebrar as regras existentes.
- Manter tom da marca; o texto novo do #3 e #4 reposiciona para independência e privacidade (não mexer no sentido pedido).

## Regressão exigida
- **Camada 1:** atualizar/expandir `copy.test.ts` — assertar ausência de "sem cadastro", "mercado inteiro", "Consórcio Bevi · Grupo 1042", "Estratégica"; presença dos textos novos-chave (privacidade/CPF, "melhor plano… não o que paga mais comissão"). Bug de copy puro → Camada 1 cobre; sem cassette de agente.
