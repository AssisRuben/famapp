import { MotivoClassificacaoCompra } from '../types/domain';

export const ORDEM_MOTIVOS_CLASSIFICACAO: MotivoClassificacaoCompra[] = ['outro_laboratorio', 'ja_comprado', 'outros'];

export const MOTIVO_CLASSIFICACAO_LABEL: Record<MotivoClassificacaoCompra, string> = {
  outro_laboratorio: 'Pedido de outro laboratório',
  ja_comprado: 'Já comprado',
  outros: 'Outros',
};
