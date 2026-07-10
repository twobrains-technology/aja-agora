---
id: FIX-264
titulo: "resolveOfferByMention elege UM valueMatch e desiste por 'conflito nome×valor' (negação)"
status: done
bloco: bloco-r6-mencao-polish
arquivos: [src/lib/agent/orchestrator/choose-offer.ts, src/lib/agent/orchestrator/choose-offer.test.ts]
rodada: 2026-07-10 rodada 6 (Fable r5, resolver de menção v2)
---
## Gap (veredito r5)
"RODOBENS de 90 mil" → `resolveOfferByMention` elege UM valueMatch (a ÂNCORA de mesmos 90k) e desiste
por "conflito nome×valor" → negação. Menção com nome+valor da tabela deveria sempre resolver.
## Correção
- valueMatch como CONJUNTO (não um só); casar nome E valor juntos; menção negada ("não a X") tratada.
  Sempre que nome/valor casa um grupo EXIBIDO, resolve determinístico (nunca desistir/negar).
## Regressão (TDD)
- "RODOBENS de 90 mil" com RODOBENS 90k exibida → resolve o groupId certo (não desiste).
- nome+valor ambíguos → desambigua pela combinação, não nega.

## Implementado (2026-07-10, rodada 6)

- `matchValueMentions`: por menção monetária, casa o CONJUNTO empatado no menor diff (≤10%)
  contra as cotas exibidas — não mais o "melhor" global único (bug raiz: quando 2 grupos
  exibidos empatavam no mesmo crédito, o `<` estrito elegia o 1º encontrado na ordem do array,
  não necessariamente o grupo nomeado).
- `resolveOfferByMention`: nome único resolve se seu PRÓPRIO valor está no conjunto de valores
  mencionados — não precisa ser o único elemento do conjunto. Isso resolve "RODOBENS de 90 mil"
  mesmo quando outro grupo exibido (ex. SICREDI) empata nos mesmos 90k.
- `extractNegatedAdministradoras` (novo): descarta administradoras mencionadas dentro de uma
  cláusula com gatilho de negação explícito (`pra lá`, `de lado`, `esquece(a)`, `cancela(e)`,
  `não quero`) ANTES de calcular nameMatches. Cuidado deliberado pra não confundir com uso
  afirmativo de "deixa" — "Deixa a RODOBENS que você recomendou" (sem gatilho) continua
  resolvendo normalmente (regressão FIX-252 coberta em teste).
- Nome×valor genuinamente contraditórios (valor de OUTRO grupo, sem empate) continuam null —
  não inventa (Lei 3).
- Testes novos em `choose-offer.test.ts` (describe "FIX-264"): RED confirmado antes do fix
  (3 falhas), GREEN depois. `pnpm test:unit` verde no container (336 arquivos / 3163 testes).
