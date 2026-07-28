import { DataRepository } from './repository';
import { mockRepository } from './mock/mockRepository';

// Frente 1: só o mock existe. Frente 2 troca esta linha por um
// SupabaseRepository (mesma interface DataRepository), sem tocar telas.
export const repository: DataRepository = mockRepository;
