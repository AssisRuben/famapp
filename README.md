# Projeto: Dashboard/App de Analytics para Farmácia (Trier SGF)

## Visão geral

App mobile (Android/iOS) para vendedores e gestores da farmácia, com foco em:
performance diária de vendedores, estratégia de vendas e gestão de clientes.
(Gestão de compra e estoque ficam de fora do escopo inicial — foco definido pelo usuário.)

Fonte de dados: API SGF da Trier Sistemas (sistema de gestão da farmácia).
Consumo dos dados pelo app: NUNCA direto da API da farmácia. O app consome
exclusivamente do Supabase, que atua como camada intermediária.

## Por que essa arquitetura (não pular etapas)

A API SGF roda ON-PREMISE, dentro do computador/servidor da própria farmácia
(porta local, ex.: 4647), não é um serviço na nuvem da Trier. Isso impõe
restrições que definem toda a arquitetura abaixo:

- Não existe webhook genérico para dados de negócio (venda, cliente, estoque,
  financeiro). O único webhook existente é do parceiro AgileGO, só para status
  de entrega. Logo, a sincronização é sempre por polling, usando os endpoints
  `obter-todos` (carga completa, 1x) e `obter-alterados` (incremental, com
  filtro `dataInicial`/`dataFinal` em ISO 8601).
- Autenticação via Bearer Token (JWT), fornecido pela Trier após processo de
  homologação (contato: parcerias@grupotrier.com.br).
- Usar sempre a versão LTS da API (rotulada "ESTÁVEL — em produção"), nunca a
  DEV (endpoints em evolução, podem quebrar sem aviso).
- Existem duas APIs distintas no portal de documentação: SGF (a que usamos —
  dados de gestão) e PDV (emissão de nota/venda em tempo real no ponto de
  venda — fora do nosso escopo).
- Acesso externo à API só é possível através de algo rodando DENTRO da rede
  local da farmácia. Decisão tomada: usar um túnel de saída (Cloudflare Tunnel
  ou Tailscale) instalado num computador já existente na rede da farmácia, em
  vez de abrir porta no roteador (opção insegura/frágil que a doc da Trier
  cita, mas que descartamos).
- O token Bearer da API da farmácia NUNCA deve ficar no app mobile (risco de
  engenharia reversa). Ele só existe no lado do servidor/coletor.

## Arquitetura definida

Componentes:

1. **Túnel** — agente leve (cloudflared ou tailscale) instalado em um
   computador já ligado na rede local da farmácia. Não expõe porta pública.
2. **Coletor** — automação agendada (n8n, Pipedream, ou função serverless)
   que chama `obter-todos` (setup inicial) e depois `obter-alterados`
   periodicamente pelos endpoints da API SGF LTS, usando o token Bearer.
   Guarda controle de "última sincronização bem-sucedida" para não perder
   registros no incremental.
3. **Supabase** — banco (Postgres) + Auth + API. Recebe os dados brutos do
   coletor, aplica transformação para tabelas prontas para o app (ex.: ticket
   médio por vendedor/dia, ranking, histórico de cliente). Faz autenticação
   dos usuários do app (vendedor/gerente) e controla permissões.
4. **App mobile** — React Native + Expo (multiplataforma Android/iOS).
   Consome só o Supabase (REST/GraphQL + Auth), nunca a API da farmácia
   diretamente. Pode começar a ser desenvolvido AGORA com dados mockados no
   mesmo formato dos schemas reais (abaixo), trocando depois pela integração
   real com Supabase sem redesenhar telas.

## Status atual / pendências

- [ ] Acesso à API SGF (token Bearer) ainda não liberado pela Trier —
      processo de solicitação em andamento.
- [ ] Confirmar com a Trier: rate limits, limite de paginação, volume
      histórico disponível, canal oficial de suporte.
- [ ] Confirmar com a farmácia (não com a Trier): autorização para instalar
      o agente de túnel num computador da rede local.
- [ ] Escolher entre Cloudflare Tunnel vs Tailscale para o túnel (ainda em
      aberto).
- [x] Criar conta Supabase.
- [x] Definir schema inicial das tabelas no Supabase — ver
      [`supabase/schema.sql`](supabase/schema.sql).
- [x] Aplicar RLS (Row Level Security) e políticas por papel — ver
      [`supabase/rls_policies.sql`](supabase/rls_policies.sql).
- [ ] Criar os usuários reais no Supabase Auth e preencher a tabela
      `profiles` (vínculo `auth.users` ↔ `codigo_vendedor` ↔ `role`) para
      cada vendedor/gestor da farmácia — ver
      [`supabase/seed_profiles.sql`](supabase/seed_profiles.sql).
- [x] Popular dados de teste (2 vendedores, ~150 clientes, ~350 vendas,
      produtos com promoção/receita, metas do mês) — ver
      [`supabase/seed_data.sql`](supabase/seed_data.sql).
- [ ] Configurar bucket do Supabase Storage para as fotos de receita
      (`venda_item_receitas.foto_url` só guarda a referência) — SQL pronto
      em [`supabase/storage_setup.sql`](supabase/storage_setup.sql), falta
      rodar no projeto real.
- [ ] Criar tabela real pro checklist diário de atividades (hoje só existe
      como mock local no app) — SQL pronto (`atividades_checklist` +
      `checklist_respostas` em `schema.sql`/`rls_policies.sql`), falta
      aplicar no projeto real.
- [ ] Aplicar no projeto Supabase real as tabelas/views novas de comissão
      (`faixas_comissao`, `vw_metas_comissao`) e o fix de RLS do ranking
      (ver "Comissão sobre margem bruta" abaixo) — SQL já está em
      `schema.sql`/`rls_policies.sql`, falta rodar.

O desenvolvimento do app PODE COMEÇAR JÁ, em paralelo à liberação da API,
usando mocks no formato exato dos DTOs reais abaixo.

## Schemas reais da API SGF (campos confirmados via openapi.json, LTS)

Endpoints relevantes ao escopo (venda, cliente, gestão de vendedores):

- `GET /integracao/venda/obter-todos-v1` / `obter-alterados-v1` / `obter-v1`
- `GET /integracao/venda/obter-atendimentos-diario-vendedor-v1`
- `GET /integracao/venda/cancelamento/obter-*-v1`
- `GET /integracao/cliente/obter-todos-v1` / `obter-alterados-v1` / `obter-v1`
- `GET /integracao/vendedor/obter-todos-v1` / `obter-alterados-v1` / `obter-v1`

Campos principais (DTOs):

**VendaIntegracaoDto**: numeroNota, numeroNotaOrigem, tipoCancelamento,
dataEmissao, horaEmissao, codigoVendedor, codigoCliente, entrega,
pagamentoNaEntrega, condicaoPagamento, vlrTroco, numeroCupomFiscal,
numeroNotaFiscal, itens[], xmlNfe, codParceiro, codFilial, vendaIfood,
vendaEcommerce, codEcommerce, serNotaFiscal, modeloVenda, dadosEntrega.

**VendaItemIntegracaoDto** (dentro de `itens`): codigoProduto,
codigoVendedor, quantidadeProdutos, valorTotalBruto, valorTotalLiquido,
valorTotalCusto, parceiro, codigoMedico, codBarras, numSequencial,
prcComissao, vlrDesconto, vlrUnitario, vlrCustoAquisicao, vlrCustoProduto,
idVenda, tabelaDesconto, prcDesconto, prcDescontoMax, vendaComDesconto.

**VendasVendedorIntegracaoDto** (atendimentos diário): dataEmissao,
codigoVendedor, quantidadeItens, quantidadeAtendimentos.

**VendedorIntegracaoDto**: codigo, nome, numeroCpf, cep, email, ativo.

**ClienteIntegracaoDto**: (checar schema completo ao iniciar dev — ainda não
detalhado em profundidade nesta primeira rodada de análise).

## Schema do Supabase

Definido em [`supabase/schema.sql`](supabase/schema.sql). Estrutura:

- **Tabelas cruas** (espelham os DTOs da API SGF, escritas só pelo coletor):
  `vendedores`, `clientes`, `vendas`, `venda_itens`, `vendas_vendedor_diario`.
- **`produtos`**: curadoria MANUAL da farmácia (promoção / exige receita) —
  a API SGF não expõe catálogo de produtos no escopo integrado, então isso
  não vem do coletor. `codigo` é o mesmo `codigoProduto` de `venda_itens`,
  mas sem foreign key formal (só uma fração pequena e curada dos produtos
  vendidos entra aqui).
- **`venda_item_receitas`**: única tabela de negócio escrita pelo próprio
  app (não pelo coletor) — registra que o vendedor fotografou/anexou a
  receita de um item vendido que exige. A foto em si vai para um bucket do
  Supabase Storage (ainda não configurado); aqui só fica a referência.
- **`metas`**: cadastrada pelo gestor na aba "Metas" do app (não vem da
  API). Mensal + 4 buckets semanais fixos (1–7, 8–14, 15–21, 22–fim do
  mês) por vendedor — `semana` null é a meta do mês inteiro, 1–4 são os
  buckets. Dois índices únicos parciais (um só pra `semana is null`, outro
  só pra `semana is not null`) porque unique constraint comum não bloqueia
  NULLs duplicados.
- **`produto_catalogo`**: catálogo completo (nome, custo, estoque,
  categoria, marca), futuramente sincronizado do `ProdutoIntegracaoDto`
  real da Trier (`/integracao/produto/obter-*`) — diferente de `produtos`
  (curadoria manual pequena, só promoção/receita). Usado pelo módulo de
  Campanhas/Cartazetes pra calcular margem.
- **`campanhas`** / **`campanha_produtos`**: promoção avulsa decidida pela
  farmácia (margem + estoque + venda recente), fora do encarte oficial.
  **Não é sincronizado do Trier** — a API SGF não tem NENHUM endpoint de
  escrita pra desconto/campanha/encarte (confirmado: dos 100 endpoints do
  OpenAPI, só 3 são de escrita, nenhum nessa área — tudo é
  `obter-todos`/`obter-alterados`/`obter-movimentados`, só leitura). Quem
  decide o encarte oficial é a rede, digitado direto no Trier; o que esse
  módulo resolve é a decisão que a farmácia não faz em lugar nenhum hoje.
  O preço só vale no caixa depois que o `.txt` gerado na tela "Cartazetes"
  é importado manualmente no Trier — ver
  [`docs/txt.txt`](docs/txt.txt) (arquivo de referência real) e
  `src/lib/trierTxt.ts` no app. **Atenção**: o layout desse `.txt` foi
  inferido por engenharia reversa do arquivo de exemplo (batendo campo a
  campo com o `.txt` original — testado e idêntico), não por documentação
  oficial da Trier; os campos 3 e 4 (sempre `"0","0"` no exemplo) têm
  significado incerto. Valide com um import de teste em homologação antes
  de usar em produção.
- **`fornecedores`** / **`compras`** / **`compras_itens`**: espelham
  `FornecedorIntegracaoDto` e `CompraIntegracaoDto`/`ComprasItemIntegracaoDto`
  da Trier (só leitura, igual venda/cliente). Alimentam a aba "Compras"
  (lista de compras / "Dose Certa" no Trier): fornecedor sugerido e fator
  de compra (conversão de embalagem) de cada produto são **inferidos** da
  compra mais recente via `vw_produto_fornecedor_recente`, não cadastrados
  à parte — a API não expõe um "fornecedor preferido por produto".
  **Prazo de entrega e data da última cotação (que existem na tela do Dose
  Certa dentro do Trier) não têm endpoint de leitura na integração** —
  não aparecem no app porque não dá pra trazer isso sem inventar dado.
- **`sync_control`**: controle de última sincronização por entidade, usado
  pelo coletor para saber o `dataInicial` da próxima chamada
  `obter-alterados`.
- **Views analíticas** (o app consome estas, nunca as tabelas cruas):
  `vw_desempenho_vendedor_diario`, `vw_metricas_vendedor_diario` (ticket
  médio, desconto, comissão, custo total e margem bruta = faturamento
  líquido − custo de aquisição, usando `venda_itens.vlr_custo_produto`
  — confirmado com a farmácia; os outros dois campos de custo da tabela,
  `valor_total_custo` e `vlr_custo_aquisicao`, NÃO são esse),
  `vw_ranking_vendedores_dia`,
  `vw_vendas_por_canal`, `vw_clientes_inatividade` (com `telefone` e o
  vendedor da última compra — vendedor só vê os próprios clientes,
  gestor vê todos; **definida em `rls_policies.sql`, não em
  `schema.sql`**, porque depende da tabela `profiles`), `vw_vendas_receita_status`
  (fila de receita pendente/anexada), `vw_produtos_promocao_clientes`
  (produtos em promoção + clientes que já compraram, para a tela de
  Alertas) e
  `vw_metas_progresso` (meta x realizado, com o realizado calculado na
  hora a partir de `vendas`/`venda_itens` reais — testado e confere:
  soma dos 4 buckets semanais bate exatamente com o total mensal) e
  `vw_produto_fornecedor_recente` (fornecedor + fator de compra da compra
  mais recente de cada produto, usada pela lista de compras).

Nota sobre o checklist diário de atividades (aba "Checklist" do vendedor,
configurada pelo gestor dentro da própria aba "Metas"): por enquanto só
existe no app (mock local via AsyncStorage), sem tabela real no Supabase
ainda — é o próximo passo natural se quiser o histórico de conclusão
disponível no backend.

Schema aplicado no projeto Supabase em uso (`ggzuchqfepjbsyadfcnk`). Esse
projeto já hospedava outra aplicação (CRM/mensageria WhatsApp); as tabelas
antigas foram removidas pelo usuário, preservando apenas `conteúdo`
(sem relação com o farmapp, não mexer).

Testado de ponta a ponta (schema + RLS + seed, incluindo enforcement de RLS
simulando sessões `vendedor`/`gestor`) num Postgres 16 descartável antes de
aplicar no projeto real.

Políticas de RLS aplicadas — ver [`supabase/rls_policies.sql`](supabase/rls_policies.sql):

- Nova tabela `profiles` (`id` -> `auth.users`, `codigo_vendedor`,
  `role`: `vendedor`|`gestor`) — vínculo entre login do Supabase Auth e o
  vendedor, criado manualmente por processo administrativo (sem
  self-signup).
- Gestor lê tudo; vendedor só lê os próprios dados (`vendedores`, `vendas`,
  `venda_itens`, `vendas_vendedor_diario`); `clientes` é lida por qualquer
  usuário autenticado.
- Nas tabelas de negócio vindas da API, só policies de `select` — escrita
  continua restrita ao coletor via `service_role`.
- `produtos`: leitura por qualquer autenticado; escrita (insert/update/
  delete) só por `gestor` (curadoria).
- `venda_item_receitas`: única tabela com policies de `insert`/`update` para
  `authenticated` — vendedor só mexe nos itens que ele mesmo vendeu, gestor
  em tudo (testado explicitamente: insert em item de outro vendedor é
  bloqueado pela RLS).
- `metas`: vendedor só lê as próprias; só `gestor` insere/atualiza/deleta
  (testado explicitamente: insert de meta pra outro vendedor é bloqueado).
- `sync_control`: leitura liberada pra qualquer autenticado (usada pelo
  Dashboard pra mostrar "dados sincronizados em..."); escrita continua
  exclusiva do coletor via `service_role` — nenhuma policy de insert/
  update/delete para `authenticated` (testado: insert é bloqueado).
- `produto_catalogo`: leitura por qualquer autenticado, mesmo padrão
  synced-pelo-coletor de `vendedores`/`clientes`/`vendas` (sem policy de
  escrita pra `authenticated`).
- `fornecedores`/`compras`/`compras_itens`: mesmo padrão de
  `produto_catalogo` — leitura por qualquer autenticado, escrita exclusiva
  do coletor via `service_role`.
- `campanhas`/`campanha_produtos`: só `gestor` (leitura e escrita) —
  vendedor não vê nem edita (testado: vendedor lê 0 campanhas mesmo
  havendo 1 no banco, e um insert como vendedor é bloqueado).
- Views recriadas com `security_invoker = true`, senão rodariam com o
  privilégio do dono e ignorariam a RLS das tabelas base — **exceto**
  `vw_produtos_promocao_clientes` (tela de Alertas precisa que qualquer
  vendedor veja oportunidades de contato de qualquer cliente) e
  `vw_clientes_inatividade` (senão a RLS de `vendas` restringiria a
  subquery da última compra ANTES do filtro de papel rodar, fazendo um
  vendedor "roubar" a última compra de um cliente atendido por outro —
  testado: vendedor vê só os clientes cuja última compra foi com ele,
  com a data certa; cliente sem vendedor associado não aparece pra
  nenhum vendedor, só pro gestor).

Gap corrigido nesta rodada: `vw_ranking_vendedores_dia` estava com
`security_invoker = true`, o que faria um vendedor real ver só a própria
linha do ranking (sempre em 1º, sozinho) — diferente da tela "Ranking" do
app, que mostra todo mundo de propósito (gamificação). Recebeu o mesmo
tratamento de `vw_produtos_promocao_clientes` (roda sem RLS, de propósito
— ver comentário na view em `schema.sql`).

## Comissão sobre margem bruta

Régua de comissão por percentual da meta MENSAL atingido (semana e dia
NÃO geram comissão própria — só o fechamento do mês):

| % da meta atingido | Comissão sobre a margem bruta |
|---|---|
| 100% | 10% |
| 90% | 8% |
| 80% | 7% |
| 70% | 5% |
| abaixo de 70% | 3% |

Decisões tomadas (não reabrir sem motivo — ver histórico da conversa que
definiu isto):

- **Granularidade**: só mensal. Metas semanal/diária continuam existindo
  só como indicador de ritmo pro vendedor/gestor, sem comissão associada.
- **Meta diária**: continua SEM tabela própria — é sempre a meta mensal
  dividida pelos dias do mês (`metaDiaria()` em `src/lib/metas.ts`),
  calculada na hora, nunca persistida. Evita um terceiro nível de
  cadastro que poderia dessincronizar do mensal.
- **Faixas configuráveis**: viram tabela `faixas_comissao` (não um CASE
  fixo no SQL), seedada com os valores da tabela acima, editável por
  `gestor` via RLS — se a farmácia mudar a régua no futuro, não precisa
  reaplicar schema, só atualizar os dados (ainda sem tela de edição no
  app; ajuste é via SQL direto por ora).

Implementação (ver `supabase/schema.sql` e `supabase/rls_policies.sql`):

- `faixas_comissao(percentual_meta_min, percentual_comissao)`: piso de
  cada faixa (inclusive) e o percentual de comissão. A faixa aplicada é
  a de maior piso que o percentual atingido alcança (ex.: 95% atingido
  cai na faixa de piso 90, não na de 100).
- `vw_metas_comissao`: estende `vw_metas_progresso` (só linhas com
  `semana is null`, ou seja, meta mensal) com margem bruta REAL do mês
  (faturamento líquido − custo de aquisição, mesma fórmula de
  `vw_metricas_vendedor_diario`, agregada pro mês inteiro — não
  proporcional ao valor batido da meta), a faixa aplicada e o valor de
  comissão calculado. `security_invoker = true`: respeita a RLS de
  `metas` (vendedor só a própria linha) e de vendas/venda_itens.
- Checklist diário (`atividades_checklist` + `checklist_respostas`):
  ganhou tabelas reais nesta rodada (antes só existia como mock local no
  app via AsyncStorage) — vendedor só lê atividades ativas e só escreve
  as próprias respostas; gestor lê/gerencia tudo.
- Bucket de Storage `receitas`: SQL pronto em
  [`supabase/storage_setup.sql`](supabase/storage_setup.sql) — privado,
  policies por pasta `<codigo_vendedor>/...` (vendedor só acessa a
  própria pasta, gestor tudo). Convenção de path é obrigatória: o app
  precisa subir o arquivo como `<codigo_vendedor>/<venda_item_id>.jpg`.

No app (lado gestor): `MetasScreen` (aba "Metas" → segmento "Metas") já
mostra, por vendedor, a faixa de comissão atual e o valor previsto no
fechamento do mês, logo abaixo da barra de progresso mensal. Tipos novos
em `src/types/domain.ts` (`FaixaComissao`, `ComissaoMensal`) e método
`getComissoesMensal` no `DataRepository` — implementado no mock
(`mockRepository.ts`) usando a margem bruta % do dia como proxy (mock não
tem livro-razão do mês inteiro), fica exato quando a Frente 2 (Supabase
real) substituir o mock por `vw_metas_comissao`.

## Métricas/insights já definidos como prioridade (para as telas do app)

- Ticket médio por atendimento e por vendedor/dia (valorTotalLiquido dos
  itens ÷ quantidadeAtendimentos).
- Itens por atendimento (quantidadeItens ÷ quantidadeAtendimentos) — indicador
  de venda casada.
- Taxa de desconto concedido por vendedor (vlrDesconto ÷ valorTotalBruto).
- Comissão acumulada do dia por vendedor (prcComissao × valorTotalLiquido).
- Ranking diário entre vendedores (gamificação).
- Vendas por canal: presencial vs vendaEcommerce vs vendaIfood.
- Clientes recorrentes vs clientes inativos (a partir de codigoCliente no
  histórico de vendas) — para ações de fidelidade/reativação.

## Stack definida

- App: React Native + Expo (Android/iOS a partir do mesmo código).
- Backend/dados: Supabase (Postgres + Auth + API).
- Coletor: automação agendada (a definir: n8n/Pipedream/função serverless).
- Conectividade com a farmácia: Cloudflare Tunnel ou Tailscale (a decidir).
- Ambiente de dev: Cursor + Claude Code.

## O que NÃO fazer (decisões já tomadas, não reabrir sem motivo)

- Não usar VPS/domínio próprio autogerenciado — optamos por stack gerenciada
  para reduzir manutenção.
- Não abrir porta no roteador da farmácia para acesso externo.
- Não guardar o token Bearer da API da farmácia no app mobile.
- Não usar a versão DEV da API — sempre LTS.
- Não integrar com a API PDV (fora do escopo, é para ponto de venda/nota
  fiscal, não analytics).