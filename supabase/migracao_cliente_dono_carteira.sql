-- ============================================================
-- Migração pra rodar no projeto Supabase REAL (21/08/2026) — view leve
-- que resolve só "quem é o dono desse cliente na carteira", sem o
-- resto dos dados de vw_carteira_clientes (valor comprado, telefone).
--
-- Motivação: a RLS de carteira_clientes restringe cada vendedor a ver
-- só a PRÓPRIA carteira, então ninguém percebia quando um cliente já
-- estava na carteira de outro vendedor (achado revisando os dados
-- reais: 2 clientes cadastrados em 2 carteiras cada). Essa view expõe
-- só o mínimo (cliente → vendedor dono) pra qualquer autenticado,
-- suficiente pra avisar "já está na carteira de fulano" sem vazar
-- valor de compra nem telefone de quem não é o dono.
--
-- Mesmo padrão de vw_carteira_clientes/vw_produtos_em_falta: SEM
-- security_invoker de propósito — roda com privilégio de dono pra
-- furar a RLS por-vendedor de carteira_clientes, decidindo sozinha
-- (via auth.uid()) que qualquer autenticado pode ler esse recorte.
-- ============================================================

create or replace view vw_cliente_dono_carteira as
select
  cc.codigo_cliente,
  cc.codigo_vendedor,
  vd.nome as nome_vendedor
from carteira_clientes cc
join vendedores vd on vd.codigo = cc.codigo_vendedor
where exists (
  select 1 from profiles p where p.id = auth.uid()
);

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select * from vw_cliente_dono_carteira order by nome_vendedor limit 20;
