-- ============================================================
-- Motor de campanhas: proposta aprovável + experimento de 3 braços
-- (23/09/2026)
--
-- Contexto (ver diagnostico_motor_campanhas.sql): o backtest com grupo
-- de controle mostrou que o ENCARTE SETEMBRO (20,2% de desconto em 270
-- produtos, 15 dias) teve efeito líquido de -5,4% sobre o volume, ou
-- seja, nenhum. Já a Sprint Vencedor (9% em 35 produtos) deu +42,9%.
-- E a campanha de desconto ZERO provou que o método de comparação tem
-- ruído de ±30pp em lista pequena — por isso o experimento precisa de
-- grupo de controle escolhido pela MESMA régua, e não "produtos
-- parecidos do mesmo grupo".
--
-- Os 3 braços:
--   desconto  — preço promocional; vai pro cartaz e pro .txt do Trier
--   incentivo — preço NORMAL; o dinheiro que seria desconto vira prêmio
--               pro vendedor (campanha de venda adicional vinculada)
--   controle  — preço normal, sem prêmio, invisível pro vendedor:
--               é a linha de base contra a qual os outros dois são medidos
-- ============================================================

-- 1) Campanha passa a ter ciclo de aprovação -----------------
-- O motor grava como 'proposta'; o gestor aprova/rejeita no dia seguinte.
-- Default 'aprovada'/'manual' preserva o comportamento das campanhas que
-- já existem (todas nasceram manuais e valendo).
alter table campanhas
  add column if not exists status text not null default 'aprovada'
    check (status in ('proposta', 'aprovada', 'rejeitada')),
  add column if not exists origem text not null default 'manual'
    check (origem in ('manual', 'motor')),
  add column if not exists proposta_em timestamptz,
  add column if not exists decidida_em timestamptz,
  add column if not exists decidida_por uuid references auth.users(id),
  -- Quanto do desconto evitado vira prêmio pro braço incentivo.
  add column if not exists orcamento_incentivo numeric(12,2)
    check (orcamento_incentivo is null or orcamento_incentivo >= 0);

-- 2) Braço do experimento, por produto -----------------------
-- 'desconto' como default mantém as campanhas existentes iguais ao que
-- são hoje (todas viraram cartaz/preço).
alter table campanha_produtos
  add column if not exists braco text not null default 'desconto'
    check (braco in ('desconto', 'incentivo', 'controle'));

-- 3) Venda adicional pode nascer de um experimento ------------
-- Nullable: campanha de venda adicional criada à mão pelo gestor
-- (fluxo atual) continua funcionando sem origem nenhuma.
alter table campanhas_venda_adicional
  add column if not exists campanha_origem_id bigint
    references campanhas(id) on delete set null;

create index if not exists idx_campanhas_proposta
  on campanhas (status) where status = 'proposta';
create index if not exists idx_cva_origem
  on campanhas_venda_adicional (campanha_origem_id);

-- 4) Medição do experimento ----------------------------------
-- Uma linha por campanha × braço: venda/dia e lucro/dia durante a
-- campanha contra os 28 dias anteriores. Como os três braços saíram da
-- MESMA seleção e rodam no MESMO período, a diferença entre eles é
-- efeito de campanha — sem sazonalidade e sem viés de seleção, que foi
-- exatamente o que contaminou o backtest histórico.
--
-- Lucro usa produto_catalogo.custo_medio (o "Custo Aquisição" da tela da
-- Trier, confirmado em 12/08/2026), não venda_itens.valor_total_custo,
-- que segue outro critério e vem nulo pra venda recente.
create or replace view vw_campanha_experimento
with (security_invoker = true) as
with janela as (
  select
    c.id as campanha_id,
    c.nome,
    min(coalesce(cp.data_inicio, c.data_inicio)) as inicio,
    least(max(coalesce(cp.data_fim, c.data_fim)), current_date - 1) as fim
  from campanhas c
  join campanha_produtos cp on cp.campanha_id = c.id
  where c.status = 'aprovada'
  group by c.id, c.nome
),
vendas_dia as (
  select
    vi.codigo_produto,
    v.data_emissao as dia,
    sum(vi.quantidade_produtos) as qtd,
    sum(vi.valor_total_liquido) as receita,
    sum(vi.valor_total_liquido - coalesce(pc.custo_medio, 0) * vi.quantidade_produtos) as lucro
  from venda_itens vi
  join vendas v on v.id = vi.venda_id
  left join produto_catalogo pc on pc.codigo = vi.codigo_produto
  where v.tipo_cancelamento is null
    and vi.quantidade_produtos > 0
  group by 1, 2
)
select
  j.campanha_id,
  j.nome,
  j.inicio,
  j.fim,
  cp.braco,
  count(distinct cp.codigo_produto) as produtos,
  round(coalesce(sum(d.qtd) filter (where d.dia between j.inicio and j.fim), 0)
        / greatest(j.fim - j.inicio + 1, 1), 2) as qtd_dia_campanha,
  round(coalesce(sum(d.qtd) filter (where d.dia between j.inicio - 28 and j.inicio - 1), 0)
        / 28.0, 2) as qtd_dia_antes,
  round(coalesce(sum(d.lucro) filter (where d.dia between j.inicio and j.fim), 0)
        / greatest(j.fim - j.inicio + 1, 1), 2) as lucro_dia_campanha,
  round(coalesce(sum(d.lucro) filter (where d.dia between j.inicio - 28 and j.inicio - 1), 0)
        / 28.0, 2) as lucro_dia_antes
from janela j
join campanha_produtos cp on cp.campanha_id = j.campanha_id
left join vendas_dia d
  on d.codigo_produto = cp.codigo_produto
  and d.dia between j.inicio - 28 and j.fim
group by j.campanha_id, j.nome, j.inicio, j.fim, cp.braco;

comment on view vw_campanha_experimento is
  'Resultado por braço (desconto/incentivo/controle) de cada campanha aprovada. Compare qtd_dia_campanha/qtd_dia_antes entre os braços: a razão do braço sobre a do controle é o efeito líquido daquela alavanca.';
