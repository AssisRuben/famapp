-- ============================================================
-- Foto do custo refeita no fim do dia (01/10/2026)
--
-- Conferência com o relatório "Vendas por Vendedor" da Trier (01/10):
-- o app tira a foto do custo (venda_itens.custo_unitario_medio, ver
-- migracao_custo_venda_snapshot.sql) quando o item chega, com o custo
-- médio do cadastro sincronizado às 07:00. Nota de compra lançada
-- durante o dia muda o custo médio na Trier e o app não via — R$ 13 da
-- diferença do dia (Plenitud, Pampers, Baclofeno...).
--
-- fn_refazer_custo_vendas(data): refaz a foto das vendas de UM dia com o
-- custo atual (custo manual > custo médio do cadastro). Chamada pelo
-- sgf-produto-diario.n8n.json logo depois de sincronizar o cadastro:
--   - rodada das 23:30 -> refaz HOJE (cadastro já com as entradas do dia);
--   - rodada das 07:00 -> refaz ONTEM (cadastro das 7h = fim de ontem;
--     só repete a das 23:30, ou cobre se ela falhou).
-- Nunca refaz dia anterior com custo de hoje: a entrada de hoje não vale
-- pra venda de ontem.
--
-- custo_trier (custo original da API) não é tocado: o SET mexe só em
-- custo_unitario_medio e o gatilho trg_venda_itens_custo recalcula
-- valor_total_custo = quantidade x foto.
--
-- Rodar DEPOIS de migracao_custo_venda_snapshot.sql. Idempotente.
-- ============================================================

create or replace function fn_refazer_custo_vendas(p_data date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  -- mesma data de corte da regra da foto (decisão do usuário)
  if p_data is null or p_data < date '2026-09-01' then
    return 0;
  end if;

  update venda_itens vi
  set custo_unitario_medio = fn_custo_unitario_produto(vi.codigo_produto, v.data_emissao)
  from vendas v
  where v.id = vi.venda_id
    and v.data_emissao = p_data
    and vi.custo_unitario_medio is distinct from fn_custo_unitario_produto(vi.codigo_produto, v.data_emissao);

  get diagnostics n = row_count;
  return n;
end;
$$;

-- só o n8n (postgres/service role) chama — nunca o app
revoke all on function fn_refazer_custo_vendas(date) from public, anon, authenticated;
