---
title: Convenção `done-report` — relatório de feature concluída pro stakeholder
date: 2026-05-16
status: shipped
project: convenção global TwoBrains (aplicada primeiro no aja-agora)
session_duration: ~30min (criação) — segue Phase 12 Letta na mesma sessão
tags: [processo, documentação, stakeholder-comm, twobrains-global]
---

> **Meta-feature.** Não é feature de produto vendido a usuário final.
> É **convenção organizacional** TwoBrains pra como times comunicam
> entregas a quem patrocina o trabalho. Aplicada primeiro no aja-agora
> como exemplo prático (ver
> [[2026-05-16-2210-aja-agora-phase12-letta-memory.md]] ao lado).

## 1. Pitch

Toda feature concluída na TwoBrains agora termina com um arquivo
`.done/{data}-{titulo}.md` no projeto — escrito em linguagem de
negócio, não de código. **O contratante lê esse arquivo, não o
`git log`.** Vende a entrega, expõe riscos com honestidade, e fica
como memória permanente do produto.

## 2. Problema que resolveu

Times técnicos terminam features e a única "documentação" do que foi
feito vive em `git log`, PR descriptions ou Slack thread. Quem paga a
conta (cliente, dono, gerente) não consegue ler nada disso de forma
útil. O resultado:

- **Stakeholder não percebe valor entregue** — vê só "fechamos 5
  tickets" sem entender a história
- **Onboarding de novo dev é doloroso** — não tem narrativa do que
  o produto virou
- **Retrospectiva fica subjetiva** — cada um lembra de uma coisa
- **Discussão de PRD v2** começa do zero porque não ficou registrado
  o que ficou em aberto na v1

Custo de não fazer: confiança do stakeholder diminui em ciclo longo
("eles passam o dia fazendo o quê?"), e times perdem o lastro
histórico do produto.

## 3. Solução entregue

- **Skill global `done-report`** disponível em qualquer projeto pelo
  Claude Code — gera o arquivo seguindo template fixo
- **Regra no `~/.claude/CLAUDE.md` global** obrigando o uso ao fim de
  toda feature/milestone/fase visível
- **Estrutura de 11 seções obrigatórias** que cobre: pitch, problema,
  capabilities, valor competitivo, arquitetura, qualidade entregue
  (testes/coverage), decisões registradas, riscos, gaps abertos,
  próximos passos, métricas
- **Anti-padrões explícitos**: sem hype, sem números inventados, sem
  esconder gaps em "próximos passos"
- **Aplicação prática imediata** no aja-agora (arquivo Phase 12 Letta
  ao lado) servindo de exemplo vivo

## 4. Por que importa

Esse é o tipo de processo que **diferencia consultoria/desenvolvimento
TwoBrains de "contratei alguém que entregou código"**. Cliente que
recebe um `.done/...md` por entrega tem:
- Histórico narrativo do produto, não só código
- Capacidade de relembrar decisões sem perguntar
- Material pronto pra apresentar a stakeholders dele (head, board)
- Onboarding de novos colaboradores em ordem cronológica

Esperado (a observar ao longo do uso):
- Menos pergunta tipo "lembra quando vocês fizeram aquele negócio
  de…?" — porque vai estar em `.done/`
- Reuniões de status mais curtas (pitch já está escrito)
- Confiança alta em quem mostra riscos e gaps com transparência

## 5. Arquitetura — visão de 1 minuto

```
Toda feature TwoBrains termina assim:
                                                              
   código ───────► commits ──► PR merged                       
   no projeto                                                  
                                                              
        │                                                     
        │   no fim da feature/milestone/fase                  
        ▼                                                     
                                                              
   .done/{data}-{titulo}.md ◄── lê o stakeholder              
        │                                                     
        ▼                                                     
   commit no repo (histórico permanente)                      
        │                                                     
        ▼ (opcional)                                          
   vault Obsidian _log.md (memória pessoal do operador)       
```

Decisão chave: o `.done/` é **commit padrão**, não gitignore. É
memória de produto, viaja com o repo, sobrevive a troca de
colaboradores, e fica acessível pra qualquer pessoa que clone.

Skill é **global** (`~/.claude/skills/done-report/`), não por projeto
— a convenção é da empresa, não do produto. Mas o **arquivo gerado é
do projeto**, na raiz dele.

## 6. Qualidade entregue

Esta é uma feature de processo, então qualidade é medida
diferente — não tem testes automatizados. O que validamos:

- **Skill carrega corretamente** no Claude Code (visível em
  `/done-report` slash command após reload)
- **Regra global no CLAUDE.md** está presente e referencia a skill
  pelo path correto
- **Aplicação prática validada** no primeiro arquivo gerado
  (Phase 12 Letta — ver [[2026-05-16-2210-aja-agora-phase12-letta-memory.md]])
- **Template testado em produção**: o arquivo Phase 12 cobre todas as
  11 seções, expõe 7 gaps abertos honestos (não esconde), e o pitch
  de 2 frases passa o "se o cliente lesse, ele entenderia?"

## 7. Decisões de arquitetura registradas

- `~/.claude/skills/done-report/SKILL.md` — template completo
  obrigatório, regras de filename, anti-padrões, fluxo de uso
- `~/.claude/CLAUDE.md` (seção "Done Report — relatório de feature
  concluída pro stakeholder") — regra global que torna obrigatório

Vault TwoBrains (memória pessoal): atualizado opcionalmente em
`01 - TwoBrains/_log.md` quando aplicado em projeto da empresa.

## 8. Riscos identificados e mitigações

| Risco | Mitigação |
|---|---|
| **Pessoa esquecer de gerar** ao terminar feature | Regra explícita no `~/.claude/CLAUDE.md` global pega isso em qualquer projeto |
| **Arquivos viram cerimônia vazia** (template preenchido só pra cumprir) | Anti-padrões explícitos contra hype/marcar tudo OK/esconder gaps; seção 9 "em aberto" obriga honestidade |
| **Stakeholder não lê porque é técnico demais** | Regras de estilo: 1-2 páginas, português direto, sem jargão, pitch curto na seção 1 — feedback rápido se virar técnico |
| **Inflação de `.done/` em projetos com muita iteração** | Filename com `HHmm` permite múltiplos no mesmo dia; "quando NÃO usar" exclui bug fix pequeno, refactor invisível, hotfix operacional |
| **Convenção sumir se eu trocar de máquina** | Skill vive em `~/.claude/skills/` que está no dotfiles do operador; regra está no CLAUDE.md global |

## 9. O que ainda fica em aberto

- **Adoção em outros projetos TwoBrains ainda não exercitada**:
  FPMA, sparkflow, letdrill, brindel-next, aprendi — nenhum tem
  `.done/` ainda. Próxima feature em cada um deveria gerar
- **Cliente da TwoBrains nunca leu um `.done/`** em produção — não
  sabemos se a estrutura realmente comunica valor pra quem não viu
  o template. Precisa exercitar com cliente real e iterar
- **Sem automação de geração** — depende de o Claude Code ser
  invocado manualmente com `/done-report`. Não há hook que dispare ao
  detectar fim de milestone
- **Sem index/resumo** — projeto com 30 `.done/` arquivos não tem
  ainda visualização agregada. Útil pra retrospectivas seria gerar
  um `INDEX.md` ou dashboard
- **Não tem versão em inglês** — se algum projeto TwoBrains tiver
  stakeholder internacional, template não cobre

## 10. Próximos passos sugeridos

1. Próxima feature concluída em **outro projeto** TwoBrains gerar
   `.done/` — coletar feedback sobre o que precisa ajustar no template
2. Conversar com **1 cliente real** mostrando um `.done/` e perguntar
   o que faltou pra ele
3. Implementar **`done-report-index`** — skill que lê todos os
   `.done/*.md` de um projeto e gera um sumário cronológico em
   `.done/INDEX.md` (atualizado a cada novo done)
4. Avaliar se vale ter **versão em inglês** pra clientes
   internacionais futuros
5. Pensar em **integração com retrospectiva**: agrupar `.done/` por
   mês e usar como input pra retro automática

## 11. Métricas da sessão

- **Arquivos novos**: 3
  - `~/.claude/skills/done-report/SKILL.md` (~190 linhas, template)
  - `~/.claude/CLAUDE.md` (seção nova de ~30 linhas)
  - este `.done/` + o Phase 12 ao lado (exemplo prático)
- **Tempo de criação**: ~30 minutos (após Phase 12 Letta concluída)
- **Skill reload**: validado via `/reload-plugins` (3 plugins, 14
  skills incluindo `done-report`)
- **Pode ser revertido?** Sim — deletar `~/.claude/skills/done-report/`
  e remover seção do CLAUDE.md. Zero acoplamento.
- **Custo de manter**: ~5 min ao fim de cada feature significativa
  pra gerar o arquivo. Em troca de memória de produto permanente.
- **Risco evitado documentado**: stakeholder TwoBrains nunca mais
  pergunta "o que vocês fizeram esse mês?" sem ter material pronto
  pra responder.
