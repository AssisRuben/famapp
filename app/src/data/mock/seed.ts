import { Produto, TipoReceita } from '../../types/domain';

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
}

// Valores fictícios de faturamento/desconto/comissão do dia, por vendedor.
export const metricasSeedHoje: MetricasSeed[] = [
  { codigoVendedor: 101, qtdNotas: 24, faturamentoLiquido: 3180.5, faturamentoBruto: 3420.0, totalDesconto: 239.5, comissaoEstimada: 127.22 },
  { codigoVendedor: 102, qtdNotas: 31, faturamentoLiquido: 4102.9, faturamentoBruto: 4390.0, totalDesconto: 287.1, comissaoEstimada: 164.12 },
  { codigoVendedor: 103, qtdNotas: 18, faturamentoLiquido: 2210.0, faturamentoBruto: 2450.0, totalDesconto: 240.0, comissaoEstimada: 88.4 },
  { codigoVendedor: 104, qtdNotas: 27, faturamentoLiquido: 3675.3, faturamentoBruto: 3800.0, totalDesconto: 124.7, comissaoEstimada: 147.01 },
  { codigoVendedor: 105, qtdNotas: 12, faturamentoLiquido: 1420.0, faturamentoBruto: 1600.0, totalDesconto: 180.0, comissaoEstimada: 56.8 },
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
}

// clientes: visível a qualquer usuário autenticado (não filtrado por vendedor).
export const clientesSeed: ClienteSeed[] = [
  { codigo: 1, nome: 'Marcos Andrade', telefone: '(11) 91234-5678', diasSemComprar: 3 },
  { codigo: 2, nome: 'Fernanda Costa', telefone: '(11) 92345-6789', diasSemComprar: 12 },
  { codigo: 3, nome: 'Roberto Nunes', telefone: '(11) 93456-7890', diasSemComprar: 75 },
  { codigo: 4, nome: 'Juliana Alves', telefone: '(11) 94567-8901', diasSemComprar: 1 },
  { codigo: 5, nome: 'Paulo Ribeiro', telefone: '(11) 95678-9012', diasSemComprar: 120 },
  { codigo: 6, nome: 'Camila Rocha', telefone: '(11) 96789-0123', diasSemComprar: 45 },
  { codigo: 7, nome: 'Eduardo Martins', telefone: '(11) 97890-1234', diasSemComprar: null },
  { codigo: 8, nome: 'Beatriz Gomes', telefone: '(11) 98901-2345', diasSemComprar: 8 },
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
// CHECKLIST DIÁRIO — atividades padrão cadastradas pelo gestor.
// ============================================================
export interface AtividadeChecklistSeed {
  id: string;
  titulo: string;
  ativo: boolean;
}

export const atividadesChecklistSeed: AtividadeChecklistSeed[] = [
  { id: 'chk-1', titulo: 'Conferir temperatura da geladeira de medicamentos', ativo: true },
  { id: 'chk-2', titulo: 'Organizar prateleira de produtos em promoção', ativo: true },
  { id: 'chk-3', titulo: 'Verificar validade dos produtos em destaque no balcão', ativo: true },
  { id: 'chk-4', titulo: 'Repor sacolas e materiais no caixa', ativo: true },
  { id: 'chk-5', titulo: 'Higienizar balcão de atendimento', ativo: true },
];

// credenciais de demonstração (login mock) — todas com a senha abaixo.
export const MOCK_PASSWORD = '123456';
export const GESTOR_EMAIL = 'gestor@farmacia.com';
