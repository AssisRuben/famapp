import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

interface SeletorHorarioProps {
  visible: boolean;
  onClose: () => void;
  onConfirmar: (horario: string) => void;
  // "HH:mm" — abre já com essa hora selecionada, se tiver.
  valorInicial?: string;
}

const HORAS = Array.from({ length: 24 }, (_, i) => i);
// Passo de 5 min — granularidade suficiente pra um lembrete, sem
// precisar rolar por 60 opções (mesma ideia de UX simples do
// CalendarioPeriodo, sem dependência nativa).
const MINUTOS = Array.from({ length: 12 }, (_, i) => i * 5);

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseHorario(horario: string | undefined): { hora: number; minuto: number } {
  const [h, m] = (horario ?? '').split(':').map(Number);
  const horaValida = Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 9;
  const minutoValido = Number.isFinite(m) ? Math.min(55, Math.max(0, Math.round(m / 5) * 5)) : 0;
  return { hora: horaValida, minuto: minutoValido };
}

export function SeletorHorario({ visible, onClose, onConfirmar, valorInicial }: SeletorHorarioProps) {
  const [{ hora, minuto }, setSelecao] = useState(() => parseHorario(valorInicial));

  // Componente fica sempre montado (padrão do CalendarioPeriodo, só
  // `visible` alterna) — sem isso, reabrir não refletiria um
  // valorInicial diferente do que foi selecionado da última vez.
  useEffect(() => {
    if (visible) setSelecao(parseHorario(valorInicial));
  }, [visible, valorInicial]);

  const confirmar = () => {
    onConfirmar(`${pad2(hora)}:${pad2(minuto)}`);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.fundo} onPress={onClose}>
        <Pressable style={styles.cartao} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.titulo}>Escolher horário</Text>

          <View style={styles.colunasRow}>
            <ScrollView style={styles.coluna} showsVerticalScrollIndicator={false}>
              {HORAS.map((h) => (
                <Pressable
                  key={h}
                  style={[styles.opcao, h === hora && styles.opcaoSelecionada]}
                  onPress={() => setSelecao((atual) => ({ ...atual, hora: h }))}
                >
                  <Text style={[styles.opcaoTexto, h === hora && styles.opcaoTextoSelecionado]}>{pad2(h)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.doisPontos}>:</Text>
            <ScrollView style={styles.coluna} showsVerticalScrollIndicator={false}>
              {MINUTOS.map((m) => (
                <Pressable
                  key={m}
                  style={[styles.opcao, m === minuto && styles.opcaoSelecionada]}
                  onPress={() => setSelecao((atual) => ({ ...atual, minuto: m }))}
                >
                  <Text style={[styles.opcaoTexto, m === minuto && styles.opcaoTextoSelecionado]}>{pad2(m)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <Text style={styles.resumoSelecao}>{pad2(hora)}:{pad2(minuto)}</Text>

          <View style={styles.botoesRow}>
            <Pressable style={styles.botaoCancelar} onPress={onClose}>
              <Text style={styles.botaoCancelarTexto}>Cancelar</Text>
            </Pressable>
            <Pressable style={styles.botaoConfirmar} onPress={confirmar}>
              <Text style={styles.botaoConfirmarTexto}>Aplicar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const ALTURA_COLUNA = 160;

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  cartao: { backgroundColor: colors.white, borderRadius: 16, padding: 18, width: '80%', maxWidth: 300 },
  titulo: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 14, textAlign: 'center' },
  colunasRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  coluna: { height: ALTURA_COLUNA, width: 64 },
  doisPontos: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  opcao: { paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  opcaoSelecionada: { backgroundColor: colors.navy },
  opcaoTexto: { fontSize: 15, color: colors.textPrimary, fontWeight: '600' },
  opcaoTextoSelecionado: { color: colors.white },
  resumoSelecao: { fontSize: 20, fontWeight: '700', color: colors.navy, textAlign: 'center', marginTop: 14 },
  botoesRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  botaoCancelar: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  botaoCancelarTexto: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  botaoConfirmar: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: colors.navy },
  botaoConfirmarTexto: { color: colors.white, fontWeight: '700', fontSize: 13 },
});
