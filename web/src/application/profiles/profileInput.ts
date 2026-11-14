import { GAME_NAME_MAX, GAME_NAME_MIN, isSensitivePackage, isValidPackage } from '@domain/game/Game';
import { DESCRIPTION_MAX, isValidDeviceModel, TITLE_MAX, TITLE_MIN } from '@domain/profile/GameProfile';
import { validateConf } from '@domain/profile/conf/validateConf';
import { AppError } from '@domain/shared/AppError';
import { cleanLine, cleanText } from '@domain/shared/text';

/** Valida en el navegador lo mismo que valida el servidor (respuesta inmediata al usuario). */
export function checkTitle(title: string): string {
  return cleanLine(title, TITLE_MIN, TITLE_MAX, 'título');
}

export function checkDescription(description: string): string {
  return cleanText(description, DESCRIPTION_MAX, 'descripción');
}

export function checkGameName(name: string): string {
  return cleanLine(name, GAME_NAME_MIN, GAME_NAME_MAX, 'juego');
}

export function checkPackage(packageName: string): string {
  const value = packageName.trim();
  if (!isValidPackage(value)) {
    throw new AppError('INVALID_INPUT', 'El paquete del juego no es válido (ejemplo: com.empresa.juego).');
  }
  if (isSensitivePackage(value)) {
    throw new AppError('INVALID_INPUT', 'No se admiten perfiles para apps del sistema, tiendas, ajustes ni herramientas de root.');
  }
  return value;
}

export function checkConf(conf: string, packageName?: string): string {
  const result = validateConf(conf, packageName);
  if (!result.ok) throw new AppError('INVALID_INPUT', result.error);
  return result.normalized;
}

/** Modelo del telefono: opcional ('' = sin indicar). */
export function checkDeviceModel(model: string): string {
  const value = model.replace(/\s+/g, ' ').trim();
  if (value !== '' && !isValidDeviceModel(value)) {
    throw new AppError('INVALID_INPUT', 'El modelo del teléfono solo admite letras, números y . _ ( ) + / - (2 a 60 caracteres).');
  }
  return value;
}
