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
      cada vendedor/gestor da farmácia.

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

- **Tabelas cruas** (espelham os DTOs da API SGF): `vendedores`, `clientes`,
  `vendas`, `venda_itens`, `vendas_vendedor_diario`.
- **`sync_control`**: controle de última sincronização por entidade, usado
  pelo coletor para saber o `dataInicial` da próxima chamada
  `obter-alterados`.
- **Views analíticas** (o app consome estas, nunca as tabelas cruas):
  `vw_desempenho_vendedor_diario`, `vw_metricas_vendedor_diario` (ticket
  médio, desconto, comissão), `vw_ranking_vendedores_dia`,
  `vw_vendas_por_canal`, `vw_clientes_inatividade`.

Schema aplicado no projeto Supabase em uso (`ggzuchqfepjbsyadfcnk`). Esse
projeto já hospedava outra aplicação (CRM/mensageria WhatsApp); as tabelas
antigas foram removidas pelo usuário, preservando apenas `conteúdo`
(sem relação com o farmapp, não mexer).

Políticas de RLS aplicadas — ver [`supabase/rls_policies.sql`](supabase/rls_policies.sql):

- Nova tabela `profiles` (`id` -> `auth.users`, `codigo_vendedor`,
  `role`: `vendedor`|`gestor`) — vínculo entre login do Supabase Auth e o
  vendedor, criado manualmente por processo administrativo (sem
  self-signup).
- Gestor lê tudo; vendedor só lê os próprios dados (`vendedores`, `vendas`,
  `venda_itens`, `vendas_vendedor_diario`); `clientes` é lida por qualquer
  usuário autenticado.
- Só policies de `select` — escrita nas tabelas de negócio continua restrita
  ao coletor via `service_role`.
- `sync_control` fica sem nenhuma policy (bloqueado para anon/authenticated).
- Views recriadas com `security_invoker = true`, senão rodariam com o
  privilégio do dono e ignorariam a RLS das tabelas base.

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