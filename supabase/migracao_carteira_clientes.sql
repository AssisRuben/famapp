-- Aba "Carteira de clientes" — lista curada manualmente pelo vendedor
-- (adiciona/remove por busca de nome/CPF), substitui o antigo card de
-- aniversário em Alertas.

create table carteira_clientes (
  id bigserial primary key,
  codigo_vendedor integer not null references vendedores(codigo),
  codigo_cliente integer not null references clientes(codigo),
  adicionado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  unique (codigo_vendedor, codigo_cliente)
);

create index idx_carteira_clientes_vendedor on carteira_clientes (codigo_vendedor);

-- valor_6_meses/comprado_este_mes somam QUALQUER vendedor (mede o
-- engajamento real do cliente, não só o que comprou com o vendedor
-- dono da carteira) — controle de acesso feito no WHERE, não por
-- security_invoker (ver comentário completo em schema.sql).
create view vw_carteira_clientes as
select
  cc.id,
  cc.codigo_vendedor,
  c.codigo as codigo_cliente,
  c.nome,
  c.fone as telefone,
  cc.criado_em,
  coalesce(v6m.valor_total, 0) as valor_6_meses,
  coalesce(vm.qtd_compras_mes, 0) > 0 as comprado_este_mes
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
  select count(*) as qtd_compras_mes
  from vendas v
  where v.codigo_cliente = c.codigo
    and date_trunc('month', v.data_emissao) = date_trunc('month', current_date)
) vm on true
where exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and (p.role = 'gestor' or p.codigo_vendedor = cc.codigo_vendedor)
);

alter table carteira_clientes enable row level security;

create policy "carteira_clientes: select proprio ou gestor"
on carteira_clientes for select
using (exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and (p.role = 'gestor' or p.codigo_vendedor = carteira_clientes.codigo_vendedor)
));

create policy "carteira_clientes: insere proprio ou gestor"
on carteira_clientes for insert
with check (exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and (p.role = 'gestor' or p.codigo_vendedor = carteira_clientes.codigo_vendedor)
));

create policy "carteira_clientes: deleta proprio ou gestor"
on carteira_clientes for delete
using (exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and (p.role = 'gestor' or p.codigo_vendedor = carteira_clientes.codigo_vendedor)
));
