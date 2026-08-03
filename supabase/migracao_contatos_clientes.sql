-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — cria contatos_clientes,
-- registro de tentativa de contato (ligação/WhatsApp) feito a partir
-- dos botões Ligar/WhatsApp nas telas de Clientes/Alertas (03/08/2026).
-- Usado só pra suprimir um cliente das listas de
-- resgate/aniversário/uso contínuo/alto valor sumindo/promoção por um
-- tempo depois de contatado — ver app/src/lib/contatos.ts pra janela
-- de cada motivo.
-- ============================================================

create table if not exists contatos_clientes (
  id bigserial primary key,
  codigo_cliente integer not null references clientes(codigo),
  motivo text not null check (motivo in ('resgate', 'aniversario', 'uso_continuo', 'alto_valor_sumindo', 'promocao', 'antibiotico')),
  tipo_contato text not null check (tipo_contato in ('whatsapp', 'ligacao', 'nao_contatado')),
  codigo_produto integer,
  codigo_vendedor integer references vendedores(codigo),
  contatado_em timestamptz not null default now()
);

create index if not exists idx_contatos_clientes_busca on contatos_clientes (codigo_cliente, motivo, contatado_em desc);

alter table contatos_clientes enable row level security;

drop policy if exists "contatos_clientes: usuarios autenticados leem" on contatos_clientes;
create policy "contatos_clientes: usuarios autenticados leem"
on contatos_clientes for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

drop policy if exists "contatos_clientes: usuarios autenticados inserem" on contatos_clientes;
create policy "contatos_clientes: usuarios autenticados inserem"
on contatos_clientes for insert
with check (exists (
  select 1 from profiles p where p.id = auth.uid()
));

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select * from contatos_clientes order by contatado_em desc limit 20;
