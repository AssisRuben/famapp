-- ============================================================
-- Lista de veto para campanhas de cartazete (23/09/2026)
--
-- POR QUE EXISTE: nenhum campo do produto_catalogo distingue
-- medicamento de prescrição de MIP. Verificado em 12 produtos:
--   tipo_lista  -> nulo em 100% deles (inclusive Azitromicina)
--   categoria   -> só repete o grupo (Policlavumoxil e Bacteracin,
--                  que são antibióticos, vêm como "ETICO")
--   nome        -> marca não carrega a molécula (Policlavumoxil não
--                  tem "cilina", Cefagel não tem "cefalex")
--
-- Anunciar preço de medicamento sob prescrição ao público é vedado
-- (RDC 96/2008), então o motor NÃO pode decidir isso sozinho. A saída
-- é o farmacêutico vetar uma vez e o veto valer pra sempre — em poucos
-- ciclos a revisão mensal vira rotina de minutos.
-- ============================================================

create table if not exists campanha_produtos_vetados (
  codigo_produto integer primary key,
  motivo text not null check (motivo in ('prescricao', 'sensivel', 'operacional', 'outro')),
  observacao text,
  vetado_por uuid references auth.users(id),
  vetado_em timestamptz not null default now()
);

comment on table campanha_produtos_vetados is
  'Produtos que nunca entram em proposta de campanha. prescricao = tarja/receita (não pode ir a cartaz por RDC 96/2008); sensivel = assunto inadequado pra cartaz; operacional = decisão comercial.';

alter table campanha_produtos_vetados enable row level security;

drop policy if exists "gestor gerencia veto" on campanha_produtos_vetados;
create policy "gestor gerencia veto" on campanha_produtos_vetados
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

-- ------------------------------------------------------------
-- Seed 1 — curadoria que a farmácia já fez na tabela `produtos`
-- ------------------------------------------------------------
insert into campanha_produtos_vetados (codigo_produto, motivo, observacao)
select p.codigo, 'prescricao', 'produtos.exige_receita = true (curadoria da farmácia)'
from produtos p
where p.exige_receita = true
on conflict (codigo_produto) do nothing;

-- ------------------------------------------------------------
-- Seed 2 — produtos que JÁ TIVERAM receita anexada no app.
-- É evidência operacional: a própria equipe tratou como tarja.
-- ------------------------------------------------------------
insert into campanha_produtos_vetados (codigo_produto, motivo, observacao)
select distinct vi.codigo_produto, 'prescricao', 'teve receita anexada no app'
from venda_item_receitas vir
join venda_itens vi on vi.id = vir.venda_item_id
on conflict (codigo_produto) do nothing;

-- ------------------------------------------------------------
-- Seed 3 — identificados na revisão de 23/09/2026, que passaram
-- por todos os filtros automáticos e chegaram à lista do cartaz.
-- ------------------------------------------------------------
insert into campanha_produtos_vetados (codigo_produto, motivo, observacao) values
  (1979,  'prescricao', 'Policlavumoxil — amoxicilina + clavulanato (antibiótico)'),
  (10881, 'prescricao', 'Cefagel — cefalexina (antibiótico)'),
  (267,   'prescricao', 'Bacteracin — sulfametoxazol + trimetoprima (antibiótico)'),
  (10004, 'prescricao', 'Azitromicina (antibiótico) — cadastro sem tipo_lista'),
  (2416,  'prescricao', 'Secnihexal — secnidazol'),
  (7069,  'prescricao', 'Aciclovir — antiviral'),
  (20540, 'prescricao', 'Ondansetrona — tarja vermelha'),
  (2921,  'prescricao', 'Dexametasona — corticoide, tarja vermelha'),
  (9823,  'prescricao', 'Prednisolona — corticoide, tarja vermelha'),
  (7489,  'prescricao', 'Corticorten — corticoide, tarja vermelha'),
  (8416,  'sensivel',   'Hora H — contraceptivo de emergência, não vai a cartaz'),
  (5612,  'sensivel',   'Teste de gravidez — não vai a cartaz')
on conflict (codigo_produto) do nothing;

-- ------------------------------------------------------------
-- Conferência: quanto cada fonte trouxe
-- ------------------------------------------------------------
select motivo, observacao, count(*) as produtos
from campanha_produtos_vetados
group by 1, 2
order by produtos desc;
