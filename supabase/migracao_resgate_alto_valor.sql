-- ============================================================
-- "Cliente de alto valor sumindo": lista mais enxuta, mensagem com o
-- produto do cliente e grupo de controle (01/10/2026)
--
-- Medição de setembro: comparando clientes com o MESMO tempo sem
-- comprar, quem foi contatado não voltou mais do que quem não foi
-- (60-89 dias: 33% x 30%; 90-179: 10% x 19%; 180+: 0% x 12%). Os 15,5%
-- de "resgate" eram a volta natural. A mensagem padrão ("Sentimos sua
-- falta — podemos ajudar em algo?") não dá motivo nenhum pra voltar.
--
-- O que muda (o resto da regra fica em AlertasScreen + lib/resgate.ts):
-- 1) vw_clientes_valor_geral para de contar venda cancelada (somava no
--    valor total e podia atualizar a "última compra"). Mesmas colunas.
-- 2) vw_cliente_produto_preferido: o produto que o cliente mais comprou
--    (dias de compra), pra mensagem citar ("faz um tempinho que você não
--    leva o seu X"). Nunca produto que exige receita (controlado,
--    antimicrobiano, tipo_lista) — mesma regra do "só lembrete" do uso
--    contínuo — nem sacola/taxa. Lê cliente_produto_habito (pré-calculada,
--    ver migracao_recompra_pre_calculada.sql), então é leve.
-- 3) fn_resgate_grupo_controle(cliente, ano, mes): 20% dos clientes por
--    mês ficam FORA da lista (sorteio determinístico, muda todo mês). O
--    app usa a MESMA conta (lib/resgate.ts) — se mudar aqui, muda lá.
--    supabase/consulta_teste_resgate_alto_valor.sql compara lista x
--    controle no fim do mês.
--
-- Rodar DEPOIS de migracao_recompra_pre_calculada.sql. Idempotente.
-- ============================================================

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
  and v.tipo_cancelamento is null  -- 01/10/2026
group by c.codigo, c.nome, c.fone, c.celular, c.email, c.data_nascimento;

create or replace view vw_cliente_produto_preferido
with (security_invoker = true) as
select distinct on (h.codigo_cliente)
  h.codigo_cliente,
  h.codigo_produto,
  h.nome_produto,
  h.qtd_compras
from cliente_produto_habito h
where not h.exige_receita
  -- só cita produto que é HÁBITO (2+ compras); compra isolada não vira
  -- "faz tempo que você não leva o seu X" (ajuste de 02/10/2026)
  and h.qtd_compras >= 2
  and upper(coalesce(h.grupo, '')) !~ '^USO OU CONSUMO'
  and coalesce(h.nome_produto, '') !~* 'SACOLA|TAXA|ENTREGA|RECARGA|CHIP'
order by h.codigo_cliente, h.qtd_compras desc, h.ultima_compra desc, h.codigo_produto;

comment on view vw_cliente_produto_preferido is
  'Produto que o cliente mais comprou (dias de compra), sem receita/sacola/taxa — usado na mensagem do card "Cliente de alto valor sumindo".';

create or replace function fn_resgate_grupo_controle(p_codigo_cliente integer, p_ano integer, p_mes integer)
returns boolean
language sql
immutable
as $$
  -- espelho de noGrupoControleResgate() em app/src/lib/resgate.ts
  select ((p_codigo_cliente::bigint * 37 + p_ano * 12 + p_mes) % 5) = 0;
$$;
