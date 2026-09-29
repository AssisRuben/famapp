-- ============================================================
-- Fase B: "combina com o que ele compra" (30/09/2026)
--
-- produto_afinidade: pares de produtos comprados JUNTOS (mesma venda),
-- agrupados por remédio equivalente (chave_equivalencia; sem chave, o
-- próprio código) — por código os pares ficam raros demais com 9 meses de
-- histórico. lift = quantas vezes mais a dupla aparece junta do que o
-- acaso explicaria (mesmo critério de fn_sugerir_pares_afinidade, dos
-- Kits). Recalculada 1x por dia pelo n8n (coletor/afinidade_diaria.n8n.json)
-- via fn_recalcular_afinidade() — custo do self-join fica fora da tela.
--
-- fn_sugestoes_cliente(cliente): até N produtos que COMBINAM com o que o
-- cliente compra e que ele AINDA NÃO compra. O lado sugerido só pode ser:
--   - sem receita (sem tipo_lista, fora de controlado/antimicrobiano);
--   - fora da NBCAL (fórmula infantil, mamadeira, bico, chupeta);
--   - produto de verdade (sem taxa/entrega/sacola/recarga/serviço/admin);
--   - com estoque (não adianta sugerir o que não tem).
-- O lado "ele compra" pode ser qualquer coisa, inclusive remédio com
-- receita (quem compra losartana -> medidor de pressão, por exemplo).
--
-- Idempotente. Rodar depois de migracao_chave_equivalencia.sql.
-- ============================================================

create table if not exists produto_afinidade (
  grupo_a text not null,
  grupo_b text not null,
  co_ocorrencias integer not null,
  vendas_a integer not null,
  vendas_b integer not null,
  lift numeric(10,2) not null,
  confianca numeric(6,4) not null,  -- das vendas com A, quantas tinham B
  calculado_em timestamptz not null default now(),
  primary key (grupo_a, grupo_b)
);

alter table produto_afinidade enable row level security;

drop policy if exists "produto_afinidade: usuarios autenticados leem" on produto_afinidade;
create policy "produto_afinidade: usuarios autenticados leem"
on produto_afinidade for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

-- chave de grupo usada nos dois lados (igual à Fase A)
create or replace function fn_grupo_produto(p_codigo integer, p_chave text)
returns text
language sql
immutable
as $$
  select coalesce(p_chave, 'COD:' || p_codigo);
$$;

-- Produto que não é "produto de verdade" pra afinidade/sugestão.
create or replace function fn_produto_fora_de_afinidade(p_nome text, p_grupo text, p_categoria text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_nome, '') ~* '(TAXA|ENTREGA|DELIVERY|FRETE|SACOLA|RECARGA)'
      or upper(coalesce(p_categoria, '')) = 'SERVICOS'
      or upper(trim(coalesce(p_grupo, ''))) ~ '^(BONIFICACAO|AMBULATORIO|CADASTRO AUTOMATICO|USO OU CONSUMO)';
$$;

create or replace function fn_recalcular_afinidade(
  p_dias integer default 270,
  p_min_co_ocorrencias integer default 5,
  p_lift_minimo numeric default 2
)
returns integer
language plpgsql
as $$
declare
  v_linhas integer;
begin
  delete from produto_afinidade;

  insert into produto_afinidade (grupo_a, grupo_b, co_ocorrencias, vendas_a, vendas_b, lift, confianca, calculado_em)
  with itens as (
    select distinct
      vi.venda_id,
      fn_grupo_produto(vi.codigo_produto, pc.chave_equivalencia) as grupo
    from venda_itens vi
    join vendas v on v.id = vi.venda_id
    left join produto_catalogo pc on pc.codigo = vi.codigo_produto
    where v.data_emissao >= current_date - make_interval(days => p_dias)
      and v.tipo_cancelamento is null
      and vi.quantidade_produtos > 0
      and not fn_produto_fora_de_afinidade(pc.nome, pc.grupo, pc.categoria)
  ),
  -- cesta com 1 grupo só não gera par, mas conta no total (é o "acaso")
  total as (select count(distinct venda_id)::numeric as n from itens),
  suporte as (select grupo, count(*) as vendas from itens group by grupo),
  pares as (
    select a.grupo as grupo_a, b.grupo as grupo_b, count(*) as co
    from itens a
    join itens b on b.venda_id = a.venda_id and b.grupo <> a.grupo
    group by 1, 2
    having count(*) >= p_min_co_ocorrencias
  )
  select
    p.grupo_a, p.grupo_b, p.co, sa.vendas, sb.vendas,
    round((p.co * t.n) / (sa.vendas * sb.vendas), 2),
    round(p.co::numeric / sa.vendas, 4),
    now()
  from pares p
  join suporte sa on sa.grupo = p.grupo_a
  join suporte sb on sb.grupo = p.grupo_b
  cross join total t
  where (p.co * t.n) / (sa.vendas * sb.vendas) >= p_lift_minimo;

  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$$;

create or replace function fn_sugestoes_cliente(p_codigo_cliente integer, p_limite integer default 2)
returns table (
  codigo_produto integer,
  nome_produto text,
  combina_com text,
  lift numeric,
  co_ocorrencias integer
)
language sql
stable
as $$
  with compras_cliente as (
    select
      fn_grupo_produto(vi.codigo_produto, pc.chave_equivalencia) as grupo,
      pc.nome,
      v.data_emissao
    from vendas v
    join venda_itens vi on vi.venda_id = v.id
    left join produto_catalogo pc on pc.codigo = vi.codigo_produto
    where v.codigo_cliente = p_codigo_cliente
      and v.tipo_cancelamento is null
      and vi.quantidade_produtos > 0
  ),
  -- tudo que ele já comprou (qualquer época) não é sugestão
  ja_comprou as (select distinct grupo from compras_cliente),
  -- base da sugestão: o que ele comprou no último ano, com o nome mais recente
  base as (
    select distinct on (grupo) grupo, nome
    from compras_cliente
    where data_emissao >= current_date - 365
    order by grupo, data_emissao desc
  ),
  candidatos as (
    select distinct on (af.grupo_b)
      af.grupo_b, af.lift, af.co_ocorrencias, b.nome as combina_com
    from produto_afinidade af
    join base b on b.grupo = af.grupo_a
    where af.grupo_b not in (select grupo from ja_comprou)
    order by af.grupo_b, af.lift * af.confianca desc, af.co_ocorrencias desc
  ),
  -- produto que representa o grupo sugerido: o de mais estoque, e só se
  -- ele puder ser oferecido
  representante as (
    select distinct on (fn_grupo_produto(pc.codigo, pc.chave_equivalencia))
      fn_grupo_produto(pc.codigo, pc.chave_equivalencia) as grupo,
      pc.codigo,
      pc.nome
    from produto_catalogo pc
    where pc.estoque_atual > 0
      and nullif(trim(pc.tipo_lista), '') is null
      and upper(coalesce(pc.grupo, '')) !~ 'CONTROLAD|ANTIMICROB'
      and upper(pc.nome) !~ '(^|[^A-Z])(MAMAD|MAMADEIRA|CHUPETA|APTAMIL|NAN|NESTOGENO|ENFAMIL|MILNUTRI)([^A-Z]|$)|BICO MAM'
      and not fn_produto_fora_de_afinidade(pc.nome, pc.grupo, pc.categoria)
    order by fn_grupo_produto(pc.codigo, pc.chave_equivalencia), pc.estoque_atual desc, pc.codigo
  )
  select r.codigo, r.nome, c.combina_com, c.lift, c.co_ocorrencias
  from candidatos c
  join representante r on r.grupo = c.grupo_b
  order by c.lift desc, c.co_ocorrencias desc
  limit p_limite;
$$;

comment on function fn_sugestoes_cliente(integer, integer) is
  'Até N produtos que combinam com o que o cliente compra (produto_afinidade) e ele ainda não compra — só sem receita, fora da NBCAL, com estoque.';
