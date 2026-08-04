import type * as NotificationsModule from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { AtividadeChecklist } from '../types/domain';

const PREFIXO_ID = 'checklist';

// Desde o SDK 53, só de IMPORTAR expo-notifications (mesmo sem chamar
// nada) ele já registra um listener de push internamente — e isso
// lança exceção dentro do Expo Go (só funciona em build nativo de
// verdade/dev build). Por isso o require precisa ser tardio (dentro
// de uma função), nunca um `import` estático no topo do arquivo —
// import estático roda na hora que o app abre, antes de qualquer
// guard dar tempo de agir.
const RODANDO_NO_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let notificationsModule: typeof NotificationsModule | null = null;
function carregarNotifications(): typeof NotificationsModule {
  if (!notificationsModule) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    notificationsModule = require('expo-notifications');
  }
  return notificationsModule!;
}

let handlerConfigurado = false;
function garantirHandlerConfigurado(): void {
  if (handlerConfigurado) return;
  const Notifications = carregarNotifications();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  handlerConfigurado = true;
}

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
// nos dias da semana e horário cadastrados pelo gestor (atividade.diasSemana
// — mesma numeração domingo=1...sábado=7 do expo-notifications, não
// precisa converter). Notificações locais agendadas não são suportadas
// no navegador — no-op no web, e também no-op no Expo Go (só funciona
// em dev build/build nativa).
export async function sincronizarNotificacoesChecklist(atividades: AtividadeChecklist[]): Promise<void> {
  if (Platform.OS === 'web' || RODANDO_NO_EXPO_GO) return;

  try {
    const Notifications = carregarNotifications();
    garantirHandlerConfigurado();

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

      for (const weekday of atividade.diasSemana) {
        await Notifications.scheduleNotificationAsync({
          identifier: idNotificacao(atividade.id, weekday),
          content: {
            title: 'Checklist do dia — Farmácia Conviva Parquelândia',
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
