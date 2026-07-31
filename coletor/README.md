# Coletor SGF → Supabase

Workflow n8n que sincroniza Trier SGF → Supabase, rodando na VPS/EasyPanel
que vocês já operam (decisão registrada na conversa: reaproveitar infra
existente em vez de criar uma nova — Supabase Edge Function/Cloudflare
Worker foram descartados por esse motivo).

## O que tem aqui

- `sgf-incremental.n8n.json` — o workflow (importar no n8n)
- `migracao_coletor.sql` — SQL que precisa rodar no Supabase **antes** da
  primeira execução do workflow
- `testar_workflow.js` — script Node standalone que roda os Code nodes do
  workflow com dados falsos e imprime o SQL gerado, pra revisar depois de
  qualquer edição (`node coletor/testar_workflow.js`)

## Passo a passo

### 1. Rodar a migração

No SQL Editor do projeto Supabase real (`ggzuchqfepjbsyadfcnk`), cole e
rode `migracao_coletor.sql`. Ela só adiciona uma constraint que faltava
em `venda_itens` (necessária pro upsert não duplicar item a cada sync) —
não mexe em dado existente.

### 2. Criar as credenciais no n8n

**a) `SGF Trier - Bearer`** (tipo *Header Auth*):
- Header name: `Authorization`
- Header value: `Bearer <token que a Trier liberou>`

O token não vai em nenhum arquivo deste repositório — só nesse cofre de
credenciais do n8n. Se quiser referência de onde ele está documentado
temporariamente, veja `.env.local` na raiz do projeto (git-ignorado).

**b) `Supabase Postgres`** (tipo *Postgres*):
- **Não use a conexão direta** (`db.<project-ref>.supabase.co`) — ela só
  tem endereço IPv6, e boa parte de VPS não tem saída IPv6 configurada
  (foi exatamente o que aconteceu testando este workflow: `ENETUNREACH`
  no IPv6 da conexão direta). Use o **Session Pooler**: Supabase →
  Settings → Database → seção "Connection Pooling" → modo **Session**
  → copie o Host de lá (formato `aws-<N>-<região>.pooler.supabase.com`,
  o `<N>` varia por projeto) e a porta (**5432** no modo Session).
- Database: `postgres`
- User: **`postgres.<project-ref>`** (não é só `postgres` — o pooler
  atende vários projetos no mesmo host/porta e usa o user pra saber qual
  banco rotear; sem o sufixo dá erro `no tenant identifier provided`)
- **Não use o Transaction Pooler** (porta 6543): o workflow manda várias
  instruções SQL separadas por `;` numa chamada só (o `INSERT` e o
  `UPDATE` do cursor juntos), e o modo transaction do PgBouncer/Supavisor
  não lida bem com isso — é pensado pra muitas conexões curtas
  (serverless), não pra esse padrão.
- Cuidado com espaço em branco colado sem querer no campo Database
  (`"postgres "` com espaço no fim já causou `database "postgres " does
  not exist` ao testar isso).

### 3. Importar o workflow

n8n → Workflows → Import from File → `sgf-incremental.n8n.json`.

Cada entidade tem 3 nós em sequência: **Postgres** (lê o cursor) →
**HTTP Request** (chama a API SGF, autenticado via credencial Header
Auth) → **Code** (monta o SQL de upsert a partir da resposta) →
**Postgres** (executa). Depois de importar, abra os nós de Postgres e
de HTTP Request e confirme que reconheceram as credenciais pelo nome —
se não, selecione manualmente as que você criou no passo 2.

> Versão anterior deste workflow tentava chamar a API de dentro do
> próprio `Code` node via `this.helpers.httpRequestWithAuthentication` —
> **não funciona em toda instalação de n8n** (erro: "function ... is not
> supported in the Code Node"). Por isso a chamada HTTP virou um nó
> nativo separado; o `Code` node só processa a resposta.

### 4. Primeira execução (carga histórica)

Como o cursor em `sync_control` começa em `2000-01-01`, a primeira
execução do workflow (`Execute Workflow` manual, ou deixe o Schedule
Trigger disparar) já traz **todo o histórico** via `obter-alterados`
com essa janela larga — funciona como uma carga inicial, sem precisar de
um workflow separado de `obter-todos`.

**Atenção — risco real, não só teórico**: não implementei paginação de
verdade. Cada chamada pede até 999 registros — limite da própria API
(valores maiores retornam 400 "não pode ser superior a 999") — e
`primeiroRegistro` fica **fixo em `0`**, nunca incrementa. Isso significa
que se uma janela tiver mais de 999 registros alterados, o workflow
sempre pede a mesma "página 0", e mesmo assim o cursor avança pra
`dataFinal` (= "agora") no fim do ciclo. Diferente do que uma versão
anterior desta nota dizia, os registros que ficaram de fora da página
**podem ser perdidos de vez**: uma vez que o cursor passa da janela de
tempo onde aquele registro "vivia" (pela API filtrar por data de
alteração), ele não aparece mais em nenhuma busca futura. Como a
farmácia tem histórico desde 2016, é bem provável que a carga inicial
via este workflow incremental não tenha coberto tudo antes do cursor
"fechar a porta" pra trás — ver plano de backfill abaixo.

### 5. Ativar

Depois de testar manualmente uma vez e conferir os dados no Supabase,
ative o workflow (Schedule Trigger a cada 15 min).

## Escopo desta primeira versão

Sincroniza: **vendedor, cliente, venda + itens, atendimentos diários por
vendedor**. Deliberadamente **fora** desta versão: `produto_catalogo`,
`fornecedores`, `compras` (usados por Campanhas/Cartazetes/Compras/
Precificação, hoje ainda mockados no app) — mesmo escopo original
documentado no `README.md` da raiz. Posso estender pra essas entidades
depois, o padrão é o mesmo (ler cursor → buscar alterados → upsert).

## Formato de data exigido pela Trier

A API rejeita ISO com `Z`/milissegundos (`2000-01-01T03:00:00.000Z`) com erro
`Erro na conversao da data de inicio`. Ela espera
`YYYY-MM-DDTHH:mm:ss-0300` (offset sem dois-pontos, sem `Z`, sem ms). Por
isso os nós "Ler cursor - X" não devolvem mais só `last_cursor` cru — eles
já formatam `data_inicial`/`data_final` nesse formato via `to_char(...) ||
'-0300'` direto no Postgres (offset fixo porque o Brasil não tem mais
horário de verão desde 2019). Os nós "Buscar ... (API)" consomem
`$json.data_inicial`/`$json.data_final` em vez de `$json.last_cursor`/
`$now.toISO()`.

## FKs entre venda e cliente/vendedor

Os 4 fluxos (vendedor, cliente, atendimentos, venda) rodam em paralelo a
partir do Schedule Trigger — não há garantia de que o cliente/vendedor já
esteja sincronizado quando a venda que o referencia chega (pode nem
aparecer ainda no `obter-alterados` se não mudou recentemente). Pra não
violar a FK (`vendas_codigo_cliente_fkey` / `vendas_codigo_vendedor_fkey`
/ `venda_itens_codigo_vendedor_fkey`), os nós **"Mapear vendas"** e
**"Preparar itens e cursor"** inserem um registro-esqueleto (`INSERT ...
ON CONFLICT (codigo) DO NOTHING`, só com o código e, no caso de
vendedor, um nome placeholder `'(pendente sincronizacao)'` já que
`vendedores.nome` é `NOT NULL`) antes do INSERT principal, pra cada
código de cliente/vendedor referenciado no lote. Quando o sync real
desse cliente/vendedor rodar (mesmo ciclo ou um futuro), o upsert dele
sobrescreve o esqueleto com os dados de verdade.

## Backfill histórico único (`backfill_periodo.js`)

Implementado em 30/07/2026 — **não** como workflow n8n (plano original,
ver histórico abaixo), e sim como script Node standalone, porque o
pedido mudou de "rotina recorrente" pra "importação de um período fixo,
uma única vez" — nesse caso um loop de paginação em JS puro é mais
simples de escrever certo (e de testar) do que montar o mesmo loop com
nós de n8n.

**O que faz, diferente do `sgf-incremental.n8n.json`:**
- **Paginação de verdade**: incrementa `primeiroRegistro` em passos de
  999 até a API devolver menos que isso — testado com mock simulando
  2038 registros em 3 páginas, acumulou certo.
- Cobre **7 entidades**, não só as 4 do incremental: vendedor, cliente,
  venda+itens, atendimentos (mesmo mapeamento de campos do
  `sgf-incremental.n8n.json`, só trocando interpolação de string por
  parâmetros `$1,$2,...`) **e também produto (`produto_catalogo`),
  fornecedor e compra+itens**, que o incremental de 15 min
  deliberadamente não cobre (ver "Escopo desta primeira versão" acima).
- **Não mexe em `sync_control`** — é um script à parte, o incremental
  de 15 min continua com o próprio cursor, sem interferência.
- Produto/fornecedor: sem filtro de data (`obter-todos`) — é sempre "o
  catálogo atual", não faz sentido pedir "produtos alterados entre X e
  Y" pra um cadastro que pode não ter mudado há anos mas continua
  vendendo. Venda/atendimentos/compra: filtrados pelo período
  (`obter-alterados` com `dataInicial`/`dataFinal`).
- **`compras`/`compras_itens` não são idempotentes** — essas duas
  tabelas não tinham nenhuma constraint única (ficaram vazias até
  agora), então o script faz `INSERT` direto. Rodar o script duas vezes
  duplica as compras do período; se precisar rodar de novo, `TRUNCATE
  compras, compras_itens` antes (cai em cascata via FK). As outras 5
  entidades usam `ON CONFLICT` e são seguras de rodar mais de uma vez.

### Como rodar

```bash
cd coletor
npm install
TRIER_TOKEN="<mesmo Bearer da credencial 'SGF Trier - Bearer' no n8n>" \
DATABASE_URL="<connection string do Session Pooler do Supabase, porta 5432>" \
node backfill_periodo.js
```

Por padrão pega `01/01/2026` até agora e roda as 7 entidades. Pra
retomar depois de uma falha parcial sem repetir tudo, use
`ENTIDADES="produto,fornecedor,compra"` (lista separada por vírgula,
mesmos nomes usados no log de saída). Ver comentário no topo do arquivo
pra todas as variáveis de ambiente aceitas.

<details>
<summary>Plano original (n8n, descartado em favor do script acima)</summary>

Ideia inicial, antes de saber que era importação única: workflow n8n
separado do incremental, com loop de paginação via nó Code + IF,
resetando `sync_control.last_cursor` pra `2026-01-01` antes de rodar
(os upserts com `ON CONFLICT` tornariam isso seguro — reprocessar
período já sincronizado não duplicaria nada) e atualizando o cursor pra
"agora" ao terminar cada entidade, pra o incremental de 15 min continuar
dali sem buraco. Rodar de madrugada, pra não competir com o incremental
nem com o uso normal do sistema. Superado pelo script Node porque, sendo
execução única, não precisa da infraestrutura de agendamento/cursor do
n8n — só precisa rodar uma vez e terminar.
</details>

## Desempenho das tabelas com histórico completo

Motivo da pergunta: depois do backfill acima, as tabelas `vendas` e
`venda_itens` vão ter todo o histórico desde 2016, não só o que já foi
sincronizado. Conclusão (30/07/2026, sem mudança de código necessária):

- Os índices que importam já existem em `supabase/schema.sql`:
  `idx_vendas_data_emissao`, `idx_vendas_vendedor`, `idx_vendas_cliente`
  em `vendas`; `idx_itens_venda`, `idx_itens_vendedor`, `idx_itens_produto`
  em `venda_itens`. Pra uma farmácia, mesmo com histórico desde 2016,
  isso fica na casa de alguns milhões de linhas — tamanho "médio" pra
  Postgres, não é volume que preocupa com os índices certos.
- As views analíticas (`vw_metricas_vendedor_diario`,
  `vw_ranking_vendedores_dia` etc.) são views normais (não
  materializadas) com `GROUP BY`/`JOIN` sobre `vendas`+`venda_itens`
  inteiras. Ficam rápidas **desde que quem consulta sempre filtre por
  data** (o Dashboard/Metas do app já fazem isso) — o Postgres empurra
  esse filtro pra dentro do índice de data. Uma consulta sem filtro de
  data (tipo "total desde sempre") varreria tudo — isso é sobre como a
  query é escrita, não algo que precisa mudar no banco agora.
- Recomendação pra depois do backfill (não antes): rodar `ANALYZE` nas
  tabelas afetadas, pra o planejador de consultas atualizar as
  estatísticas com o volume novo em vez de esperar o autovacuum passar
  sozinho.

## Coisas que valem revisão futura

- **[RESOLVIDO 31/07/2026] Vendas duplicadas quando `ser_nota_fiscal` é
  nula**: `ON CONFLICT (numero_nota, cod_filial, ser_nota_fiscal)` nunca
  "batia" nesse caso (Postgres trata todo `NULL` como distinto de
  qualquer outro `NULL`), então cada reprocessamento duplicava a venda
  inteira em vez de atualizar — encontrado em produção comparando com
  relatório real da Trier (394 notas no nosso banco vs 148 no relatório
  "Vendas por Vendedor" do mesmo dia; 3.242 vendas duplicadas
  confirmadas). Corrigido em `sgf-incremental.n8n.json` (nós "Mapear
  vendas" e "Preparar itens e cursor") e em `backfill_periodo.js`: nota
  sem série usa `ON CONFLICT (numero_nota, cod_filial)` contra um índice
  parcial novo (`migracao_coletor.sql`, item 4); item sem
  `num_sequencial` passa a usar a posição no array como substituto
  determinístico, em vez de deixar `NULL` (mesma classe de bug, evitada
  na origem em vez de precisar de outro índice). **Rodar
  `migracao_coletor.sql` item 4 no projeto real antes de reativar o
  incremental ou rodar `backfill_periodo.js` de novo** — a limpeza de
  duplicata que já existe tem que rodar antes do índice.
- **[RESOLVIDO 31/07/2026] Duas falhas achadas rodando o fix acima em
  produção**:
  1. A primeira versão do `ON CONFLICT` sem série em
     `backfill_periodo.js` esqueceu o `WHERE ser_nota_fiscal IS NULL`
     na cláusula — pra um índice **parcial**, o Postgres só infere o
     índice se o mesmo `WHERE` aparecer literalmente no `ON CONFLICT`,
     senão dá "no unique or exclusion constraint matching". O
     `sgf-incremental.n8n.json` já tinha isso certo desde o início;
     só o script standalone tinha o bug.
  2. Rodar vendas uma a uma (~31 mil round-trips individuais) derrubou
     a conexão no meio ("Connection terminated unexpectedly") — sessão
     longa demais. `backfill_periodo.js` agora processa vendas em
     lotes de 200 (bem mais rápido, muito menos exposto) e reconecta
     automaticamente (até 3 tentativas) se a conexão cair no meio do
     processo.
- **Margem/comissão/desconto vindo `NULL`**: comparando uma nota real
  com o relatório da Trier, `vlr_custo_produto`/`prc_comissao`/
  `vlr_desconto` vieram `NULL` em `venda_itens` mesmo com
  `valor_total_bruto`/`valor_total_liquido` populados certos (nomes de
  campo já conferidos contra `docs/api-sgf-openapi.json`, batem). Ainda
  **não confirmado** se é a API que não devolve esses campos pra esse
  token/escopo, ou se o dado realmente não existe cadastrado na Trier
  pra esses itens — precisa abrir uma nota específica na Trier e ver se
  o campo aparece preenchido lá também.
- **`venda_com_desconto`**: a API manda um valor numérico, a coluna no
  banco é `boolean`. O workflow faz um mapeamento provisório (ver
  `migracao_coletor.sql`, item 2) — perde a informação do valor real.
- **Produto `24766` (taxa de entrega)**: entra em `venda_itens` como um
  item qualquer. As views analíticas (`vw_metricas_vendedor_diario` etc.)
  ainda não sabem que esse código é especial — isso vai inflar
  itens-por-atendimento e pode distorcer margem em vendas com entrega.
  Não tratei isso no coletor de propósito (é decisão de camada
  analítica, não de ingestão) — precisa de ajuste nas views quando forem
  revisadas com dado real.
- **Sem paginação real no incremental de 15 min** (`sgf-incremental.n8n.json`
  continua fixo em página 0 — ver seção 4 acima). `backfill_periodo.js`
  já tem paginação real, mas é script à parte, não o coletor recorrente.
