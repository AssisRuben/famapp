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

- [x] Acesso à API SGF (token Bearer) liberado pela Trier — validado com
      chamada real em 30/07/2026 (`GET /rest/integracao/vendedor/obter-todos-v1`
      → HTTP 200, dados reais). CNPJ homologado: 63396709000178
      (`cod_farmacia` 13040, `cod_filial` 1). Token não expira na prática
      (`exp` em 2100) — tratar como segredo permanente, nunca commitar,
      nunca colocar no app mobile (ver seção "Segurança" abaixo).
- [ ] **Descoberta a confirmar com a Trier**: o host fornecido foi
      `https://api-sgf-gateway.triersistemas.com.br/sgfpod1` — um gateway
      na nuvem da própria Trier (roteia pelo `cod_farmacia`/`cod_filial`
      embutido no JWT), não o `http://<IP-da-farmácia>:4647/sgfpod1` com
      porta redirecionada que a documentação oficial (`docs/api-sgf-openapi.json`)
      descreve como método padrão. Se esse gateway for coisa que a Trier já
      opera de verdade (não só liberado nesse ambiente de testes), **pode
      eliminar a necessidade do túnel próprio** (item abaixo) — confirmar
      com parcerias@grupotrier.com.br antes de descartar o túnel de vez.
- [ ] Confirmar com a Trier: rate limits, limite de paginação, volume
      histórico disponível, canal oficial de suporte.
- [ ] Se o gateway acima NÃO for suficiente sozinho (ex.: só serve esse
      ambiente de homologação): confirmar com a farmácia autorização para
      instalar o agente de túnel num computador da rede local, e escolher
      entre Cloudflare Tunnel vs Tailscale.
- [ ] Produto `24766 - PRODUTO TAXA ENTREGA`: a taxa de entrega aparece
      como um "produto" dentro de `venda_itens`, não como campo próprio da
      venda — o coletor/as views analíticas precisam tratar esse código
      como especial (não é item de prateleira; hoje `vw_metricas_vendedor_diario`
      e afins tratariam ele como qualquer outro produto, inflando
      itens-por-atendimento e possivelmente o cálculo de margem).
- [ ] Coletor escrito (n8n) — vendedor/cliente/venda+itens/atendimentos
      diários, cursor incremental via `sync_control`, ver
      [`coletor/README.md`](coletor/README.md). Falta: rodar
      `coletor/migracao_coletor.sql` no Supabase real, criar as
      credenciais no n8n, importar e testar uma primeira execução.
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
- [x] **Frente 2 (app consumindo Supabase de verdade) implementada** —
      `src/data/supabase/supabaseRepository.ts` substitui o mock em
      `src/data/index.ts` (ver seção "Frente 2" abaixo).
- [ ] Rodar [`supabase/migracao_frente2.sql`](supabase/migracao_frente2.sql)
      no projeto real — corrige views que faltavam `nome_vendedor`,
      adiciona `vw_venda_recente_produto` e estende
      `vw_produtos_promocao_clientes`. Sem isso, Dashboard/Ranking mostram
      código em vez de nome, e Campanhas/Compras/Precificação não têm giro.
- [ ] Criar `app/.env.local` (git-ignorado, cada máquina de dev precisa
      do próprio) com `EXPO_PUBLIC_SUPABASE_URL` e
      `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Supabase → Settings → API → "anon
      public" — **nunca** a `service_role`, essa ignora RLS por completo
      e só pode ficar do lado do coletor).
- [ ] **Bloqueia login de verdade**: criar pelo menos 1 usuário no
      Supabase Auth + linha correspondente em `profiles` (ver
      `supabase/seed_profiles.sql`) — sem isso, `login()` falha com
      "Usuário sem perfil cadastrado" mesmo com e-mail/senha corretos no
      Supabase Auth.
- [ ] Rodar [`supabase/migracao_push_comissao.sql`](supabase/migracao_push_comissao.sql)
      no projeto real e importar/ativar
      [`coletor/notificacao_comissao.n8n.json`](coletor/notificacao_comissao.n8n.json)
      no n8n — ver seção "Notificação push de 'subiu de faixa'" abaixo.
      Precisa também da credencial FCM V1 configurada no EAS
      (`eas credentials` → Android → Push Notifications) pra push
      chegar de verdade no Android.

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
  soma dos 4 buckets semanais bate exatamente com o total mensal),
  `vw_produto_fornecedor_recente` (fornecedor + fator de compra da compra
  mais recente de cada produto, usada pela lista de compras) e
  `vw_venda_recente_produto` (giro de 30 dias + dias sem venda por
  produto, usada por Campanhas/Compras/Precificação —
  `security_invoker=true`; como só tela gestor-only consome, a RLS de
  `venda_itens` já garante visão completa pra quem chama).

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
`getComissoesMensal` no `DataRepository` — no mock (`mockRepository.ts`)
usa a margem bruta % do dia como proxy (mock não tem livro-razão do mês
inteiro); na Frente 2 (`supabaseRepository.ts`, ver seção abaixo) já é
exato, direto de `vw_metas_comissao`.

### Notificação push de "subiu de faixa" (gamificação)

Adicionado 07/08/2026. Diferente do lembrete do Checklist (local, agendado
no próprio celular — `src/lib/notifications.ts` `sincronizarNotificacoesChecklist`),
esta é push de verdade, mandada pelo n8n via Expo Push API, e exige
FCM configurado no EAS (Firebase Cloud Messaging — sem isso a notificação
não chega no Android; ver `eas credentials`).

- `profiles.expo_push_token`: gravado pelo app no login (`AuthContext`
  → `obterPushToken()` em `src/lib/notifications.ts`) — coluna liberada
  por `GRANT UPDATE` específico (não a linha inteira), então o vendedor
  só consegue escrever nesse campo em si mesmo.
- `vw_faixa_comissao_atual`: faixa "se fechasse agora" (3/5/7/8/10%,
  direto de `faixas_comissao` pelo % da meta mensal batido) — mais
  simples que `vw_metas_comissao.percentual_comissao` de propósito
  (aquela é uma média ponderada das 4 semanas, só vira número limpo no
  caso flat 100%).
- `comissao_faixa_alcancada`: ratchet (só sobe, nunca desce, nunca
  guarda o piso de 3%) da maior faixa já alcançada no mês por vendedor
  — serve tanto pra medalha 🥉🥈🥇🏆 mostrada em Meta/Metas
  (`badgeFaixaComissao` em `src/lib/metas.ts`) quanto pra evitar
  mandar o mesmo push duas vezes.
- [`coletor/notificacao_comissao.n8n.json`](coletor/notificacao_comissao.n8n.json):
  workflow agendado (a cada 20 min, 08h-20h) que detecta quem subiu de
  faixa desde o último registro, manda o push via Expo Push API
  (`https://exp.host/--/api/v2/push/send`) e atualiza
  `comissao_faixa_alcancada` — mesmo padrão de
  `coletor/fechamento_comissao.n8n.json` (nó Postgres + agendamento).
- Migração standalone: [`supabase/migracao_push_comissao.sql`](supabase/migracao_push_comissao.sql).

### Mensagens WhatsApp via n8n (Evolution API)

Adicionado 08/08/2026. Farmácia já roda Evolution API em outros fluxos —
estes workflows terminam num nó placeholder (`noOp`) onde entra o nó de
envio de mensagem de verdade; o texto pronto já chega em `$json.mensagem`.

- [`coletor/whatsapp_performance_diaria.n8n.json`](coletor/whatsapp_performance_diaria.n8n.json):
  todo dia às 22:20, uma mensagem só com o resumo de TODOS os
  vendedores ativos (`vw_vendedores_ativos`) — margem e % da meta do
  dia, margem e % da meta da semana com a faixa de comissão da semana
  (🥉🥈🥇🏆, mesma escala de `badgeFaixaComissao`), e as vendas do dia
  separadas em 3: com cliente real identificado, no CPF do próprio
  vendedor (mesma comparação de `vw_vendas_sem_identificacao_comprador`
  — bate CPF do cliente contra o do vendedor) e sem cliente nenhum.
  Todo o cálculo (meta
  diária = mensal/dias do mês, semana = bucket 1-7/8-14/15-21/22-fim)
  replica a mesma lógica já usada no app — ver comentários no próprio
  workflow. Usa `at time zone 'America/Fortaleza'` explicitamente em vez
  de `current_date` cru, porque às 22:20 local já é depois da meia-noite
  em UTC (mesmo cuidado do `notificacao_comissao.n8n.json`).
- [`coletor/whatsapp_faltas.n8n.json`](coletor/whatsapp_faltas.n8n.json): a
  cada 2 dias às 08:00, 1 mensagem de texto com os **produtos em
  falta** registrados desde o envio anterior (`produtos_em_falta`,
  janela de exatamente 2 dias — ontem + hoje — pra não repetir nem
  pular nenhum dia).
- [`coletor/whatsapp_pendencias.n8n.json`](coletor/whatsapp_pendencias.n8n.json):
  mesma cadência (2 em 2 dias, 08:00), mas manda **1 mensagem de mídia
  por pendência em aberto** (`pendencias.baixada = false`, sem janela —
  continua aparecendo até alguém dar baixa), com a foto + legenda
  (produtos/observações, responsável, data, quantos dias em aberto, ⚠️
  se passou de 7 dias). O bucket `pendencias` é privado, então tem um
  nó extra (`Gerar link da foto`) chamando a API de Storage do Supabase
  pra gerar um link temporário antes de montar a legenda — precisa da
  credencial de Header Auth **"Supabase Service Role"** (Name=`apikey`,
  Value=a `service_role` key do projeto; se o Supabase recusar com
  401/403, adiciona também um header manual `Authorization: Bearer
  <mesma key>` — não dá pra deixar isso pronto no workflow porque é
  segredo). Pendência sem foto passa direto (nó `Tem foto?`) e a
  mensagem final sai só com o texto.
- Outras ideias discutidas, ainda não implementadas: resumo semanal,
  aviso de comissão fechada no mês, aviso de receita pendente
  acumulando, follow-up de antibiótico, aviso de "subiu de faixa" pro
  grupo (em vez de só push individual).

## Frente 2 — SupabaseRepository (app consumindo dado real)

`src/data/index.ts` exporta `supabaseRepository`
([`src/data/supabase/supabaseRepository.ts`](app/src/data/supabase/supabaseRepository.ts))
em vez do mock — implementa o mesmo `DataRepository`, nenhuma tela mudou.
Pontos que não são óbvios olhando só o código:

- **RLS faz o trabalho de filtro**: ao contrário do mock (que simula
  "vendedor só vê o próprio" em JS via `visivelParaPerfil`), a maioria dos
  métodos aqui faz `select('*')` puro — a RLS já filtra a resposta pelo
  usuário autenticado. O parâmetro `profile` continua na assinatura (pra
  bater com a interface) mas fica sem uso em vários métodos.
- **`profiles` não guarda nome** — só `id`/`role`/`codigo_vendedor`. Pro
  vendedor o nome vem de `vendedores.nome` (uma query extra no login);
  pro gestor (sem linha em `vendedores`) cai num rótulo fixo
  `"Gestor(a) da Farmácia"`. Se quiser o nome de verdade do gestor,
  daria pra adicionar uma coluna `nome` em `profiles` — não fiz isso
  agora pra não empilhar mais uma migração em cima do que já tinha.
- **`metas_mensal_unique`/`metas_semanal_unique` são índices únicos
  PARCIAIS** (`where semana is [not] null`) — o `on_conflict` do
  PostgREST não consegue inferir índice parcial (não dá pra mandar o
  `WHERE` junto), então `salvarMeta` faz delete+insert em vez de upsert.
  `checklist_respostas` tem unique CONSTRAINT de verdade (não parcial),
  então `marcarChecklistItem` usa upsert normalmente.
- **`CampanhaProduto.precoRegular`** não existe em `campanha_produtos`
  (só guarda `preco_promocional`/`percentual_desconto`) — é recalculado
  na leitura (`precoPromocional / (1 - percentualDesconto/100)`) em vez
  de puxado do preço atual de `produto_catalogo`, pra uma campanha antiga
  não ficar inconsistente se o preço de tabela mudar depois.
- **Upload de receita** segue a convenção obrigatória de
  `storage_setup.sql`: path `<codigo_vendedor>/<venda_item_id>.jpg` no
  bucket `receitas` — `anexarReceita` busca o `codigo_vendedor` do item
  antes de subir a foto, porque a assinatura do método (igual no mock)
  não recebe isso diretamente.
- **`react-native-url-polyfill/auto`** precisa ser o primeiro import de
  `App.tsx` — o `supabase-js` usa `URL`/`fetch` que o Hermes (motor JS
  do React Native) não implementa nativamente.
- Troca de volta pro mock (ex.: demo sem depender de rede): editar as
  duas linhas comentadas em `src/data/index.ts`.

## Pendências técnicas — Campanhas / Cartazetes / Compras / Precificação

Revisão feita em 2026-08-05 nas abas do gestor Campanhas, Cartazetes, Compras
e Precificação. Achados registrados, ainda não implementados — decidir com
calma antes de mexer em lógica de campanha/compra/preço.

1. ~~**Queries sem paginação truncam o catálogo (~1000 produtos).**~~
   **Corrigido em 06/08/2026.** `sugerirProdutosCampanha`, `gerarSugestaoCompras`,
   `getRelatorioPrecificacao`, `carregarCampanhas` e
   `carregarCampanhasVendaAdicional` faziam `.select('*')` direto em
   `produto_catalogo`, `vw_venda_recente_produto` e
   `vw_produto_fornecedor_recente`, sem paginar (mesmo bug que
   `getCatalogoProdutos` já tinha corrigido). Extraído um helper privado
   `buscarPaginado` em `supabaseRepository.ts` (busca em blocos de 1000 até a
   página voltar incompleta) e aplicado nos 5 métodos.
2. ~~**Classificação usa `categoria` (tipo de uso) em vez de `grupo`
   (categoria de produto de verdade).**~~ **Corrigido em 05/08/2026.**
   Valores reais de produção conferidos por query direta:
   `categoria` tem ~15% de nulos e não mapeia consistentemente pra
   medicamento vs. não-medicamento (ex. categoria "ETICO" cai em 5 `grupo`s
   diferentes). `grupo` é o campo confiável — medicamento é qualquer grupo
   começando com `ETICO`, `GENERICO` ou `SIMILAR` (cobre as variantes
   "CONTROLADOS"/"ANTIMICROBIANOS"/"ONEROSO", ex. "GENERICO CONTROLADOS ").
   `ProdutoCatalogo.grupo` adicionado ao domain type e mapeado em
   `mapearProdutoCatalogo`; `precificacao.ts` troca o `Set(['Medicamentos'])`
   por `ehBaixaElasticidade()` (prefixo sobre `grupo`); `doseCerta.ts` troca
   o filtro pra `produto.grupo` e `ParametrosCompra.categoria` vira
   `ParametrosCompra.grupo` (segue sem UI que o exponha — não pedido nessa
   rodada).
3. ~~**Campanha salva não tem edição** — só criar nova ou excluir na aba
   Campanhas.~~ **Corrigido em 05/08/2026.** O backend
   (`salvarCampanha`/`salvarCampanhaVendaAdicional`, real e mock) já
   suportava update via `input.id` — a lacuna era só de UI. Adicionado
   ícone de editar no card da lista em `CampanhasScreen.tsx`: carrega
   nome/datas/produtos da campanha no formulário (sem passar pelo fluxo de
   "gerar sugestão", que reaplicaria os critérios do zero e excluiria os
   produtos já ativos na campanha), permite ajustar preço/remover item e
   salva com `id` preenchido. RLS de `campanhas`/`campanha_produtos` já era
   `for all` pra gestor, sem precisar de migração. Cartazetes (ajuste
   avulso de impressão, não persistido) segue como estava — fora do escopo
   dessa correção.

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
- Coletor: **n8n**, rodando na VPS/EasyPanel que a farmácia já opera pra
  outras automações — decisão tomada em 30/07/2026 (reaproveitar infra
  existente em vez de criar uma nova; Edge Function/Cloudflare Worker
  descartados por esse motivo). Workflow + guia de setup em
  [`coletor/`](coletor/README.md).
- Conectividade com a farmácia: **dispensada** — o coletor fala com o
  gateway `api-sgf-gateway.triersistemas.com.br` da própria Trier, não
  com um IP da farmácia. Ver descoberta em "Status atual / pendências"
  acima (ainda não confirmada oficialmente com a Trier).
- Ambiente de dev: Cursor + Claude Code.

## O que NÃO fazer (decisões já tomadas, não reabrir sem motivo)

- Não usar VPS/domínio próprio autogerenciado — optamos por stack gerenciada
  para reduzir manutenção.
- Não abrir porta no roteador da farmácia para acesso externo.
- Não guardar o token Bearer da API da farmácia no app mobile.
- Não usar a versão DEV da API — sempre LTS.
- Não integrar com a API PDV (fora do escopo, é para ponto de venda/nota
  fiscal, não analytics).