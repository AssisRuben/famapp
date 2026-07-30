// Telefone BR sem DDI: DDD (2) + número (8 ou 9 dígitos) = 10-11
// dígitos. Com DDI: 12-13. Antes disso era `digits.startsWith('55')`
// pra decidir se já tinha DDI — quebrava pra qualquer cliente com DDD
// 55 (Santa Maria/RS, DDD real): um número local "55991234567" (DDD
// 55 + 9 dígitos) batia com o prefixo por coincidência, o DDI nunca
// era adicionado, e o link saía com 2 dígitos a menos do que deveria.
// Decidir pelo tamanho total evita esse falso positivo.
// Retorna null se o formato não bate com nenhum dos dois casos —
// chamador decide o que fazer (não tenta adivinhar um número inválido).
export function buildWhatsAppUrl(telefone: string, mensagem: string): string | null {
  const digits = telefone.replace(/\D/g, '');
  let comDdi: string;
  if (digits.length === 12 || digits.length === 13) {
    comDdi = digits;
  } else if (digits.length === 10 || digits.length === 11) {
    comDdi = `55${digits}`;
  } else {
    return null;
  }
  return `https://wa.me/${comDdi}?text=${encodeURIComponent(mensagem)}`;
}
