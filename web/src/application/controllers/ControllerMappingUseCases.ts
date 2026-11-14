import { isMappingStatus, type ControllerMapping, type MappingStatus } from '@domain/controller/ControllerMapping';
import { parseSdlLine, sdlErrorText } from '@domain/controller/sdlMapping';
import { AppError } from '@domain/shared/AppError';
import type { ControllerMappingRepository } from '../ports/ControllerMappingRepository';
import { requireId } from '../shared/guards';

abstract class UseCase {
  protected readonly repo: ControllerMappingRepository;

  constructor(repo: ControllerMappingRepository) {
    this.repo = repo;
  }
}

/** Busqueda: solo letras, numeros, espacios y guiones (nada que interprete el servidor). */
export function cleanMappingSearch(search: string): string {
  return search.normalize('NFC').replace(/[^\p{L}\p{N} -]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
}

export class ListApprovedMappings extends UseCase {
  execute(input: { search?: string; limit?: number } = {}): Promise<readonly ControllerMapping[]> {
    return this.repo.listApproved(cleanMappingSearch(input.search ?? ''), Math.max(1, Math.min(100, input.limit ?? 100)));
  }
}

export class ListMyMappings extends UseCase {
  execute(authorId: string): Promise<readonly ControllerMapping[]> {
    return this.repo.listMine(requireId(authorId));
  }
}

export class SubmitMapping extends UseCase {
  /** Valida antes de enviar (la base de datos vuelve a validar) y envia la linea canonica. */
  execute(line: string): Promise<string> {
    const result = parseSdlLine(line);
    if (!result.ok) return Promise.reject(new AppError('INVALID_INPUT', sdlErrorText(result)));
    return this.repo.submit(result.value.mapping);
  }
}

export class DeleteMapping extends UseCase {
  execute(id: string): Promise<void> {
    return this.repo.remove(requireId(id));
  }
}

export class ListMappingsForReview extends UseCase {
  execute(status: MappingStatus = 'pending'): Promise<readonly ControllerMapping[]> {
    if (!isMappingStatus(status)) return Promise.reject(new AppError('INVALID_INPUT', 'Estado no válido.'));
    return this.repo.adminList(status);
  }
}

export class ReviewMapping extends UseCase {
  execute(input: { id: string; approve: boolean }): Promise<void> {
    return this.repo.review(requireId(input.id), input.approve);
  }
}
