// Formata um valor numérico (reais) como "X,XX" — mesma formatação
// usada tanto pro valor inicial (antes do usuário digitar nada) quanto
// pelo resultado da máscara abaixo.
export function moedaParaTexto(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Máscara de valor monetário: os dígitos digitados preenchem sempre os
// centavos primeiro (ex.: digitar "1250" vira "12,50"), igual a
// qualquer campo de valor de app de banco/pagamento — sem precisar
// digitar a vírgula nem completar os dois zeros na mão. String vazia
// continua vazia (apagar tudo limpa o campo, não vira "0,00").
export function aplicarMascaraMoeda(textoDigitado: string): string {
  const digitos = textoDigitado.replace(/\D/g, '');
  if (digitos === '') return '';
  return moedaParaTexto(Number(digitos) / 100);
}
