import type { NewProfile, ProfileRepository } from '../ports/ProfileRepository';
import { checkConf, checkDescription, checkDeviceModel, checkGameName, checkPackage, checkTitle } from './profileInput';

export class PublishProfile {
  readonly #profiles: ProfileRepository;

  constructor(profiles: ProfileRepository) {
    this.#profiles = profiles;
  }

  /** Devuelve el id del perfil publicado. */
  execute(input: NewProfile): Promise<string> {
    const packageName = checkPackage(input.packageName);
    return this.#profiles.publish({
      packageName,
      gameName: checkGameName(input.gameName),
      title: checkTitle(input.title),
      description: checkDescription(input.description),
      conf: checkConf(input.conf, packageName),
      deviceModel: checkDeviceModel(input.deviceModel),
    });
  }
}
