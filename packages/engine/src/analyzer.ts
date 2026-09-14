/**
 * Memoização da camada 2.
 *
 * `analyzeWord` é pura; o cache fica aqui, num objeto que o chamador cria e
 * controla. Assim o motor continua sem estado global — dois documentos abertos
 * não compartilham cache sem que alguém tenha pedido.
 *
 * Justificativa de orçamento: a escansão de um verso roda a cada tecla, e a
 * maioria das palavras não mudou. Sem memo, o custo por tecla cresce com o
 * tamanho do verso; com memo, só a palavra sendo digitada é recalculada.
 */

import type { LanguageRules, WordScansion } from './types.js';

export interface WordAnalyzer {
  readonly language: LanguageRules;
  analyze(word: string): WordScansion;
  /** Número de entradas em cache. Existe para teste e diagnóstico. */
  readonly size: number;
  clear(): void;
}

export interface AnalyzerOptions {
  /** Teto do cache. Ao estourar, o cache é esvaziado por inteiro. */
  readonly maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 20_000;

export function createAnalyzer(language: LanguageRules, options: AnalyzerOptions = {}): WordAnalyzer {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const cache = new Map<string, WordScansion>();

  return {
    language,
    analyze(word: string): WordScansion {
      const hit = cache.get(word);
      if (hit !== undefined) return hit;
      const result = language.analyzeWord(word);
      if (cache.size >= maxEntries) cache.clear();
      cache.set(word, result);
      return result;
    },
    get size(): number {
      return cache.size;
    },
    clear(): void {
      cache.clear();
    },
  };
}
