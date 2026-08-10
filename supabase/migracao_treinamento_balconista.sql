-- ============================================================
-- Tabela de conteúdo pro workflow n8n
-- coletor/mensagemTreinamentoBalconista.json — mesmos campos de
-- "conteúdo" (data/engajamento/mensagem), mas populando um grupo
-- interno de treinamento em vez do grupo de clientes. Tabela NOVA,
-- não mexe em "conteúdo" (que é de outra aplicação, ver README.md).
--
-- Sem RLS liberada pra "authenticated" de propósito — só o coletor
-- (credencial Supabase do n8n, service_role) lê/escreve, mesmo padrão
-- de sync_control. O app não consome essa tabela.
-- ============================================================

create table conteudo_treinamento_balconista (
  id bigserial primary key,
  data date not null unique,
  engajamento text not null,
  mensagem text not null,
  criado_em timestamptz not null default now()
);

alter table conteudo_treinamento_balconista enable row level security;

-- Popula dia sim, dia não, pelos próximos ~90 dias (2026-08-10 até
-- 2026-11-07), repetindo os 17 temas em ciclo (troque o texto quando
-- quiser, é tabela normal — rode de novo com datas futuras pra
-- estender o ciclo quando o período acabar).
with temas(ordem, engajamento, mensagem) as (
  values
    (1, 'Abordagem inicial ao cliente', 'Explique como cumprimentar e identificar a necessidade do cliente nos primeiros 10 segundos, evitando o clássico "posso ajudar?" seco. Dê um roteiro alternativo de abertura.'),
    (2, 'O "e mais uma coisa": venda não acaba no que o cliente pediu', 'Dado real da farmácia: os vendedores com ticket médio mais baixo vendem em média 2,4–2,55 itens por atendimento, contra 2,9–3,3 dos de ticket mais alto — quase 1 item de diferença por venda. Ensine o hábito de sempre oferecer 1 complemento antes de fechar (ex: protetor labial com repelente, fio dental com escova, soro com antitérmico).'),
    (3, 'Genérico x similar x referência', 'Explique a diferença técnica entre os três e como oferecer o genérico sem soar como "empurrar o mais barato" — foco em bioequivalência e economia real pro cliente.'),
    (4, 'Controlado e uso contínuo também são ticket, não só burocracia', 'Dado real: os vendedores de melhor desempenho tiram ~20% do faturamento de produtos Controlados, contra ~6,6% dos de ticket mais baixo — que compensam vendendo proporcionalmente quase o dobro em perfumaria/itens de impulso. Ensine a perguntar ativamente "o(a) senhor(a) já está tomando algum controlado ou remédio de uso contínuo que precisa repor?" em vez de só vender o que foi pedido.'),
    (5, 'Venda de controlados (regras)', 'Reforce as exigências legais de receituário (retenção, validade, tipo de receita por classe) e como orientar o cliente que esquece a receita sem violar a norma.'),
    (6, 'Cadastrar o cliente é hábito, não só exigência do controlado', 'Dado real: vendedores com ticket mais baixo deixam de identificar o comprador (puxar o cadastro/CPF) em 47% das vendas, contra 38% dos de melhor desempenho — e isso não é só compliance, é a própria farmácia perdendo a chance de reativar esse cliente depois. Reforce: SEMPRE puxar o cliente do sistema pelo nome, mesmo quando o produto não é controlado.'),
    (7, 'Escuta ativa com cliente idoso', 'Dicas de comunicação com público idoso: fala pausada, confirmar entendimento da posologia, checar se tem alguém que administra o medicamento em casa.'),
    (8, 'Armazenamento e validade', 'Como checar validade no ato da venda, sinais de produto avariado, e o que fazer com produto próximo do vencimento na prateleira.'),
    (9, 'Interações medicamentosas simples', 'Alertas comuns que o balconista deve saber sinalizar ao farmacêutico (ex: anticoagulante + AAS, antibiótico + álcool) — quando escalar, não diagnosticar.'),
    (10, 'Objeção "tá caro"', 'Roteiro de resposta a reclamação de preço sem desmerecer a farmácia nem empurrar desconto automático — destacar programa de fidelidade/genérico.'),
    (11, 'Perguntas que identificam sintomas', 'Perguntas seguras pra entender queixa (dor, febre, tempo de sintoma) sem invadir o papel do farmacêutico/médico.'),
    (12, 'Fidelização e recompra', 'Como sugerir cadastro no programa de pontos e follow-up de medicamento de uso contínuo (ex: "sua caixa deve estar acabando").'),
    (13, 'Postura em reclamação', 'Como lidar com cliente insatisfeito sem levar pro pessoal — validar a queixa, oferecer solução, escalar se necessário.'),
    (14, 'Perfumaria como venda casada, não como venda principal', 'Diferenças básicas entre linhas (hidratante, protetor, anti-idade) pra indicar com segurança. Perfumaria continua bem-vinda — o problema não é vender, é vender SÓ isso quando dava pra oferecer também o item de uso contínuo/controlado.'),
    (15, 'Organização de fila e prioridade', 'Boas práticas pra triar quem está com pressa/mal-estar/receita simples vs. atendimento mais demorado.'),
    (16, 'Sigilo e discrição', 'Como tratar assuntos sensíveis (teste de gravidez, DSTs, saúde mental) com discrição no balcão.'),
    (17, 'Meta e indicadores de verdade', 'Explique os 3 números que a farmácia acompanha e por que eles importam: itens por atendimento (venda casada), % de venda com cliente identificado (cadastro) e mix de controlado/uso contínuo (ticket) — não é cobrança, é o que separa quem vende mais de quem vende menos, com dado real da própria equipe.')
),
dias as (
  select
    d::date as data,
    ((row_number() over (order by d) - 1) % 17) + 1 as ordem
  from generate_series('2026-08-10'::timestamp, ('2026-08-10'::date + 89)::timestamp, interval '2 days') as d
)
insert into conteudo_treinamento_balconista (data, engajamento, mensagem)
select dias.data, temas.engajamento, temas.mensagem
from dias
join temas on temas.ordem = dias.ordem
order by dias.data
on conflict (data) do nothing;
