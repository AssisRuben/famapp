-- [18/08/2026] Meta de clientes ofertados por dia em Vendas
-- Complementares: o vendedor precisa oferecer o complementar a pelo
-- menos N clientes por dia (número configurável na campanha, pedido
-- do usuário: "pelo menos 10"). Não dá pra controlar/verificar se ele
-- realmente ofereceu — é autodeclarado, informado na mesma aba onde
-- ele marca os itens vendidos.
--
-- Diferente de venda_item_complementar (existência da linha = marcado,
-- nunca precisa update): aqui o VALOR muda — o vendedor pode salvar de
-- novo no mesmo dia com um número diferente — então esta tabela
-- precisa mesmo de policy de UPDATE (upsert de verdade), ao contrário
-- da lição aprendida em venda_item_complementar.
create table venda_complementar_oferta_diaria (
  id bigserial primary key,
  codigo_vendedor integer not null references vendedores(codigo),
  data date not null,
  clientes_ofertados integer not null default 0 check (clientes_ofertados >= 0),
  atualizado_por uuid references auth.users(id),
  atualizado_em timestamptz not null default now(),
  unique (codigo_vendedor, data)
);

create index idx_oferta_diaria_vendedor on venda_complementar_oferta_diaria (codigo_vendedor);

alter table venda_complementar_oferta_diaria enable row level security;

-- Select: qualquer autenticado lê — mesmo critério simples de
-- campanhas_complementares (achado 18/08/2026: policy restritiva por
-- role/codigo_vendedor não se comportou como esperado numa consulta
-- direta; simples e permissivo evita repetir o mesmo problema).
create policy "venda_complementar_oferta_diaria: autenticados leem"
on venda_complementar_oferta_diaria for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

create policy "venda_complementar_oferta_diaria: vendedor grava o proprio ou gestor grava qualquer"
on venda_complementar_oferta_diaria for insert
with check (exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and (
      p.role = 'gestor'
      or (p.role = 'vendedor' and p.codigo_vendedor = venda_complementar_oferta_diaria.codigo_vendedor)
    )
));

create policy "venda_complementar_oferta_diaria: vendedor atualiza o proprio ou gestor atualiza qualquer"
on venda_complementar_oferta_diaria for update
using (exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and (
      p.role = 'gestor'
      or (p.role = 'vendedor' and p.codigo_vendedor = venda_complementar_oferta_diaria.codigo_vendedor)
    )
))
with check (exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and (
      p.role = 'gestor'
      or (p.role = 'vendedor' and p.codigo_vendedor = venda_complementar_oferta_diaria.codigo_vendedor)
    )
));

-- Meta de referência (não gate de premiação, só informativa pro
-- vendedor saber o alvo) — nullable, default sugerido de 10 fica só na
-- tela, não aqui, pra não forçar valor em campanha já existente.
alter table campanhas_complementares
  add column if not exists meta_clientes_ofertados_dia integer check (meta_clientes_ofertados_dia > 0);
