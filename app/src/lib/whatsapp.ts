export function buildWhatsAppUrl(telefone: string, mensagem: string): string {
  const digits = telefone.replace(/\D/g, '');
  const comDdi = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${comDdi}?text=${encodeURIComponent(mensagem)}`;
}
