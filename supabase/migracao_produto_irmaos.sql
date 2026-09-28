-- ============================================================
-- Cadastros irmãos: mesmo produto, outro código (28/09/2026)
--
-- Problema: quando o estoque de um produto acaba e o comprador repõe com
-- OUTRO laboratório/cadastro (a Trier cria um código novo, com o mesmo
-- nome), o código antigo continua zerado — e continua aparecendo em
-- "Estoque zerado — giro alto" (app + WhatsApp das 08h) e na lista de
-- produtos em falta, mesmo com o produto disponível no balcão.
--
-- Nome idêntico com código diferente = mesmo produto (medido em
-- 28/09/2026: Prednisona 20mg 10cp com 31 un. em outro código,
-- Atorvastatina 40mg com 3 cadastros, Sertralina 50mg, Lamotrigina...).
--
-- CHAVE = nome em maiúsculo, espaços colapsados, sem o token "REV"
-- (revestido: Secnidazol 1000MG 2CP e 2CP REV são o mesmo produto).
-- De propósito NÃO ignora L.P/L.R/L.C (liberação prolongada/retardada/
-- controlada) nem MAST (mastigável): forma diferente não é equivalente.
--
-- Só ANDA POR NOME IDÊNTICO. Equivalência por princípio ativo (marca
-- diferente: Novalgina x Dipirona), dosagem, forma e quantidade na caixa
-- é a fase seguinte — comparar só o primeiro nome dava falso positivo
-- perigoso (Aptamil 1 x 2, Tramadol gotas x comprimido, Cetoconazol
-- shampoo x creme).
--
-- Leve de propósito: só lê o catálogo (~5 mil linhas). O giro, que
-- decide se o irmão realmente COBRE a demanda, é somado por quem
-- consome (já tem vw_venda_recente_produto carregada) usando
-- codigos_grupo — evita varrer venda_itens inteira a cada consulta.
-- ============================================================
create or replace view vw_produto_irmaos
with (security_invoker = true) as
with base as (
  select
    pc.codigo,
    pc.nome,
    greatest(pc.estoque_atual, 0) as estoque,
    trim(regexp_replace(
      regexp_replace(upper(pc.nome), '\s+', ' ', 'g'),
      '(^| )REV( |$)', ' ', 'g'
    )) as chave_nome
  from produto_catalogo pc
  where pc.nome !~* 'ENTREGA|DELIVERY|TAXA'
),
grupos as (
  select
    chave_nome,
    count(*) as qtd_cadastros,
    sum(estoque) as estoque_grupo,
    array_agg(codigo order by codigo) as codigos_grupo,
    jsonb_agg(
      jsonb_build_object('codigo', codigo, 'nome', nome, 'estoque', estoque)
      order by estoque desc, codigo
    ) filter (where estoque > 0) as cadastros_com_estoque
  from base
  group by chave_nome
  having count(*) > 1
)
select
  b.codigo,
  g.chave_nome,
  g.qtd_cadastros,
  -- estoque dos OUTROS códigos do mesmo produto (exclui o próprio)
  (g.estoque_grupo - b.estoque) as estoque_irmaos,
  g.codigos_grupo,
  -- inclui o próprio código quando ele tem estoque — quem consome
  -- filtra o próprio (só faz sentido olhar quando o item está zerado)
  g.cadastros_com_estoque
from base b
join grupos g using (chave_nome);

comment on view vw_produto_irmaos is
  'Outros cadastros (códigos) do MESMO produto — nome idêntico ignorando REV. Usado por Estoque zerado/Faltas pra não tratar como falta o que já tem em estoque sob outro código. Só produtos com pelo menos 1 irmão aparecem.';
