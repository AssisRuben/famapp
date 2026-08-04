-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — adiciona o 3º
-- critério de quantidade (03/08/2026): 'venda_com_outros_itens'.
--
-- Os 2 critérios que já existiam cobrem "campanha de produto único
-- com quantidade" (compre 2 do mesmo produto = 'mesma_venda') e "soma
-- do período" ('acumulado_periodo'). Faltava o caso "campanha de
-- vários produtos, tipo 'adicional bebê' (pomada, lenço, chupeta)":
-- aqui não importa quantidade do mesmo produto — importa se a venda
-- tinha MAIS alguma coisa além do produto da campanha. Quem comprou só
-- a chupeta sozinha não conta como "venda adicional"; quem já estava
-- levando outra coisa e levou a chupeta junto, conta.
--
-- Pra isso funcionar, a view precisa saber quantos itens (linhas)
-- tinha a nota TODA, não só os itens da campanha — daí a subquery
-- qtd_itens_na_venda.
--
-- Idempotente — pode rodar de novo sem erro.
-- ============================================================

alter table campanhas_venda_adicional
  drop constraint if exists campanhas_venda_adicional_criterio_quantidade_check;
alter table campanhas_venda_adicional
  add constraint campanhas_venda_adicional_criterio_quantidade_check
  check (criterio_quantidade in ('acumulado_periodo', 'mesma_venda', 'venda_com_outros_itens'));

-- venda_id/numero_nota/qtd_itens_na_venda ficam no FIM da lista de
-- propósito (create or replace view só aceita ACRESCENTAR coluna no
-- fim — ver migracao_venda_adicional_criterio_quantidade.sql, que já
-- bateu nesse erro uma vez).
create or replace view vw_venda_adicional_vendas as
select
  cvap.campanha_id,
  vi.id as venda_item_id,
  v.data_emissao,
  v.hora_emissao,
  vi.codigo_produto,
  pc.nome as nome_produto,
  vi.quantidade_produtos as quantidade,
  v.codigo_vendedor,
  vd.nome as nome_vendedor,
  v.codigo_cliente,
  c.nome as nome_cliente,
  v.id as venda_id,
  v.numero_nota,
  (select count(*) from venda_itens vi2 where vi2.venda_id = vi.venda_id) as qtd_itens_na_venda
from campanha_venda_adicional_produtos cvap
join campanhas_venda_adicional camp on camp.id = cvap.campanha_id
join venda_itens vi on vi.codigo_produto = cvap.codigo_produto
join vendas v on v.id = vi.venda_id and v.data_emissao between camp.data_inicio and camp.data_fim
left join produto_catalogo pc on pc.codigo = vi.codigo_produto
left join vendedores vd on vd.codigo = v.codigo_vendedor
left join clientes c on c.codigo = v.codigo_cliente;

alter view vw_venda_adicional_vendas set (security_invoker = true);

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select venda_id, numero_nota, qtd_itens_na_venda, nome_produto, quantidade
-- from vw_venda_adicional_vendas order by data_venda desc limit 20;
