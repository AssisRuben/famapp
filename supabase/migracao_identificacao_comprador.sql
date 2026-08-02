-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — views pro card
-- "Venda controlada sem comprador identificado" em Alertas, com
-- drill-down por vendedor.
--
-- Por vendedor, conta vendas de produto controlado (a partir de
-- 01/07/2026) sem identificação real do comprador: sem cliente na
-- venda, OU cliente = o próprio vendedor (mesmo CPF, comparado sem
-- pontuação) — achado analisando os dados reais 02/08/2026.
--
-- DIFERENTE do resto do app (RLS aberta pra todo mundo ver o
-- resultado de todos): aqui é dado individual sensível — gestor vê
-- todo mundo, vendedor só a própria linha. Controle de acesso no
-- próprio WHERE de cada view (checando profiles/auth.uid()).
-- ============================================================

create or replace view vw_receita_identificacao_comprador as
select
  v.codigo_vendedor,
  vd.nome as nome_vendedor,
  count(*) as total_vendas_controladas,
  count(*) filter (
    where v.codigo_cliente is null
      or (
        vd.numero_cpf is not null
        and c.numero_cpf_cnpj is not null
        and regexp_replace(c.numero_cpf_cnpj, '\D', '', 'g') = regexp_replace(vd.numero_cpf, '\D', '', 'g')
      )
  ) as vendas_sem_identificacao
from venda_itens vi
join vendas v on v.id = vi.venda_id
join produto_catalogo pc on pc.codigo = vi.codigo_produto and nullif(trim(pc.tipo_lista), '') is not null
left join clientes c on c.codigo = v.codigo_cliente
left join vendedores vd on vd.codigo = v.codigo_vendedor
where v.data_emissao >= '2026-07-01'
  and v.codigo_vendedor is not null
  and exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and (p.role = 'gestor' or p.codigo_vendedor = v.codigo_vendedor)
  )
group by v.codigo_vendedor, vd.nome;

alter view vw_receita_identificacao_comprador set (security_invoker = true);

create or replace view vw_vendas_sem_identificacao_comprador as
select
  vi.id as venda_item_id,
  v.data_emissao as data_venda,
  v.numero_nota,
  pc.nome as nome_produto,
  v.codigo_vendedor,
  case when v.codigo_cliente is null then 'sem_cliente' else 'proprio_cpf' end as motivo,
  v.hora_emissao
from venda_itens vi
join vendas v on v.id = vi.venda_id
join produto_catalogo pc on pc.codigo = vi.codigo_produto and nullif(trim(pc.tipo_lista), '') is not null
left join clientes c on c.codigo = v.codigo_cliente
left join vendedores vd on vd.codigo = v.codigo_vendedor
where v.data_emissao >= '2026-07-01'
  and v.codigo_vendedor is not null
  and (
    v.codigo_cliente is null
    or (
      vd.numero_cpf is not null
      and c.numero_cpf_cnpj is not null
      and regexp_replace(c.numero_cpf_cnpj, '\D', '', 'g') = regexp_replace(vd.numero_cpf, '\D', '', 'g')
    )
  )
  and exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and (p.role = 'gestor' or p.codigo_vendedor = v.codigo_vendedor)
  )
order by v.data_emissao desc;

alter view vw_vendas_sem_identificacao_comprador set (security_invoker = true);

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- Como gestor, deve ver todos; logado como vendedor, só a própria linha:
-- select *, round(100.0 * vendas_sem_identificacao / total_vendas_controladas, 1) as pct
-- from vw_receita_identificacao_comprador
-- order by pct desc;
