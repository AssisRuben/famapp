-- ============================================================
-- Card "Carteira de clientes" (Alertas): adiciona estatística de valor
-- comprado NO MÊS CORRENTE (diferente de valor_6_meses, que é janela
-- móvel de 6 meses) e habilita registro de "contato realizado" pra
-- clientes da carteira (motivo novo 'carteira' em contatos_clientes).
-- ============================================================

-- valor_mes_atual entra no FIM (create-or-replace só permite acrescentar
-- coluna, nunca reordenar/remover a existente).
create or replace view vw_carteira_clientes as
select
  cc.id,
  cc.codigo_vendedor,
  c.codigo as codigo_cliente,
  c.nome,
  c.fone as telefone,
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

alter table contatos_clientes drop constraint contatos_clientes_motivo_check;
alter table contatos_clientes add constraint contatos_clientes_motivo_check
  check (motivo in ('resgate', 'aniversario', 'uso_continuo', 'alto_valor_sumindo', 'promocao', 'antibiotico', 'carteira'));
