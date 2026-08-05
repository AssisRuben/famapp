-- Migração: isola o motivo "próprio CPF" (vendedor usando o CPF dele
-- mesmo) de "sem cliente" na view de compliance de comprador — permite
-- um terceiro filtro na tela, além de "todas as vendas"/"só
-- controlados". Idempotente.

create or replace view vw_receita_identificacao_comprador as
select
  v.codigo_vendedor,
  vd.nome as nome_vendedor,
  count(*) filter (where nullif(trim(pc.tipo_lista), '') is not null) as total_vendas_controladas,
  count(*) filter (
    where nullif(trim(pc.tipo_lista), '') is not null
      and (
        v.codigo_cliente is null
        or (
          vd.numero_cpf is not null
          and c.numero_cpf_cnpj is not null
          and regexp_replace(c.numero_cpf_cnpj, '\D', '', 'g') = regexp_replace(vd.numero_cpf, '\D', '', 'g')
        )
      )
  ) as vendas_sem_identificacao,
  count(*) as total_vendas,
  count(*) filter (
    where v.codigo_cliente is null
      or (
        vd.numero_cpf is not null
        and c.numero_cpf_cnpj is not null
        and regexp_replace(c.numero_cpf_cnpj, '\D', '', 'g') = regexp_replace(vd.numero_cpf, '\D', '', 'g')
      )
  ) as vendas_todas_sem_identificacao,
  count(*) filter (
    where v.codigo_cliente is not null
      and vd.numero_cpf is not null
      and c.numero_cpf_cnpj is not null
      and regexp_replace(c.numero_cpf_cnpj, '\D', '', 'g') = regexp_replace(vd.numero_cpf, '\D', '', 'g')
  ) as vendas_proprio_cpf
from venda_itens vi
join vendas v on v.id = vi.venda_id
join produto_catalogo pc on pc.codigo = vi.codigo_produto
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
