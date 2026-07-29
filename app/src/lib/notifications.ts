import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { AtividadeChecklist } from '../types/domain';

// Segunda a sábado — expo-notifications numera domingo=1 ... sábado=7.
const DIAS_SEGUNDA_A_SABADO = [2, 3, 4, 5, 6, 7];
const PREFIXO_ID = 'checklist';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function idNotificacao(atividadeId: string, weekday: number): string {
  return `${PREFIXO_ID}-${atividadeId}-${weekday}`;
}

function parseHorario(horario: string): { hour: number; minute: number } | null {
  const [horaStr, minutoStr] = horario.split(':');
  const hour = Number(horaStr);
  const minute = Number(minutoStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

// Reagenda (cancelando as antigas) um lembrete push por atividade ativa,
// de segunda a sábado, no horário cadastrado pelo gestor. Notificações
// locais agendadas não são suportadas no navegador — no-op no web.
export async function sincronizarNotificacoesChecklist(atividades: AtividadeChecklist[]): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const permissaoAtual = await Notifications.getPermissionsAsync();
    if (!permissaoAtual.granted) {
      const solicitada = await Notifications.requestPermissionsAsync();
      if (!solicitada.granted) return;
    }

    const agendadas = await Notifications.getAllScheduledNotificationsAsync();
    const idsChecklist = agendadas
      .map((n) => n.identifier)
      .filter((id) => id.startsWith(`${PREFIXO_ID}-`));
    await Promise.all(idsChecklist.map((id) => Notifications.cancelScheduledNotificationAsync(id)));

    const ativosComHorario = atividades.filter((a) => a.ativo && a.horario);

    for (const atividade of ativosComHorario) {
      const horario = parseHorario(atividade.horario!);
      if (!horario) continue;

      for (const weekday of DIAS_SEGUNDA_A_SABADO) {
        await Notifications.scheduleNotificationAsync({
          identifier: idNotificacao(atividade.id, weekday),
          content: {
            title: 'Checklist do dia — Farmácias Conviva',
            body: `${atividade.horario} · ${atividade.titulo}`,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour: horario.hour,
            minute: horario.minute,
          },
        });
      }
    }
  } catch {
    // notificações são um "nice to have" — falha aqui nunca deve
    // quebrar o carregamento do checklist em si.
  }
}
