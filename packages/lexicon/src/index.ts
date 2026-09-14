/**
 * @escandir/lexicon — busca de palavras por forma métrica.
 *
 * Carrega sob demanda: o manifesto é minúsculo e cada consulta traz uma fatia
 * de ~12 KB comprimida. Quem pede rimas em `/aw/` nunca baixa as rimas em
 * `/ia/`, e a fatia buscada fica em memória para as consultas seguintes.
 *
 * Sem rede depois da primeira consulta por som, sem servidor, sem chave. É a
 * camada que funciona quando não há IA — e a mesma que a IA consulta.
 */

import { shardName, shardOf, type Manifest, type PackedEntry } from './shard.js';

export interface LexiconEntry {
  readonly word: string;
  /** Sílabas da palavra isolada, sem elisão com o que vier antes. */
  readonly syllables: number;
  /** Tônica contada do fim: 1 oxítona, 2 paroxítona, 3 proparoxítona. */
  readonly stressFromEnd: number;
  /** 0 muito comum … 5 só de dicionário. */
  readonly band: number;
}

export interface RhymeQuery {
  /** Chave fonêmica da terminação, vinda de `rhymeOf(...).sound`. */
  readonly sound: string;
  /** Só palavras com esta contagem de sílabas. */
  readonly syllables?: number;
  /** Só palavras com a tônica nesta posição contada do fim. */
  readonly stressFromEnd?: number;
  /** Palavras a não devolver — tipicamente as que o poema já usou. */
  readonly exclude?: readonly string[];
  readonly limit?: number;
}

const DEFAULT_LIMIT = 60;

function unpack(entry: PackedEntry): LexiconEntry {
  return { word: entry[0], syllables: entry[1], stressFromEnd: entry[2], band: entry[3] };
}

export class Lexicon {
  readonly #baseUrl: string;
  readonly #manifest: Manifest;
  readonly #shards = new Map<number, Record<string, PackedEntry[]>>();
  readonly #pending = new Map<number, Promise<Record<string, PackedEntry[]>>>();

  private constructor(baseUrl: string, manifest: Manifest) {
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#manifest = manifest;
  }

  static async load(baseUrl: string, signal?: AbortSignal): Promise<Lexicon> {
    const url = `${baseUrl.replace(/\/+$/, '')}/manifest.json`;
    const response = await fetch(url, signal === undefined ? {} : { signal });
    if (!response.ok) throw new Error(`léxico indisponível (${response.status})`);
    return new Lexicon(baseUrl, (await response.json()) as Manifest);
  }

  get manifest(): Manifest {
    return this.#manifest;
  }

  /** Fatias já em memória. Existe para diagnóstico e teste. */
  get loadedShards(): number {
    return this.#shards.size;
  }

  async #shard(index: number, signal?: AbortSignal): Promise<Record<string, PackedEntry[]>> {
    const cached = this.#shards.get(index);
    if (cached !== undefined) return cached;

    // Duas consultas ao mesmo som em sequência não devem virar duas buscas.
    const inFlight = this.#pending.get(index);
    if (inFlight !== undefined) return inFlight;

    const promise = (async () => {
      const url = `${this.#baseUrl}/${shardName(index)}`;
      const response = await fetch(url, signal === undefined ? {} : { signal });
      if (!response.ok) throw new Error(`fatia ${index} indisponível (${response.status})`);
      const data = (await response.json()) as Record<string, PackedEntry[]>;
      this.#shards.set(index, data);
      this.#pending.delete(index);
      return data;
    })();

    this.#pending.set(index, promise);
    return promise;
  }

  /**
   * Palavras que rimam com o som pedido.
   *
   * Vêm ordenadas do comum ao raro, que é a ordem em que se lê uma lista —
   * mas **não é ranque de preferência**: a interface mostra o conjunto, e quem
   * escolhe é quem escreve.
   */
  async rhymes(query: RhymeQuery, signal?: AbortSignal): Promise<LexiconEntry[]> {
    if (query.sound === '') return [];
    const shard = await this.#shard(shardOf(query.sound, this.#manifest.shards), signal);
    const lista = shard[query.sound];
    if (lista === undefined) return [];

    const excluir = new Set((query.exclude ?? []).map((w) => w.toLowerCase()));
    const saida: LexiconEntry[] = [];
    const limite = query.limit ?? DEFAULT_LIMIT;

    for (const packed of lista) {
      const entry = unpack(packed);
      if (query.syllables !== undefined && entry.syllables !== query.syllables) continue;
      if (query.stressFromEnd !== undefined && entry.stressFromEnd !== query.stressFromEnd) continue;
      if (excluir.has(entry.word)) continue;
      saida.push(entry);
      if (saida.length >= limite) break;
    }
    return saida;
  }

  /** Quantas palavras existem para este som, sem filtro. Barato depois da 1ª busca. */
  async count(sound: string, signal?: AbortSignal): Promise<number> {
    if (sound === '') return 0;
    const shard = await this.#shard(shardOf(sound, this.#manifest.shards), signal);
    return shard[sound]?.length ?? 0;
  }
}

export { shardName, shardOf, SHARD_COUNT } from './shard.js';
export type { Manifest, PackedEntry } from './shard.js';
