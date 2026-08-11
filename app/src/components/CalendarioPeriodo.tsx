import React, { useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { formatDateBR, todayISO } from '../lib/format';

interface CalendarioPeriodoProps {
  visible: boolean;
  onClose: () => void;
  onConfirmar: (dataInicio: string, dataFim: string) => void;
}

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const NOMES_MES_LONGO = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const ALTURA_CELULA = 40;
const LINHAS_GRADE = 6;
const COLUNAS_GRADE = 7;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function paraIso(ano: number, mes: number, dia: number): string {
  return `${ano}-${pad2(mes + 1)}-${pad2(dia)}`;
}

// Monta as 42 células (6 semanas x 7 dias) do mês visível — null nas
// pontas fora do mês e em dias futuros (sem dado de venda pra mostrar,
// então não fazem sentido escolher).
function montarGrade(ano: number, mes: number, hojeIso: string): (string | null)[] {
  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const celulas: (string | null)[] = [];

  for (let i = 0; i < primeiroDiaSemana; i++) celulas.push(null);
  for (let dia = 1; dia <= diasNoMes; dia++) {
    const iso = paraIso(ano, mes, dia);
    celulas.push(iso > hojeIso ? null : iso);
  }
  while (celulas.length < LINHAS_GRADE * COLUNAS_GRADE) celulas.push(null);

  return celulas;
}

export function CalendarioPeriodo({ visible, onClose, onConfirmar }: CalendarioPeriodoProps) {
  const hoje = new Date();
  const [mesVisivel, setMesVisivel] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() });
  const [ancora, setAncora] = useState<string | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const [larguraGrade, setLarguraGrade] = useState(0);

  const hojeIso = todayISO();
  const grade = useMemo(() => montarGrade(mesVisivel.ano, mesVisivel.mes, hojeIso), [mesVisivel, hojeIso]);

  const [inicio, fim] = ancora && foco ? [ancora, foco].sort() : [null, null];

  // PanResponder é criado só UMA vez (abaixo, via useRef) — os handlers
  // não "veem" novos valores de estado/props em renders seguintes por
  // closure normal. Refs resolvem isso: sempre leem o valor mais
  // recente, mesmo dentro de uma closure criada no primeiro render.
  const gradeRef = useRef(grade);
  gradeRef.current = grade;
  const larguraGradeRef = useRef(larguraGrade);
  larguraGradeRef.current = larguraGrade;

  const diaNaPosicao = (x: number, y: number): string | null => {
    const largura = larguraGradeRef.current;
    if (largura <= 0) return null;
    const larguraCelula = largura / COLUNAS_GRADE;
    const col = Math.min(COLUNAS_GRADE - 1, Math.max(0, Math.floor(x / larguraCelula)));
    const row = Math.min(LINHAS_GRADE - 1, Math.max(0, Math.floor(y / ALTURA_CELULA)));
    return gradeRef.current[row * COLUNAS_GRADE + col] ?? null;
  };

  // Um toque simples (sem arrastar) = dia único; pressionar e arrastar
  // pelos dias = período (o dia inicial fica "ancorado" e o final segue
  // o dedo, igual seleção de texto).
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const dia = diaNaPosicao(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        if (dia) {
          setAncora(dia);
          setFoco(dia);
        }
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const dia = diaNaPosicao(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
        if (dia) setFoco(dia);
      },
    })
  ).current;

  const trocarMes = (delta: number) => {
    setMesVisivel((atual) => {
      const data = new Date(atual.ano, atual.mes + delta, 1);
      return { ano: data.getFullYear(), mes: data.getMonth() };
    });
  };

  const limpar = () => {
    setAncora(null);
    setFoco(null);
  };

  const confirmar = () => {
    if (!inicio || !fim) return;
    onConfirmar(inicio, fim);
    limpar();
    onClose();
  };

  const fechar = () => {
    limpar();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={fechar}>
      <Pressable style={styles.fundo} onPress={fechar}>
        <Pressable style={styles.cartao} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.titulo}>Escolher período</Text>
          <Text style={styles.dica}>Toque um dia, ou arraste pelos dias pra escolher um período.</Text>

          <View style={styles.navegacaoMes}>
            <Pressable onPress={() => trocarMes(-1)} hitSlop={8}>
              <Ionicons name="chevron-back" size={22} color={colors.navy} />
            </Pressable>
            <Text style={styles.mesLabel}>
              {NOMES_MES_LONGO[mesVisivel.mes]} {mesVisivel.ano}
            </Text>
            <Pressable
              onPress={() => trocarMes(1)}
              hitSlop={8}
              disabled={mesVisivel.ano === hoje.getFullYear() && mesVisivel.mes === hoje.getMonth()}
            >
              <Ionicons
                name="chevron-forward"
                size={22}
                color={mesVisivel.ano === hoje.getFullYear() && mesVisivel.mes === hoje.getMonth() ? colors.textMuted : colors.navy}
              />
            </Pressable>
          </View>

          <View style={styles.semanaRow}>
            {DIAS_SEMANA.map((d, i) => (
              <Text key={i} style={styles.semanaLabel}>{d}</Text>
            ))}
          </View>

          <View
            style={styles.grade}
            onLayout={(e) => setLarguraGrade(e.nativeEvent.layout.width)}
            {...panResponder.panHandlers}
          >
            {grade.map((iso, i) => {
              const dentroDoIntervalo = !!(inicio && fim && iso && iso >= inicio && iso <= fim);
              const éPonta = iso === inicio || iso === fim;
              return (
                <View key={i} style={styles.celula}>
                  {iso && (
                    <View
                      style={[
                        styles.diaMarcador,
                        dentroDoIntervalo && styles.diaNoIntervalo,
                        éPonta && styles.diaPonta,
                      ]}
                    >
                      <Text style={[styles.diaTexto, éPonta && styles.diaTextoPonta]}>{Number(iso.slice(8, 10))}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          <Text style={styles.resumoSelecao}>
            {inicio && fim
              ? inicio === fim
                ? `Dia ${formatDateBR(inicio)}`
                : `${formatDateBR(inicio)} até ${formatDateBR(fim)}`
              : 'Nenhum dia escolhido ainda'}
          </Text>

          <View style={styles.botoesRow}>
            <Pressable style={styles.botaoCancelar} onPress={fechar}>
              <Text style={styles.botaoCancelarTexto}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[styles.botaoConfirmar, !(inicio && fim) && styles.botaoConfirmarDesabilitado]}
              onPress={confirmar}
              disabled={!(inicio && fim)}
            >
              <Text style={styles.botaoConfirmarTexto}>Aplicar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  cartao: { backgroundColor: colors.white, borderRadius: 16, padding: 18, width: '88%', maxWidth: 360 },
  titulo: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  dica: { fontSize: 12, color: colors.textMuted, marginTop: 4, marginBottom: 14, lineHeight: 16 },
  navegacaoMes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  mesLabel: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  semanaRow: { flexDirection: 'row' },
  semanaLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.textMuted },
  grade: { flexDirection: 'row', flexWrap: 'wrap' },
  celula: {
    width: `${100 / COLUNAS_GRADE}%`,
    height: ALTURA_CELULA,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaMarcador: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  diaNoIntervalo: { backgroundColor: '#DCE8F7' },
  diaPonta: { backgroundColor: colors.navy },
  diaTexto: { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },
  diaTextoPonta: { color: colors.white },
  resumoSelecao: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 12, fontWeight: '600' },
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
  botaoConfirmarDesabilitado: { backgroundColor: colors.border },
  botaoConfirmarTexto: { color: colors.white, fontWeight: '700', fontSize: 13 },
});
