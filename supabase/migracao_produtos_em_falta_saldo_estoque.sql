-- ============================================================
-- Migração pra rodar no projeto Supabase REAL (17/08/2026) — pergunta
-- "O produto tem saldo no estoque?" na tela de Produto em falta:
-- distingue ruptura de gôndola (sistema mostra saldo, mas o produto
-- não é encontrado no balcão) de falta real (saldo zerado no sistema).
-- ============================================================

alter table produtos_em_falta
  add column if not exists tem_saldo_estoque boolean not null default false;

-- vw_produtos_em_falta precisa devolver a coluna nova — recriada
-- inteira (create or replace) mantendo a mesma lógica de mascarar
-- nome_registrado_por pra quem não é gestor. A coluna nova vai DEPOIS
-- de nome_registrado_por de propósito: create or replace view só
-- aceita ACRESCENTAR coluna no fim, não inserir no meio (senão o
-- Postgres interpreta como tentativa de renomear coluna existente e
-- dá erro 42P16).
create or replace view vw_produtos_em_falta as
select
  pef.id,
  pef.nome_produto,
  pef.codigo_produto,
  pef.data,
  case
    when exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor')
    then coalesce(vd.nome, 'Gestor(a) da Farmácia')
    else null
  end as nome_registrado_por,
  pef.tem_saldo_estoque
from produtos_em_falta pef
left join profiles perfil_registro on perfil_registro.id = pef.registrado_por
left join vendedores vd on vd.codigo = perfil_registro.codigo_vendedor;

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select * from vw_produtos_em_falta order by data desc limit 20;
