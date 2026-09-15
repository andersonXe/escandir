/**
 * Busca com alvo sobre o grafo de junções.
 *
 * A escansão não é uma função `verso -> número`. É um conjunto de leituras
 * ranqueadas, e quem escolhe entre elas é o poeta — o sistema só ordena.
 */

import { isFreeVerse, type MetricSpec } from '../spec.js';
import type { WordAnalyzer } from '../analyzer.js';
import type { LanguageRules } from '../types.js';
import { type Costs, DEFAULT_COSTS } from './costs.js';
import { buildJunctions, isMerge, type Junction } from './junctions.js';
import { materialize, type Reading } from './reading.js';
import { buildUnits, isStrongBeat, type Unit } from './units.js';

export interface ScanOptions {
  readonly spec?: MetricSpec;
  /**
   * Decisões travadas pelo autor: id da junção -> aplicar ou não.
   * Uma junção travada sai da busca e não custa nada: quando o autor contraria
   * o sistema, o autor vence, e o custo de naturalidade deixa de ser relevante.
   */
  readonly locks?: ReadonlyMap<string, boolean>;
  readonly costs?: Costs;
  /** Quantas leituras devolver. Padrão 6. */
  readonly maxReadings?: number;
}

export interface VerseScansion {
  readonly text: string;
  readonly units: readonly Unit[];
  readonly junctions: readonly Junction[];
  /** Ranqueadas: primeiro as que cabem na forma, depois por custo. */
  readonly readings: readonly Reading[];
  /** A leitura que a UI deve mostrar. `null` só para verso sem nenhuma sílaba. */
  readonly best: Reading | null;
  /** `true` quando a busca precisou podar o espaço. Ver `MAX_FREE_JUNCTIONS`. */
  readonly truncated: boolean;
}

/**
 * Teto do espaço de busca.
 *
 * O comentário antigo aqui dizia que 2^14 leituras cabiam em ~2ms. Não cabiam:
 * medido, o teto custava ~115ms, e uma linha de treze junções — quarenta
 * caracteres de português corrente, do tipo "a onda e a hora e a ave" — levava
 * 40ms. No editor, com a escansão a cada tecla, isso era uma digitação travada.
 *
 * O erro não estava no expoente, estava no que se fazia por leitura: cada uma
 * materializava a sílaba inteira, com dois `Set`, três arrays e um objeto por
 * sílaba, para que 2^14 menos seis fossem jogadas fora em seguida.
 *
 * Agora a busca tem duas fases (ver `scanVerse`), e o que se paga por leitura é
 * aritmética de inteiros. O teto continua aqui como rede de proteção, não como
 * orçamento: o caso patológico agora cabe no quadro.
 */
const MAX_FREE_JUNCTIONS = 14;

/**
 * A medida de uma leitura, sem a leitura.
 *
 * É tudo o que o ranque consulta. Existe para que a fase cara — montar as
 * sílabas — só aconteça para as que vão ser devolvidas.
 */
interface Score {
  readonly mask: number;
  readonly cost: number;
  readonly count: number;
  readonly total: number;
  /** Tônicas obrigatórias que esta leitura não cumpre. `0` sem alvo. */
  readonly missing: number;
  /** A contagem bate com o alvo. `0` cabe, `1` não — para ordenar direto. */
  readonly fit: 0 | 1;
}

export function scanVerse(
  text: string,
  language: LanguageRules,
  analyzer: WordAnalyzer,
  options: ScanOptions = {},
): VerseScansion {
  const costs = options.costs ?? DEFAULT_COSTS;
  const spec = options.spec;
  const locks = options.locks;
  const maxReadings = options.maxReadings ?? 6;

  const units = buildUnits(text, analyzer);
  const junctions = buildJunctions(units, language.prosody, costs);

  if (units.length === 0) {
    return { text, units, junctions, readings: [], best: null, truncated: false };
  }

  // Travadas saem da busca; o resto é o espaço livre.
  const forced = new Map<string, boolean>();
  let free: Junction[] = [];
  for (const junction of junctions) {
    const lock = locks?.get(junction.id);
    if (lock === undefined) free.push(junction);
    else forced.set(junction.id, lock);
  }

  // Poda: acima do teto, só as elisões continuam abertas. São as que mais
  // mudam a contagem; sinérese e diérese ficam na opção mais barata.
  let truncated = false;
  if (free.length > MAX_FREE_JUNCTIONS) {
    truncated = true;
    const keep: Junction[] = [];
    for (const junction of free) {
      if (junction.kind === 'elision' && keep.length < MAX_FREE_JUNCTIONS) keep.push(junction);
      else forced.set(junction.id, junction.costApply <= junction.costSkip);
    }
    free = keep;
  }

  const targeted = spec !== undefined && !isFreeVerse(spec);

  /*
   * Tabelas por unidade, montadas uma vez e lidas em toda leitura.
   *
   * O laço de pontuação roda 2^k vezes; tudo o que puder sair de dentro dele
   * sai. `splitAt` guarda a partição do núcleo porque `splitNucleus` é a única
   * chamada de idioma no caminho quente, e o resultado não depende da máscara.
   */
  const n = units.length;
  const strongUnit = new Uint8Array(n);
  /** Decisão já fechada (travada ou podada): `1` aplica, `0` não, `-1` livre. */
  const fixedAt = new Int8Array(n).fill(-1);
  const mergeAt = new Uint8Array(n);
  const splitAt: (ReturnType<LanguageRules['prosody']['splitNucleus']> | null)[] = new Array(n).fill(null);

  for (let i = 0; i < n; i += 1) {
    const unit = units[i];
    if (unit !== undefined && isStrongBeat(unit)) strongUnit[i] = 1;
  }
  for (const junction of junctions) {
    const i = junction.unitIndex;
    if (i < 0 || i >= n) continue;
    mergeAt[i] = isMerge(junction) ? 1 : 0;
    if (!isMerge(junction)) {
      const unit = units[i];
      splitAt[i] = unit === undefined ? null : language.prosody.splitNucleus(unit.nucleus);
    }
    const lock = forced.get(junction.id);
    if (lock !== undefined) fixedAt[i] = lock ? 1 : 0;
  }
  const required = targeted && spec !== undefined ? spec.requiredStresses : [];
  // Força de cada sílaba da leitura corrente. Alocado uma vez, reescrito por
  // leitura: uma diérese dobra a unidade, então o pior caso é 2n.
  const strength = new Uint8Array(n * 2 + 2);

  /*
   * Estado aplicado por unidade, montado uma vez e remendado por leitura.
   *
   * As decisões fechadas nunca mudam, então entram aqui de saída; por leitura
   * só se reescrevem as posições livres, que são no máximo catorze. Perguntar
   * por função dentro do laço — que era a forma legível — custava caro: é
   * chamada milhões de vezes, e o motor de JS não a desmonta.
   */
  const appliedAt = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) appliedAt[i] = fixedAt[i] === 1 ? 1 : 0;

  const total = 1 << free.length;
  const scores: Score[] = new Array<Score>(total);

  for (let mask = 0; mask < total; mask += 1) {
    /*
     * Custo somado parcela a parcela, na ordem das junções.
     *
     * Houve aqui uma tabela de somas parciais que dava uns 8% — e mudava o
     * resultado. Soma de ponto flutuante não é associativa: com custos
     * fracionários, `base + tabela + tabela` dá 3.600000000000001 onde a soma
     * sequencial dá 3.6, e duas leituras que empatavam passam a desempatar ao
     * contrário. Com os custos padrão, que são inteiros pequenos, nada disso
     * aparece — mas `costs` é parâmetro público, e o comentário em `costs.ts`
     * convida explicitamente a recalibrar os pesos contra um corpus. Oito por
     * cento não paga um motor que ordena diferente para quem aceitou o convite.
     *
     * Escolha travada ou podada não pesa no ranque: só as livres somam.
     */
    let cost = 0;
    for (let bit = 0; bit < free.length; bit += 1) {
      const junction = free[bit];
      if (junction === undefined) continue;
      const aplicada = (mask & (1 << bit)) !== 0;
      cost += aplicada ? junction.costApply : junction.costSkip;
      appliedAt[junction.unitIndex] = aplicada ? 1 : 0;
    }

    // O mesmo agrupamento de `materialize`, sem construir nada.
    let syllables = 0;
    let lastStrong = -1;
    let i = 0;
    while (i < n) {
      let last = i;
      while (last + 1 < n && mergeAt[last] === 1 && appliedAt[last] === 1) last += 1;

      const split = splitAt[i];
      if (last === i && split != null && mergeAt[i] === 0 && appliedAt[i] === 1) {
        const strong = strongUnit[i] === 1;
        const first = strong && split.stressOn === 'first' ? 1 : 0;
        const second = strong && split.stressOn === 'second' ? 1 : 0;
        if (first === 1) lastStrong = syllables;
        strength[syllables] = first;
        syllables += 1;
        if (second === 1) lastStrong = syllables;
        strength[syllables] = second;
        syllables += 1;
        i += 1;
        continue;
      }

      let strong = 0;
      for (let k = i; k <= last; k += 1) {
        if (strongUnit[k] === 1) {
          strong = 1;
          break;
        }
      }
      if (strong === 1) lastStrong = syllables;
      strength[syllables] = strong;
      syllables += 1;
      i = last + 1;
    }

    // A contagem para na última tônica forte; sem nenhuma, é o total.
    const count = lastStrong >= 0 ? lastStrong + 1 : syllables;
    const fit: 0 | 1 = targeted && spec !== undefined && count === spec.syllables ? 0 : 1;

    // Tônica fora do lugar só desempata entre leituras que já medem certo:
    // comparar posições entre medidas diferentes é comparar contra réguas
    // diferentes, e fazia o motor preferir uma leitura absurda de 13 sílabas
    // só porque a 10ª caiu numa tônica.
    let missing = 0;
    if (fit === 0) {
      for (const position of required) {
        if (position > count) continue;
        if (strength[position - 1] !== 1) missing += 1;
      }
    }

    scores[mask] = { mask, cost, count, total: syllables, missing, fit };
  }

  scores.sort((a, b) => {
    if (a.fit !== b.fit) return a.fit - b.fit;
    if (a.fit === 0 && a.missing !== b.missing) return a.missing - b.missing;
    if (a.cost !== b.cost) return a.cost - b.cost;
    return a.total - b.total;
  });

  /*
   * Só agora se monta sílaba, e só para as que vão ser devolvidas. Era esta
   * linha, rodando 2^k vezes em vez de seis, que custava os 115ms.
   */
  const ranked = scores.slice(0, maxReadings).map((score) => {
    const applied = new Set<string>();
    for (const [id, active] of forced) {
      if (active) applied.add(id);
    }
    for (let bit = 0; bit < free.length; bit += 1) {
      const junction = free[bit];
      if (junction !== undefined && (score.mask & (1 << bit)) !== 0) applied.add(junction.id);
    }
    return materialize(units, junctions, applied, language.prosody, score.cost);
  });

  return {
    text,
    units,
    junctions,
    readings: ranked,
    best: ranked[0] ?? null,
    truncated,
  };
}
