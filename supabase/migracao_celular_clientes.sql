-- [12/08/2026] API SGF não expõe "celular" na leitura de cliente (só
-- "fone", confirmado nos 3 endpoints de leitura) — mas a tela de
-- cadastro da Trier tem os dois campos separados. Relatório manual
-- "Totais por Cliente" (docs/clientes.xlsx) trouxe os dois: de 27.459
-- clientes, 2.428 têm celular preenchido, sendo 159 que só têm celular
-- (fone vazio) e 1.331 com celular DIFERENTE do fone (geralmente fone
-- = fixo antigo sem DDD, celular = número de verdade).
--
-- Coluna separada de `fone` (não sobrescreve) porque a sincronização
-- normal do coletor faz upsert em `fone` a cada ciclo — se a gente
-- misturasse celular ali, o próximo sync da API apagava de volta.
-- `celular` só é escrito por importação manual (ver
-- importar_celular_clientes.sql), nunca pelo coletor.
--
-- Views que expõem telefone pro app passam a usar
-- coalesce(celular, fone) — celular primeiro, por ser mais provável
-- de ter WhatsApp de verdade.
alter table clientes add column if not exists celular text;

create or replace view vw_clientes_por_vendedor as
select
  v.codigo_vendedor,
  c.codigo,
  c.nome,
  coalesce(c.celular, c.fone) as telefone,
  c.email,
  c.data_nascimento,
  count(distinct v.id) as qtd_compras,
  sum(vi.valor_total_liquido) as valor_total,
  max(v.data_emissao) as ultima_compra
from vendas v
join venda_itens vi on vi.venda_id = v.id
join clientes c on c.codigo = v.codigo_cliente
where v.codigo_vendedor is not null and v.codigo_cliente is not null
group by v.codigo_vendedor, c.codigo, c.nome, c.fone, c.celular, c.email, c.data_nascimento;

create or replace view vw_clientes_valor_geral as
select
  c.codigo,
  c.nome,
  coalesce(c.celular, c.fone) as telefone,
  c.email,
  c.data_nascimento,
  count(distinct v.id) as qtd_compras,
  sum(vi.valor_total_liquido) as valor_total,
  max(v.data_emissao) as ultima_compra
from vendas v
join venda_itens vi on vi.venda_id = v.id
join clientes c on c.codigo = v.codigo_cliente
where v.codigo_cliente is not null
group by c.codigo, c.nome, c.fone, c.celular, c.email, c.data_nascimento;

create or replace view vw_carteira_clientes as
select
  cc.id,
  cc.codigo_vendedor,
  c.codigo as codigo_cliente,
  c.nome,
  coalesce(c.celular, c.fone) as telefone,
  cc.criado_em,
  coalesce(v6m.valor_total, 0) as valor_6_meses,
  coalesce(vm.qtd_compras_mes, 0) > 0 as comprado_este_mes,
  coalesce(vm.valor_mes, 0) as valor_mes_atual
from carteira_clientes cc
join clientes c on c.codigo = cc.codigo_cliente
left join lateral (
  select sum(vi.valor_total_liquido) as valor_total
  from vendas v
  join venda_itens vi on vi.venda_id = v.id
  where v.codigo_cliente = c.codigo
    and v.data_emissao >= (current_date - interval '6 months')
) v6m on true
left join lateral (
  select count(distinct v.id) as qtd_compras_mes, sum(vi.valor_total_liquido) as valor_mes
  from vendas v
  join venda_itens vi on vi.venda_id = v.id
  where v.codigo_cliente = c.codigo
    and date_trunc('month', v.data_emissao) = date_trunc('month', current_date)
) vm on true
where exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and (p.role = 'gestor' or p.codigo_vendedor = cc.codigo_vendedor)
);

create or replace view vw_clientes_inatividade as
select
  c.codigo,
  c.nome,
  coalesce(c.celular, c.fone) as telefone,
  ultima_venda.data_emissao as ultima_compra,
  (current_date - ultima_venda.data_emissao) as dias_sem_comprar,
  case when ultima_venda.data_emissao < current_date - interval '60 days' then true else false end as inativo,
  ultima_venda.codigo_vendedor,
  vd.nome as nome_vendedor
from clientes c
join lateral (
  select v.data_emissao, v.codigo_vendedor
  from vendas v
  where v.codigo_cliente = c.codigo
  order by v.data_emissao desc, v.id desc
  limit 1
) ultima_venda on true
left join vendedores vd on vd.codigo = ultima_venda.codigo_vendedor
where exists (
  select 1 from profiles p where p.id = auth.uid()
)
and (current_date - ultima_venda.data_emissao) <= 3000;

alter view vw_clientes_inatividade set (security_invoker = false);

create or replace view vw_produtos_promocao_clientes as
with produtos_em_promocao as (
  select
    p.codigo as codigo_produto,
    p.nome as nome_produto,
    p.preco_atual,
    p.preco_anterior,
    p.percentual_desconto,
    p.exige_receita,
    p.tipo_receita
  from produtos p
  where p.em_promocao = true

  union all

  select
    cp.codigo_produto,
    pc.nome as nome_produto,
    cp.preco_promocional as preco_atual,
    case
      when cp.percentual_desconto > 0 then round(cp.preco_promocional / (1 - cp.percentual_desconto / 100), 2)
      else cp.preco_promocional
    end::numeric(12,2) as preco_anterior,
    cp.percentual_desconto,
    (nullif(trim(pc.tipo_lista), '') is not null) as exige_receita,
    case
      when trim(pc.tipo_lista) = 'T' then 'antimicrobiano'
      when nullif(trim(pc.tipo_lista), '') is not null then 'controle_especial'
      else null
    end as tipo_receita
  from campanha_produtos cp
  join campanhas camp on camp.id = cp.campanha_id
  join produto_catalogo pc on pc.codigo = cp.codigo_produto
  where current_date between camp.data_inicio and camp.data_fim
)
select
  pp.codigo_produto,
  pp.nome_produto,
  pp.preco_atual,
  pp.preco_anterior,
  pp.percentual_desconto,
  c.codigo as codigo_cliente,
  c.nome as nome_cliente,
  coalesce(c.celular, c.fone) as telefone_cliente,
  max(v.data_emissao) as ultima_compra_produto,
  sum(vi.quantidade_produtos) as quantidade_total,
  pp.exige_receita,
  pp.tipo_receita
from produtos_em_promocao pp
join venda_itens vi on vi.codigo_produto = pp.codigo_produto
join vendas v on v.id = vi.venda_id
join clientes c on c.codigo = v.codigo_cliente
group by pp.codigo_produto, pp.nome_produto, pp.preco_atual, pp.preco_anterior, pp.percentual_desconto,
  c.codigo, c.nome, c.fone, c.celular, pp.exige_receita, pp.tipo_receita;
