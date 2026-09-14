/**
 * Provedores conhecidos.
 *
 * Acrescentar um: escrever o adaptador e pôr na lista. É o único lugar do app
 * que sabe quais existem.
 */

import { anthropic } from './anthropic.js';
import { openai } from './openai.js';
import type { Provider } from './types.js';

export const PROVIDERS: readonly Provider[] = [openai, anthropic];

export function providerById(id: string): Provider | null {
  return PROVIDERS.find((provider) => provider.id === id) ?? null;
}
