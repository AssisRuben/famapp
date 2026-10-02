// Regras do card "Cliente de alto valor sumindo" (Alertas).
//
// [01/10/2026] Medição de setembro mostrou que o contato, do jeito que
// era feito, não trazia cliente de volta: com o mesmo tempo sem comprar,
// contatado voltou igual ou menos que não contatado. Mudanças:
//  - teto de 180 dias e fora quem comprou uma vez só (quase nunca volta);
//  - mensagem cita o produto que o cliente costumava levar;
//  - 20% dos clientes ficam fora da lista por mês (grupo de controle),
//    pra medir no fim do mês se a abordagem nova funciona
//    (supabase/consulta_teste_resgate_alto_valor.sql).

export const CLIENTE_SUMIU_DIAS = 60;
export const CLIENTE_SUMIU_MAX_DIAS = 180;
export const MIN_COMPRAS_RESGATE = 2;

// Espelho EXATO de fn_resgate_grupo_controle em
// supabase/migracao_resgate_alto_valor.sql — se mudar um, muda o outro,
// senão a medição compara grupos errados. Muda todo mês (ano*12+mes).
export function noGrupoControleResgate(codigoCliente: number, data: Date = new Date()): boolean {
  const ano = data.getFullYear();
  const mes = data.getMonth() + 1;
  return (codigoCliente * 37 + ano * 12 + mes) % 5 === 0;
}

// Nome do catálogo vem abreviado e em maiúsculo ("FR CONFORT AD G 30UN");
// deixa legível pra mensagem sem tentar expandir abreviação.
export function nomeProdutoLegivel(nome: string): string {
  return nome
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(' ');
}

export function mensagemResgate(nomeCliente: string, nomeVendedor: string, produto: string | null): string {
  const quem = nomeVendedor ? `Aqui é ${nomeVendedor} da Farmácia Conviva Parquelândia 💊` : 'Aqui é da Farmácia Conviva Parquelândia 💊';
  if (produto) {
    return `Olá, ${nomeCliente}! ${quem} Faz um tempinho que você não leva o seu ${nomeProdutoLegivel(produto)} com a gente. Quer que eu separe pra você?`;
  }
  return `Olá, ${nomeCliente}! ${quem} Faz um tempinho que não te vemos por aqui. Posso separar alguma coisa pra você?`;
}
