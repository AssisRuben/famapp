import { Produto, ProdutoCatalogo, TipoReceita } from '../../types/domain';

export const HOJE = new Date().toISOString().slice(0, 10);

// Simula o estado da tabela sync_control (preenchida pelo coletor real,
// que ainda não existe — ver README, Frente 3 bloqueada pelo token da
// Trier). Minutos variam por entidade pra imitar rodadas assíncronas.
export interface SyncControlSeedEntry {
  entityName: string;
  minutosAtras: number;
}

export const syncControlSeed: SyncControlSeedEntry[] = [
  { entityName: 'venda', minutosAtras: 8 },
  { entityName: 'cliente', minutosAtras: 42 },
  { entityName: 'vendedor', minutosAtras: 42 },
];

export interface VendedorSeed {
  codigo: number;
  nome: string;
  email: string;
}

export const vendedoresSeed: VendedorSeed[] = [
  { codigo: 101, nome: 'João Silva', email: 'joao@farmacia.com' },
  { codigo: 102, nome: 'Maria Souza', email: 'maria@farmacia.com' },
  { codigo: 103, nome: 'Carlos Pereira', email: 'carlos@farmacia.com' },
  { codigo: 104, nome: 'Ana Lima', email: 'ana@farmacia.com' },
  { codigo: 105, nome: 'Pedro Santos', email: 'pedro@farmacia.com' },
];

export interface MetricasSeed {
  codigoVendedor: number;
  qtdNotas: number;
  faturamentoLiquido: number;
  faturamentoBruto: number;
  totalDesconto: number;
  comissaoEstimada: number;
  // Custo de aquisição total dos itens vendidos (vem de venda_itens.vlr_custo_produto
  // na API real) — é o que dá a margem bruta. Vendedor 103 tem margem mais
  // apertada de propósito (desconta mais, ~30%) pra ilustrar o comparativo.
  totalCusto: number;
}

// Valores fictícios de faturamento/desconto/comissão do dia, por vendedor.
export const metricasSeedHoje: MetricasSeed[] = [
  { codigoVendedor: 101, qtdNotas: 24, faturamentoLiquido: 3180.5, faturamentoBruto: 3420.0, totalDesconto: 239.5, comissaoEstimada: 127.22, totalCusto: 1971.91 },
  { codigoVendedor: 102, qtdNotas: 31, faturamentoLiquido: 4102.9, faturamentoBruto: 4390.0, totalDesconto: 287.1, comissaoEstimada: 164.12, totalCusto: 2666.89 },
  { codigoVendedor: 103, qtdNotas: 18, faturamentoLiquido: 2210.0, faturamentoBruto: 2450.0, totalDesconto: 240.0, comissaoEstimada: 88.4, totalCusto: 1547.0 },
  { codigoVendedor: 104, qtdNotas: 27, faturamentoLiquido: 3675.3, faturamentoBruto: 3800.0, totalDesconto: 124.7, comissaoEstimada: 147.01, totalCusto: 2168.43 },
  { codigoVendedor: 105, qtdNotas: 12, faturamentoLiquido: 1420.0, faturamentoBruto: 1600.0, totalDesconto: 180.0, comissaoEstimada: 56.8, totalCusto: 951.4 },
];

export interface DesempenhoSeed {
  codigoVendedor: number;
  quantidadeAtendimentos: number;
  quantidadeItens: number;
}

export const desempenhoSeedHoje: DesempenhoSeed[] = [
  { codigoVendedor: 101, quantidadeAtendimentos: 24, quantidadeItens: 58 },
  { codigoVendedor: 102, quantidadeAtendimentos: 31, quantidadeItens: 89 },
  { codigoVendedor: 103, quantidadeAtendimentos: 18, quantidadeItens: 33 },
  { codigoVendedor: 104, quantidadeAtendimentos: 27, quantidadeItens: 71 },
  { codigoVendedor: 105, quantidadeAtendimentos: 12, quantidadeItens: 19 },
];

export interface ClienteSeed {
  codigo: number;
  nome: string;
  telefone: string;
  diasSemComprar: number | null;
  // vendedor da última compra — null só faz sentido junto de
  // diasSemComprar: null (cliente sem histórico de compra nenhuma).
  codigoVendedor: number | null;
}

// clientes: visível a qualquer usuário autenticado (não filtrado por
// vendedor) — mas a aba Clientes filtra por codigoVendedor na hora de
// listar (ver mockRepository.getClientesInatividade).
export const clientesSeed: ClienteSeed[] = [
  { codigo: 1, nome: 'Marcos Andrade', telefone: '(11) 91234-5678', diasSemComprar: 3, codigoVendedor: 101 },
  { codigo: 2, nome: 'Fernanda Costa', telefone: '(11) 92345-6789', diasSemComprar: 12, codigoVendedor: 102 },
  { codigo: 3, nome: 'Roberto Nunes', telefone: '(11) 93456-7890', diasSemComprar: 75, codigoVendedor: 103 },
  { codigo: 4, nome: 'Juliana Alves', telefone: '(11) 94567-8901', diasSemComprar: 1, codigoVendedor: 101 },
  { codigo: 5, nome: 'Paulo Ribeiro', telefone: '(11) 95678-9012', diasSemComprar: 120, codigoVendedor: 104 },
  { codigo: 6, nome: 'Camila Rocha', telefone: '(11) 96789-0123', diasSemComprar: 45, codigoVendedor: 102 },
  { codigo: 7, nome: 'Eduardo Martins', telefone: '(11) 97890-1234', diasSemComprar: null, codigoVendedor: null },
  { codigo: 8, nome: 'Beatriz Gomes', telefone: '(11) 98901-2345', diasSemComprar: 8, codigoVendedor: 103 },
];

// ============================================================
// PRODUTOS — promoções e itens que exigem receita médica.
// ============================================================
export const produtosSeed: Produto[] = [
  { codigo: 1001, nome: 'Dipirona 500mg', precoAtual: 8.9, precoAnterior: null, emPromocao: false, percentualDesconto: null, exigeReceita: false, tipoReceita: null },
  { codigo: 1002, nome: 'Paracetamol 750mg', precoAtual: 7.14, precoAnterior: 8.4, emPromocao: true, percentualDesconto: 15, exigeReceita: false, tipoReceita: null },
  { codigo: 1003, nome: 'Amoxicilina 500mg', precoAtual: 24.9, precoAnterior: null, emPromocao: false, percentualDesconto: null, exigeReceita: true, tipoReceita: 'antimicrobiano' },
  { codigo: 1004, nome: 'Losartana 50mg', precoAtual: 15.21, precoAnterior: 16.9, emPromocao: true, percentualDesconto: 10, exigeReceita: true, tipoReceita: 'comum' },
  { codigo: 1005, nome: 'Omeprazol 20mg', precoAtual: 12.5, precoAnterior: null, emPromocao: false, percentualDesconto: null, exigeReceita: false, tipoReceita: null },
  { codigo: 1006, nome: 'Rivotril 2mg', precoAtual: 32.4, precoAnterior: null, emPromocao: false, percentualDesconto: null, exigeReceita: true, tipoReceita: 'controle_especial' },
  { codigo: 1007, nome: 'Protetor Solar FPS 50', precoAtual: 47.92, precoAnterior: 59.9, emPromocao: true, percentualDesconto: 20, exigeReceita: false, tipoReceita: null },
  { codigo: 1008, nome: 'Vitamina C 1g', precoAtual: 18.68, precoAnterior: 24.9, emPromocao: true, percentualDesconto: 25, exigeReceita: false, tipoReceita: null },
  { codigo: 1009, nome: 'Metformina 850mg', precoAtual: 14.3, precoAnterior: null, emPromocao: false, percentualDesconto: null, exigeReceita: true, tipoReceita: 'comum' },
  { codigo: 1010, nome: 'Sertralina 50mg', precoAtual: 28.71, precoAnterior: 31.9, emPromocao: true, percentualDesconto: 10, exigeReceita: true, tipoReceita: 'controle_especial' },
  { codigo: 1011, nome: 'Fralda Geriátrica G', precoAtual: 33.91, precoAnterior: 39.9, emPromocao: true, percentualDesconto: 15, exigeReceita: false, tipoReceita: null },
  { codigo: 1012, nome: 'Shampoo Anticaspa', precoAtual: 22.5, precoAnterior: null, emPromocao: false, percentualDesconto: null, exigeReceita: false, tipoReceita: null },
  { codigo: 1013, nome: 'Azitromicina 500mg', precoAtual: 26.6, precoAnterior: 28.0, emPromocao: true, percentualDesconto: 5, exigeReceita: true, tipoReceita: 'antimicrobiano' },
  { codigo: 1014, nome: 'Multivitamínico', precoAtual: 20.93, precoAnterior: 29.9, emPromocao: true, percentualDesconto: 30, exigeReceita: false, tipoReceita: null },
  { codigo: 1015, nome: 'Insulina NPH', precoAtual: 45.0, precoAnterior: null, emPromocao: false, percentualDesconto: null, exigeReceita: true, tipoReceita: 'controle_especial' },
  { codigo: 1016, nome: 'Colírio Lubrificante', precoAtual: 16.2, precoAnterior: null, emPromocao: false, percentualDesconto: null, exigeReceita: false, tipoReceita: null },
];

export interface VendaItemDetalheSeed {
  id: string;
  diasAtras: number;
  codigoVendedor: number;
  codigoCliente: number;
  codigoProduto: number;
  quantidade: number;
  // pré-carregado como já resolvido, pra não nascer tudo pendente
  receitaAnexadaSeed?: boolean;
}

// Histórico de itens vendidos usado para: (1) montar a lista de quem já
// comprou um produto que agora entrou em promoção; (2) fila de receitas
// pendentes/anexadas dos produtos controlados.
export const vendaItensDetalheSeed: VendaItemDetalheSeed[] = [
  // Paracetamol (promo)
  { id: 'vi-1', diasAtras: 2, codigoVendedor: 101, codigoCliente: 1, codigoProduto: 1002, quantidade: 2 },
  { id: 'vi-2', diasAtras: 5, codigoVendedor: 102, codigoCliente: 4, codigoProduto: 1002, quantidade: 1 },
  { id: 'vi-3', diasAtras: 10, codigoVendedor: 101, codigoCliente: 7, codigoProduto: 1002, quantidade: 3 },

  // Losartana (promo + receita comum)
  { id: 'vi-4', diasAtras: 1, codigoVendedor: 103, codigoCliente: 2, codigoProduto: 1004, quantidade: 1, receitaAnexadaSeed: true },
  { id: 'vi-5', diasAtras: 6, codigoVendedor: 103, codigoCliente: 5, codigoProduto: 1004, quantidade: 1 },
  { id: 'vi-6', diasAtras: 20, codigoVendedor: 104, codigoCliente: 2, codigoProduto: 1004, quantidade: 1, receitaAnexadaSeed: true },

  // Protetor solar (promo)
  { id: 'vi-7', diasAtras: 3, codigoVendedor: 105, codigoCliente: 6, codigoProduto: 1007, quantidade: 1 },
  { id: 'vi-8', diasAtras: 8, codigoVendedor: 102, codigoCliente: 8, codigoProduto: 1007, quantidade: 2 },
  { id: 'vi-9', diasAtras: 15, codigoVendedor: 105, codigoCliente: 3, codigoProduto: 1007, quantidade: 1 },

  // Vitamina C (promo)
  { id: 'vi-10', diasAtras: 4, codigoVendedor: 101, codigoCliente: 4, codigoProduto: 1008, quantidade: 2 },
  { id: 'vi-11', diasAtras: 12, codigoVendedor: 104, codigoCliente: 6, codigoProduto: 1008, quantidade: 1 },

  // Sertralina (promo + receita controle especial)
  { id: 'vi-12', diasAtras: 7, codigoVendedor: 102, codigoCliente: 1, codigoProduto: 1010, quantidade: 1 },
  { id: 'vi-13', diasAtras: 18, codigoVendedor: 102, codigoCliente: 7, codigoProduto: 1010, quantidade: 1, receitaAnexadaSeed: true },

  // Fralda geriátrica (promo)
  { id: 'vi-14', diasAtras: 2, codigoVendedor: 103, codigoCliente: 5, codigoProduto: 1011, quantidade: 1 },
  { id: 'vi-15', diasAtras: 9, codigoVendedor: 105, codigoCliente: 3, codigoProduto: 1011, quantidade: 2 },
  { id: 'vi-16', diasAtras: 25, codigoVendedor: 101, codigoCliente: 8, codigoProduto: 1011, quantidade: 1 },

  // Multivitamínico (promo)
  { id: 'vi-17', diasAtras: 1, codigoVendedor: 104, codigoCliente: 6, codigoProduto: 1014, quantidade: 1 },
  { id: 'vi-18', diasAtras: 11, codigoVendedor: 103, codigoCliente: 2, codigoProduto: 1014, quantidade: 1 },

  // Amoxicilina (receita antimicrobiano)
  { id: 'vi-19', diasAtras: 0, codigoVendedor: 101, codigoCliente: 4, codigoProduto: 1003, quantidade: 1 },
  { id: 'vi-20', diasAtras: 3, codigoVendedor: 102, codigoCliente: 7, codigoProduto: 1003, quantidade: 1, receitaAnexadaSeed: true },
  { id: 'vi-21', diasAtras: 14, codigoVendedor: 101, codigoCliente: 1, codigoProduto: 1003, quantidade: 1 },

  // Rivotril (receita controle especial)
  { id: 'vi-22', diasAtras: 1, codigoVendedor: 103, codigoCliente: 5, codigoProduto: 1006, quantidade: 1 },
  { id: 'vi-23', diasAtras: 22, codigoVendedor: 103, codigoCliente: 5, codigoProduto: 1006, quantidade: 1, receitaAnexadaSeed: true },

  // Metformina (receita comum)
  { id: 'vi-24', diasAtras: 2, codigoVendedor: 104, codigoCliente: 2, codigoProduto: 1009, quantidade: 1 },
  { id: 'vi-25', diasAtras: 30, codigoVendedor: 104, codigoCliente: 2, codigoProduto: 1009, quantidade: 1, receitaAnexadaSeed: true },
  { id: 'vi-26', diasAtras: 5, codigoVendedor: 105, codigoCliente: 8, codigoProduto: 1009, quantidade: 1 },

  // Azitromicina (promo + receita antimicrobiano)
  { id: 'vi-27', diasAtras: 1, codigoVendedor: 102, codigoCliente: 3, codigoProduto: 1013, quantidade: 1 },
  { id: 'vi-28', diasAtras: 6, codigoVendedor: 104, codigoCliente: 6, codigoProduto: 1013, quantidade: 1 },

  // Insulina NPH (receita controle especial, uso contínuo)
  { id: 'vi-29', diasAtras: 0, codigoVendedor: 105, codigoCliente: 8, codigoProduto: 1015, quantidade: 1 },
  { id: 'vi-30', diasAtras: 16, codigoVendedor: 101, codigoCliente: 8, codigoProduto: 1015, quantidade: 1, receitaAnexadaSeed: true },
];

export const TIPO_RECEITA_LABEL: Record<TipoReceita, string> = {
  comum: 'Receita comum',
  controle_especial: 'Receita de controle especial',
  antimicrobiano: 'Receita de antimicrobiano',
};

// ============================================================
// METAS — valores-padrão do mês corrente (o gestor pode
// sobrescrever pela tela de Metas; ver mockRepository).
// ============================================================
export interface MetaSeedEntry {
  codigoVendedor: number;
  valorMetaMensal: number;
  valoresMetaSemanal: [number, number, number, number];
}

export const metasSeedPadrao: MetaSeedEntry[] = [
  { codigoVendedor: 101, valorMetaMensal: 70000, valoresMetaSemanal: [16000, 17000, 17000, 20000] },
  { codigoVendedor: 102, valorMetaMensal: 85000, valoresMetaSemanal: [20000, 20000, 21000, 24000] },
  { codigoVendedor: 103, valorMetaMensal: 55000, valoresMetaSemanal: [13000, 13000, 13000, 16000] },
  { codigoVendedor: 104, valorMetaMensal: 75000, valoresMetaSemanal: [18000, 18000, 18000, 21000] },
  { codigoVendedor: 105, valorMetaMensal: 40000, valoresMetaSemanal: [9000, 9500, 9500, 12000] },
];

// Realizado ilustrativo do mês corrente, por semana — usado só pra
// calcular o progresso mostrado no Dashboard (não deriva de vendas
// reais porque o mock não tem um livro-razão do mês inteiro).
export interface RealizadoSeedEntry {
  codigoVendedor: number;
  realizadoSemanal: [number, number, number, number];
}

export const realizadoSeedPadrao: RealizadoSeedEntry[] = [
  { codigoVendedor: 101, realizadoSemanal: [15200, 16800, 14500, 5500] },
  { codigoVendedor: 102, realizadoSemanal: [19800, 21500, 20200, 7800] },
  { codigoVendedor: 103, realizadoSemanal: [11000, 12500, 13800, 4200] },
  { codigoVendedor: 104, realizadoSemanal: [17600, 16200, 19000, 6100] },
  { codigoVendedor: 105, realizadoSemanal: [8200, 9800, 9100, 3400] },
];

// ============================================================
// FAIXAS DE COMISSÃO — espelha a tabela `faixas_comissao` (editável no
// Supabase real, ver supabase/schema.sql). percentualMetaMin é o piso
// da faixa (inclusive); aplica-se a de maior piso que o percentual
// atingido alcança. Comissão só no fechamento MENSAL, não semanal/diário.
// ============================================================
export const faixasComissaoSeed: { percentualMetaMin: number; percentualComissao: number }[] = [
  { percentualMetaMin: 100, percentualComissao: 10 },
  { percentualMetaMin: 90, percentualComissao: 8 },
  { percentualMetaMin: 80, percentualComissao: 7 },
  { percentualMetaMin: 70, percentualComissao: 5 },
  { percentualMetaMin: 0, percentualComissao: 3 },
];

// ============================================================
// CHECKLIST DIÁRIO — atividades padrão cadastradas pelo gestor.
// ============================================================
export interface AtividadeChecklistSeed {
  id: string;
  titulo: string;
  horario: string | null;
  ativo: boolean;
  codigosVendedor: number[];
  nomesVendedores: string[];
  diasSemana: number[];
}

// horario dispara lembrete push nos dias marcados em diasSemana (ver
// src/lib/notifications.ts). diasSemana usa domingo=1...sábado=7 —
// default segunda a sábado, igual o comportamento fixo de antes desse
// campo existir. codigosVendedor vazio = vale pra todo mundo.
const DIAS_SEGUNDA_A_SABADO = [2, 3, 4, 5, 6, 7];
export const atividadesChecklistSeed: AtividadeChecklistSeed[] = [
  { id: 'chk-1', titulo: 'Conferir temperatura da geladeira de medicamentos', horario: '08:00', ativo: true, codigosVendedor: [], nomesVendedores: [], diasSemana: DIAS_SEGUNDA_A_SABADO },
  { id: 'chk-2', titulo: 'Organizar prateleira de produtos em promoção', horario: '09:00', ativo: true, codigosVendedor: [], nomesVendedores: [], diasSemana: DIAS_SEGUNDA_A_SABADO },
  { id: 'chk-3', titulo: 'Verificar validade dos produtos em destaque no balcão', horario: '14:00', ativo: true, codigosVendedor: [], nomesVendedores: [], diasSemana: DIAS_SEGUNDA_A_SABADO },
  { id: 'chk-4', titulo: 'Repor sacolas e materiais no caixa', horario: '17:00', ativo: true, codigosVendedor: [], nomesVendedores: [], diasSemana: DIAS_SEGUNDA_A_SABADO },
  { id: 'chk-5', titulo: 'Higienizar balcão de atendimento', horario: '18:00', ativo: true, codigosVendedor: [], nomesVendedores: [], diasSemana: DIAS_SEGUNDA_A_SABADO },
];

// ============================================================
// CATÁLOGO DE PRODUTOS (Campanhas/Cartazetes) — espelha o que o
// ProdutoIntegracaoDto real da Trier traria (nome, custo, estoque,
// categoria, marca/laboratório, código de barras). Enquanto não tem
// token liberado, é mock; a estrutura já é a que o coletor real vai
// popular em `produto_catalogo` (ver supabase/schema.sql).
//
// Os 5 últimos itens (Fralda Pampers Pants Giga) usam os mesmos
// códigos de barras do docs/txt.txt de referência, de propósito —
// é o exemplo real que motivou o agrupamento por variante.
// ============================================================
export const catalogoProdutosSeed: ProdutoCatalogo[] = [
  { codigo: 2001, codigoBarras: '7891058109254', nome: 'Dipirona Gotas 10ml', categoria: 'Medicamentos', marca: 'EMS', precoVenda: 9.90, custoMedio: 5.20, estoqueAtual: 120 },
  { codigo: 2002, codigoBarras: '7896004704507', nome: 'Vitamina D3 2000UI 60cáps', categoria: 'Suplementos', marca: 'Sundown', precoVenda: 42.90, custoMedio: 22.00, estoqueAtual: 35 },
  { codigo: 2003, codigoBarras: '7891350037773', nome: 'Protetor Solar FPS70 120ml', categoria: 'Dermocosméticos', marca: 'Sundown', precoVenda: 68.90, custoMedio: 38.00, estoqueAtual: 18 },
  { codigo: 2004, codigoBarras: '7500435123456', nome: 'Escova Dental Macia', categoria: 'Higiene Bucal', marca: 'Oral-B', precoVenda: 12.50, custoMedio: 6.00, estoqueAtual: 200 },
  { codigo: 2005, codigoBarras: '7891024131253', nome: 'Fio Dental 50m', categoria: 'Higiene Bucal', marca: 'Colgate', precoVenda: 8.90, custoMedio: 4.10, estoqueAtual: 150 },
  { codigo: 2006, codigoBarras: '7896098900014', nome: 'Álcool Gel 500ml', categoria: 'Higiene', marca: 'Asfar', precoVenda: 14.90, custoMedio: 7.50, estoqueAtual: 90 },
  { codigo: 2007, codigoBarras: '7891010511016', nome: 'Curativo Band-Aid 20un', categoria: 'Primeiros Socorros', marca: 'J&J', precoVenda: 15.90, custoMedio: 8.00, estoqueAtual: 60 },
  { codigo: 2008, codigoBarras: '7898950627148', nome: 'Termômetro Digital', categoria: 'Equipamentos', marca: 'G-Tech', precoVenda: 29.90, custoMedio: 16.00, estoqueAtual: 25 },
  { codigo: 2009, codigoBarras: '7898930910019', nome: 'Colágeno Hidrolisado 300g', categoria: 'Suplementos', marca: 'Nutrated', precoVenda: 79.90, custoMedio: 45.00, estoqueAtual: 12 },
  { codigo: 2010, codigoBarras: '7891350900718', nome: 'Sabonete Líquido Íntimo 200ml', categoria: 'Higiene', marca: 'Nívea', precoVenda: 24.90, custoMedio: 13.00, estoqueAtual: 40 },
  { codigo: 2011, codigoBarras: '7896183301024', nome: 'Repelente Spray 100ml', categoria: 'Dermocosméticos', marca: 'Exposis', precoVenda: 34.90, custoMedio: 19.00, estoqueAtual: 22 },
  { codigo: 2012, codigoBarras: '7891350031733', nome: 'Creme Hidratante Corporal 400ml', categoria: 'Dermocosméticos', marca: 'Nívea', precoVenda: 32.90, custoMedio: 17.50, estoqueAtual: 55 },
  { codigo: 2013, codigoBarras: '7891010131207', nome: 'Absorvente Noturno 8un', categoria: 'Higiene', marca: 'Sempre Livre', precoVenda: 11.90, custoMedio: 6.00, estoqueAtual: 130 },
  { codigo: 2014, codigoBarras: '7500435228756', nome: 'Shampoo Anticaspa 200ml', categoria: 'Cabelos', marca: 'Head & Shoulders', precoVenda: 27.90, custoMedio: 15.00, estoqueAtual: 44 },
  { codigo: 2015, codigoBarras: '7500435228763', nome: 'Condicionador Reparador 200ml', categoria: 'Cabelos', marca: 'Pantene', precoVenda: 26.90, custoMedio: 14.50, estoqueAtual: 38 },
  { codigo: 2016, codigoBarras: '3700010123456', nome: 'Multivitamínico Infantil 30un', categoria: 'Suplementos', marca: 'Centrum', precoVenda: 45.90, custoMedio: 27.00, estoqueAtual: 8 },
  { codigo: 2017, codigoBarras: '7896422500019', nome: 'Ibuprofeno 400mg 20cp', categoria: 'Medicamentos', marca: 'Medley', precoVenda: 18.90, custoMedio: 10.50, estoqueAtual: 70 },
  { codigo: 2018, codigoBarras: '7896004700141', nome: 'Omeprazol 20mg 28cp', categoria: 'Medicamentos', marca: 'EMS', precoVenda: 16.90, custoMedio: 9.00, estoqueAtual: 90 },
  { codigo: 2019, codigoBarras: '7891106902013', nome: 'Colírio Lubrificante 15ml', categoria: 'Medicamentos', marca: 'Allergan', precoVenda: 22.90, custoMedio: 12.00, estoqueAtual: 30 },
  { codigo: 2020, codigoBarras: '7891150017525', nome: 'Sabonete Barra Dermatológico 90g', categoria: 'Dermocosméticos', marca: 'Dove', precoVenda: 6.90, custoMedio: 3.20, estoqueAtual: 180 },
  { codigo: 2021, codigoBarras: '7891350029210', nome: 'Protetor Labial FPS15', categoria: 'Dermocosméticos', marca: 'Nívea', precoVenda: 9.90, custoMedio: 4.50, estoqueAtual: 65 },
  { codigo: 2022, codigoBarras: '7896183401021', nome: 'Fralda Geriátrica G 8un', categoria: 'Higiene', marca: 'Bigfral', precoVenda: 38.90, custoMedio: 24.00, estoqueAtual: 15 },
  { codigo: 2023, codigoBarras: '3401390232017', nome: 'Água Micelar 200ml', categoria: 'Dermocosméticos', marca: 'Bioderma', precoVenda: 89.90, custoMedio: 55.00, estoqueAtual: 6 },
  { codigo: 2024, codigoBarras: '7896336090011', nome: 'Whey Protein 900g', categoria: 'Suplementos', marca: 'Growth', precoVenda: 129.90, custoMedio: 78.00, estoqueAtual: 10 },
  { codigo: 2025, codigoBarras: '7500435146470', nome: 'Fralda Pampers Pants Giga M84', categoria: 'Bebês', marca: 'Pampers', precoVenda: 94.90, custoMedio: 62.00, estoqueAtual: 20 },
  { codigo: 2026, codigoBarras: '7500435146487', nome: 'Fralda Pampers Pants Giga G72', categoria: 'Bebês', marca: 'Pampers', precoVenda: 94.90, custoMedio: 62.00, estoqueAtual: 18 },
  { codigo: 2027, codigoBarras: '7500435146494', nome: 'Fralda Pampers Pants Giga XG66', categoria: 'Bebês', marca: 'Pampers', precoVenda: 94.90, custoMedio: 62.00, estoqueAtual: 14 },
  { codigo: 2028, codigoBarras: '7500435146500', nome: 'Fralda Pampers Pants Giga XXG60', categoria: 'Bebês', marca: 'Pampers', precoVenda: 94.90, custoMedio: 62.00, estoqueAtual: 9 },
  { codigo: 2029, codigoBarras: '7500435246637', nome: 'Fralda Pampers Pants Giga XXXG54', categoria: 'Bebês', marca: 'Pampers', precoVenda: 94.90, custoMedio: 62.00, estoqueAtual: 5 },
];

export interface VendaRecenteSeedEntry {
  codigoProduto: number;
  quantidadeVendida30d: number;
  diasSemVenda: number | null;
}

// Sinal de popularidade/giro usado pelo algoritmo de sugestão — no
// real, isso viria de uma agregação sobre venda_itens dos últimos 30
// dias (igual já fazemos pra métricas de vendedor).
export const vendaRecenteSeed: VendaRecenteSeedEntry[] = [
  { codigoProduto: 2001, quantidadeVendida30d: 85, diasSemVenda: 0 },
  { codigoProduto: 2002, quantidadeVendida30d: 22, diasSemVenda: 1 },
  { codigoProduto: 2003, quantidadeVendida30d: 40, diasSemVenda: 0 },
  { codigoProduto: 2004, quantidadeVendida30d: 60, diasSemVenda: 0 },
  { codigoProduto: 2005, quantidadeVendida30d: 35, diasSemVenda: 2 },
  { codigoProduto: 2006, quantidadeVendida30d: 50, diasSemVenda: 0 },
  { codigoProduto: 2007, quantidadeVendida30d: 15, diasSemVenda: 5 },
  { codigoProduto: 2008, quantidadeVendida30d: 6, diasSemVenda: 10 },
  { codigoProduto: 2009, quantidadeVendida30d: 9, diasSemVenda: 3 },
  { codigoProduto: 2010, quantidadeVendida30d: 18, diasSemVenda: 1 },
  { codigoProduto: 2011, quantidadeVendida30d: 5, diasSemVenda: 20 },
  { codigoProduto: 2012, quantidadeVendida30d: 28, diasSemVenda: 1 },
  { codigoProduto: 2013, quantidadeVendida30d: 70, diasSemVenda: 0 },
  { codigoProduto: 2014, quantidadeVendida30d: 24, diasSemVenda: 2 },
  { codigoProduto: 2015, quantidadeVendida30d: 20, diasSemVenda: 2 },
  { codigoProduto: 2016, quantidadeVendida30d: 4, diasSemVenda: 15 },
  { codigoProduto: 2017, quantidadeVendida30d: 45, diasSemVenda: 0 },
  { codigoProduto: 2018, quantidadeVendida30d: 55, diasSemVenda: 0 },
  { codigoProduto: 2019, quantidadeVendida30d: 12, diasSemVenda: 4 },
  { codigoProduto: 2020, quantidadeVendida30d: 90, diasSemVenda: 0 },
  { codigoProduto: 2021, quantidadeVendida30d: 33, diasSemVenda: 1 },
  { codigoProduto: 2022, quantidadeVendida30d: 10, diasSemVenda: 6 },
  { codigoProduto: 2023, quantidadeVendida30d: 3, diasSemVenda: 25 },
  { codigoProduto: 2024, quantidadeVendida30d: 7, diasSemVenda: 8 },
  { codigoProduto: 2025, quantidadeVendida30d: 16, diasSemVenda: 1 },
  { codigoProduto: 2026, quantidadeVendida30d: 18, diasSemVenda: 0 },
  { codigoProduto: 2027, quantidadeVendida30d: 14, diasSemVenda: 1 },
  { codigoProduto: 2028, quantidadeVendida30d: 9, diasSemVenda: 2 },
  { codigoProduto: 2029, quantidadeVendida30d: 5, diasSemVenda: 3 },
];

export interface FornecedorSeed {
  codigo: number;
  nomeFantasia: string;
}

export const fornecedoresSeed: FornecedorSeed[] = [
  { codigo: 501, nomeFantasia: 'Distribuidora Central' },
  { codigo: 502, nomeFantasia: 'Farma União Distribuição' },
  { codigo: 503, nomeFantasia: 'MedSupply Brasil' },
];

export interface CompraInfoSeedEntry {
  codigoProduto: number;
  codigoFornecedor: number;
  fatorCompra: number; // unidades por caixa/pacote de compra do fornecedor
}

// Simula o que vw_produto_fornecedor_recente calcularia no real: o
// fornecedor e o fator de compra usados na compra mais recente de cada
// produto — não é um cadastro à parte (a API não expõe isso).
export const compraInfoSeed: CompraInfoSeedEntry[] = [
  { codigoProduto: 2001, codigoFornecedor: 501, fatorCompra: 20 },
  { codigoProduto: 2002, codigoFornecedor: 502, fatorCompra: 6 },
  { codigoProduto: 2003, codigoFornecedor: 503, fatorCompra: 6 },
  { codigoProduto: 2004, codigoFornecedor: 501, fatorCompra: 24 },
  { codigoProduto: 2005, codigoFornecedor: 501, fatorCompra: 24 },
  { codigoProduto: 2006, codigoFornecedor: 502, fatorCompra: 12 },
  { codigoProduto: 2007, codigoFornecedor: 501, fatorCompra: 12 },
  { codigoProduto: 2008, codigoFornecedor: 503, fatorCompra: 5 },
  { codigoProduto: 2009, codigoFornecedor: 502, fatorCompra: 6 },
  { codigoProduto: 2010, codigoFornecedor: 503, fatorCompra: 12 },
  { codigoProduto: 2011, codigoFornecedor: 502, fatorCompra: 6 },
  { codigoProduto: 2012, codigoFornecedor: 503, fatorCompra: 6 },
  { codigoProduto: 2013, codigoFornecedor: 501, fatorCompra: 12 },
  { codigoProduto: 2014, codigoFornecedor: 503, fatorCompra: 6 },
  { codigoProduto: 2015, codigoFornecedor: 503, fatorCompra: 6 },
  { codigoProduto: 2016, codigoFornecedor: 502, fatorCompra: 6 },
  { codigoProduto: 2017, codigoFornecedor: 501, fatorCompra: 20 },
  { codigoProduto: 2018, codigoFornecedor: 501, fatorCompra: 20 },
  { codigoProduto: 2019, codigoFornecedor: 502, fatorCompra: 10 },
  { codigoProduto: 2020, codigoFornecedor: 503, fatorCompra: 24 },
  { codigoProduto: 2021, codigoFornecedor: 503, fatorCompra: 12 },
  { codigoProduto: 2022, codigoFornecedor: 502, fatorCompra: 8 },
  { codigoProduto: 2023, codigoFornecedor: 503, fatorCompra: 6 },
  { codigoProduto: 2024, codigoFornecedor: 502, fatorCompra: 3 },
  { codigoProduto: 2025, codigoFornecedor: 502, fatorCompra: 8 },
  { codigoProduto: 2026, codigoFornecedor: 502, fatorCompra: 8 },
  { codigoProduto: 2027, codigoFornecedor: 502, fatorCompra: 8 },
  { codigoProduto: 2028, codigoFornecedor: 502, fatorCompra: 8 },
  { codigoProduto: 2029, codigoFornecedor: 502, fatorCompra: 8 },
];

// credenciais de demonstração (login mock) — todas com a senha abaixo.
export const MOCK_PASSWORD = '123456';
export const GESTOR_EMAIL = 'gestor@farmacia.com';
