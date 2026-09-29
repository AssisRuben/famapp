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
--   - NÃO-medicamento (fora de ETICO/GENERICO/SIMILAR — ver comentário
--     em "representante": tipo_lista não pega tarja vermelha comum);
--   - fora da NBCAL (fórmula infantil, mamadeira, bico, chupeta);
--   - produto de verdade (sem taxa/entrega/sacola/recarga/serviço/admin);
--   - com estoque (não adianta sugerir o que não tem).
-- O lado "ele compra" pode ser qualquer coisa, inclusive remédio com
-- receita (quem compra losartana -> medidor de pressão, por exemplo).
--
-- sugestao_regra (30/09/2026): regras da farmácia "quem compra X ->
-- sugerir Y" (diabetes -> tiras/lancetas, pressão -> aparelho, verme ->
-- vitaminas), porque remédio crônico quase sempre sai junto de OUTRO
-- remédio e os dados de venda sozinhos não acham esses complementos.
-- Regra vem antes dos pares de venda. Também fica fora da sugestão:
-- seringa/agulha (sai junto no balcão) e outra variação da mesma família
-- do que ele já compra (2 primeiras palavras do nome: outro sabor, outro
-- tamanho da mesma fralda).
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

-- Regras definidas pela farmácia (30/09/2026): "quem compra X -> sugerir
-- Y", pra onde os dados de venda não bastam (remédio crônico quase sempre
-- sai junto de OUTRO remédio, e aparelho/tira sai pouco na mesma venda).
--   padrao_compra:   regex sobre PRINCÍPIO ATIVO + NOME do que o cliente compra
--   padrao_sugestao: regex sobre o NOME do produto a sugerir
--   permite_medicamento: a sugestão pode estar em ETICO/GENERICO/SIMILAR
--     (vitamina cadastrada como medicamento) — escolha explícita da
--     farmácia; controlado/antimicrobiano/receita retida continuam fora.
-- Editável no Supabase (Table Editor); "ativo = false" desliga.
create table if not exists sugestao_regra (
  id bigserial primary key,
  nome text not null unique,
  padrao_compra text not null,
  padrao_sugestao text not null,
  permite_medicamento boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table sugestao_regra enable row level security;

drop policy if exists "sugestao_regra: usuarios autenticados leem" on sugestao_regra;
create policy "sugestao_regra: usuarios autenticados leem"
on sugestao_regra for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

drop policy if exists "sugestao_regra: gestor edita" on sugestao_regra;
create policy "sugestao_regra: gestor edita"
on sugestao_regra for all
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'))
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

-- Regras iniciais (nomes conferidos no catálogo da Trier em 30/09/2026).
-- "TIRA LEITE" (leite materno) e "TESTE GRAV ... TIRA" ficam de fora de
-- propósito: só "TIRAS"/"LANCETAS"/"KIT ACCU-CHEK".
insert into sugestao_regra (nome, padrao_compra, padrao_sugestao, permite_medicamento) values
  ('Diabetes -> tiras e lancetas',
   'METFORMINA|GLICLAZIDA|GLIBENCLAMIDA|GLIMEPIRIDA|INSULINA|DAPAGLIFLOZINA|EMPAGLIFLOZINA|SITAGLIPTINA|VILDAGLIPTINA|LINAGLIPTINA|PIOGLITAZONA',
   '^(TIRAS |LANCETAS |AUTO LANCETA |KIT ACCU-CHEK )', false),
  ('Pressão -> aparelho de pressão',
   'LOSARTANA|VALSARTANA|OLMESARTANA|CANDESARTANA|TELMISARTANA|IRBESARTANA|ANLODIPINO|NIFEDIPINO|HIDROCLOROTIAZIDA|CLORTALIDONA|INDAPAMIDA|ENALAPRIL|CAPTOPRIL|RAMIPRIL|ATENOLOL|PROPRANOLOL|CARVEDILOL|METOPROLOL|NEBIVOLOL|ESPIRONOLACTONA|FUROSEMIDA',
   '^(AP PRESSAO |APARELHO DE PRESSAO )', false),
  ('Verme -> vitaminas',
   'ALBENDAZOL|MEBENDAZOL|NITAZOXANIDA|IVERMECTINA|TIABENDAZOL|PIRANTEL|LEVAMISOL|PRAZIQUANTEL',
   '^(DAYVIT|ZIRVIT|CENTRUM|LAVITAN|SUPRAVIT|VITERGAN|COMPLEXO B|APETISINA|APETIKIDS|VITAMINA )', true)
on conflict (nome) do nothing;

-- Mesma assinatura de antes — o app não muda.
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
      upper(coalesce(pc.principio_ativo, '') || ' ' || coalesce(pc.nome, '')) as busca,
      -- "família" = 2 primeiras palavras do nome: SNICKERS CHOC, FR CONFORT...
      split_part(upper(coalesce(pc.nome, '')), ' ', 1) || ' ' || split_part(upper(coalesce(pc.nome, '')), ' ', 2) as familia,
      v.data_emissao
    from vendas v
    join venda_itens vi on vi.venda_id = v.id
    left join produto_catalogo pc on pc.codigo = vi.codigo_produto
    where v.codigo_cliente = p_codigo_cliente
      and v.tipo_cancelamento is null
      and vi.quantidade_produtos > 0
  ),
  -- o que ele já comprou (qualquer época) — nem o grupo nem outra variação
  -- da mesma família viram sugestão (outro sabor de Snickers, outro
  -- tamanho da mesma fralda)
  ja_comprou as (select distinct grupo from compras_cliente),
  ja_familia as (select distinct familia from compras_cliente),
  -- base: o que ele comprou no último ano, com o nome mais recente
  base as (
    select distinct on (grupo) grupo, nome, busca
    from compras_cliente
    where data_emissao >= current_date - 365
    order by grupo, data_emissao desc
  ),
  -- produto que PODE ser sugerido (vale pros dois caminhos)
  oferecivel as (
    select
      pc.codigo,
      pc.nome,
      pc.estoque_atual,
      fn_grupo_produto(pc.codigo, pc.chave_equivalencia) as grupo,
      upper(trim(coalesce(pc.grupo, ''))) ~ '^(ETICO|GENERICO|SIMILAR)' as eh_medicamento
    from produto_catalogo pc
    where pc.estoque_atual > 0
      and nullif(trim(pc.tipo_lista), '') is null
      and upper(coalesce(pc.grupo, '')) !~ 'CONTROLAD|ANTIMICROB'
      and upper(pc.nome) !~ '(^|[^A-Z])(MAMAD|MAMADEIRA|CHUPETA|APTAMIL|NAN|NESTOGENO|ENFAMIL|MILNUTRI)([^A-Z]|$)|BICO MAM'
      -- material de aplicação sai junto do injetável no balcão; não é
      -- oportunidade de contato depois (30/09/2026)
      and upper(pc.nome) !~ '(^|[^A-Z])(SERINGA|AGULHA|SCALP|CATETER)'
      and not fn_produto_fora_de_afinidade(pc.nome, pc.grupo, pc.categoria)
      and fn_grupo_produto(pc.codigo, pc.chave_equivalencia) not in (select grupo from ja_comprou)
      and (split_part(upper(pc.nome), ' ', 1) || ' ' || split_part(upper(pc.nome), ' ', 2)) not in (select familia from ja_familia)
  ),
  -- 1) regras da farmácia: casa com o que ele compra -> produto de maior
  --    estoque que casa com a sugestão
  por_regra as (
    select distinct on (r.id)
      o.codigo, o.nome, b.nome as combina_com,
      null::numeric as lift, null::integer as co_ocorrencias,
      0 as ordem
    from sugestao_regra r
    join base b on b.busca ~ r.padrao_compra
    join oferecivel o on upper(o.nome) ~ r.padrao_sugestao and (r.permite_medicamento or not o.eh_medicamento)
    where r.ativo
    order by r.id, o.estoque_atual desc, o.codigo
  ),
  -- 2) dados de venda: produto_afinidade, só não-medicamento
  candidatos as (
    select distinct on (af.grupo_b)
      af.grupo_b, af.lift, af.co_ocorrencias, b.nome as combina_com
    from produto_afinidade af
    join base b on b.grupo = af.grupo_a
    order by af.grupo_b, af.lift * af.confianca desc, af.co_ocorrencias desc
  ),
  por_dados as (
    select distinct on (o.grupo)
      o.codigo, o.nome, c.combina_com, c.lift, c.co_ocorrencias,
      1 as ordem
    from candidatos c
    join oferecivel o on o.grupo = c.grupo_b and not o.eh_medicamento
    order by o.grupo, o.estoque_atual desc, o.codigo
  ),
  juntas as (
    select distinct on (codigo) *
    from (select * from por_regra union all select * from por_dados) t
    order by codigo, ordem
  )
  select codigo, nome, combina_com, lift, co_ocorrencias
  from juntas
  -- regra da farmácia primeiro, depois os pares mais fortes
  order by ordem, lift desc nulls last, co_ocorrencias desc nulls last
  limit p_limite;
$$;

comment on function fn_sugestoes_cliente(integer, integer) is
  'Até N produtos que combinam com o que o cliente compra e ele ainda não compra: regras da farmácia (sugestao_regra) primeiro, depois pares de venda (produto_afinidade, só não-medicamento). Sem controlado/receita retida, fora da NBCAL, sem seringa/agulha, sem outra variação da mesma família, com estoque.';
