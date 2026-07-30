import { DataRepository } from './repository';
import { supabaseRepository } from './supabase/supabaseRepository';

// Frente 2: Supabase real. Login só funciona depois de criar usuários
// no Supabase Auth + linha em `profiles` pra cada um (ver README,
// "Status atual / pendências") — sem isso, login falha com "Usuário
// sem perfil cadastrado". Pra voltar ao mock: troque a linha abaixo por
// `import { mockRepository } from './mock/mockRepository';` e
// `export const repository: DataRepository = mockRepository;`.
export const repository: DataRepository = supabaseRepository;
