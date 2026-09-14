/**
 * O modelo de documento.
 *
 * O poema **não é uma string**. É texto mais as decisões de escansão que o
 * autor travou contra o motor. Licença poética precisa persistir: se o poeta
 * forçou um hiato onde o sistema elidiria, essa escolha é dele e sobrevive ao
 * fechar o arquivo.
 *
 * Daí o formato próprio. Um `.txt` guarda as letras e perde a forma declarada
 * e as travas — que é justamente o que distingue este documento de um texto
 * qualquer. Por dentro é JSON: legível, inspecionável, sem lock-in. O site
 * pode mudar de host numa tarde e o arquivo continua abrindo.
 */

import type { MetricSpec } from '@escandir/engine';

export const FORMAT = 'metrica-poema';
export const VERSION = 4;
export const EXTENSION = '.poema';
export const MIME = 'application/json';

export type LineKind =
  /** Verso: medido, contado, com régua e letra de rima. */
  | 'verse'
  /** Título, número de canto, marcação de coro. Não é poema, não se mede. */
  | 'heading'
  /** Comentário do autor. Não é poema, não se mede, não sai na leitura. */
  | 'note';

export interface PoemLine {
  readonly text: string;
  /** Ausente em arquivos anteriores à v3: tudo era verso. */
  readonly kind?: LineKind;
  /**
   * Proveniência. `ai` marca linha que nasceu de uma proposta aceita.
   *
   * O princípio diz que o sistema registra; vale nos dois sentidos. O autor
   * precisa poder olhar o poema meses depois e saber o que não escreveu.
   * Editar a linha não apaga a marca: a origem foi aquela.
   */
  readonly source?: 'author' | 'ai';
  /**
   * Junções travadas pelo autor: id da junção -> elidir ou não.
   *
   * Reservado. A UI ainda não produz travas porque o id de junção é o offset
   * no texto e não sobrevive a uma edição anterior a ele — é a pendência que
   * bloqueia a tela Trava. O campo existe desde já para que os arquivos
   * gravados hoje continuem válidos quando ela existir.
   */
  readonly locks?: Readonly<Record<string, boolean>>;
}

/**
 * Tipografia do poema. Anda com o documento, não com o leitor: como o poema se
 * apresenta na página é escolha de quem escreveu, e sobrevive ao arquivo.
 */
export interface PoemStyle {
  readonly font: string;
  readonly size: number;
}

export const DEFAULT_STYLE: PoemStyle = { font: 'Spectral', size: 27 };

export interface PoemDocument {
  readonly format: string;
  /** Identidade na biblioteca. Gerada ao criar; ausente em arquivos até a v3. */
  readonly id: string;
  readonly version: number;
  readonly title: string;
  /**
   * Do que o poema trata, na voz de quem escreve.
   *
   * Não é resumo nem sinopse: é o que o autor diria a alguém que fosse
   * ajudá-lo. Contexto permanente, distinto das linhas do tipo `note`, que
   * são pedidos pontuais presos a um lugar do texto. Ausente antes da v4.
   */
  readonly theme: string;
  readonly spec: MetricSpec;
  readonly rhyme: string;
  /** Versos que a forma prevê. `0` = sem limite. Ausente em arquivos v1. */
  readonly verses: number;
  /** Ausente em arquivos anteriores à v3. */
  readonly style: PoemStyle;
  readonly lines: readonly PoemLine[];
  readonly updatedAt: string;
}

/** Identidade de poema. Curta, ordenável por criação, sem colisão prática. */
export function newPoemId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function serialize(doc: PoemDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSpec(value: unknown): MetricSpec {
  if (!isRecord(value)) throw new Error('forma ausente');
  const syllables = value['syllables'];
  const required = value['requiredStresses'];
  if (typeof syllables !== 'number' || !Number.isFinite(syllables)) {
    throw new Error('forma sem número de sílabas');
  }
  const stresses = Array.isArray(required)
    ? required.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    : [];
  return { syllables, requiredStresses: stresses };
}

function readLocks(value: unknown): Readonly<Record<string, boolean>> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, boolean> = {};
  for (const [id, applied] of Object.entries(value)) {
    if (typeof applied === 'boolean') out[id] = applied;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * O esquema de rima é uma letra por verso. Arquivos v1 guardavam um rótulo de
 * menu, e "Branco" ali queria dizer "sem rima" — não um esquema B-R-A-N-C-O.
 */
function readRhyme(value: unknown): string {
  if (typeof value !== 'string') return '';
  if (value.toLowerCase() === 'branco') return '';
  return value.toUpperCase().replace(/[^A-Z]/g, '');
}

function readSource(value: unknown): 'author' | 'ai' {
  return value === 'ai' ? 'ai' : 'author';
}

function readKind(value: unknown): LineKind {
  return value === 'heading' || value === 'note' ? value : 'verse';
}

function readStyle(value: unknown): PoemStyle {
  if (!isRecord(value)) return DEFAULT_STYLE;
  const font = typeof value['font'] === 'string' && value['font'] !== ''
    ? value['font']
    : DEFAULT_STYLE.font;
  const raw = value['size'];
  const size = typeof raw === 'number' && Number.isFinite(raw)
    ? Math.min(60, Math.max(12, Math.trunc(raw)))
    : DEFAULT_STYLE.size;
  return { font, size };
}

/**
 * Interpreta um arquivo. Lança com mensagem legível se não for um poema —
 * a UI mostra a mensagem, não um stack trace.
 */
export function parse(source: string): PoemDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    throw new Error('arquivo não é JSON válido');
  }
  return fromRaw(raw);
}

/**
 * Normaliza um documento vindo de qualquer lugar — arquivo ou IndexedDB.
 *
 * Os dois caminhos passam por aqui de propósito. O que está gravado localmente
 * também envelhece: um rascunho escrito por uma versão anterior chega sem os
 * campos que passaram a existir, e ler direto do banco sem migrar quebra o
 * editor de quem só voltou a abrir o que já tinha.
 */
export function fromRaw(raw: unknown): PoemDocument {
  if (!isRecord(raw)) throw new Error('arquivo vazio ou malformado');
  if (raw['format'] !== FORMAT) throw new Error('não é um arquivo de poema');

  const version = typeof raw['version'] === 'number' ? raw['version'] : 0;
  if (version > VERSION) {
    throw new Error(`arquivo de versão ${version}, mais nova que este editor`);
  }

  const rawLines = Array.isArray(raw['lines']) ? raw['lines'] : [];
  const lines: PoemLine[] = rawLines.map((line): PoemLine => {
    if (typeof line === 'string') return { text: line, kind: 'verse' };
    if (!isRecord(line)) return { text: '', kind: 'verse' };
    const text = typeof line['text'] === 'string' ? line['text'] : '';
    const kind = readKind(line['kind']);
    const source = readSource(line['source']);
    const locks = readLocks(line['locks']);
    return locks === undefined ? { text, kind, source } : { text, kind, source, locks };
  });

  return {
    format: FORMAT,
    version: VERSION,
    id: typeof raw['id'] === 'string' && raw['id'] !== '' ? raw['id'] : newPoemId(),
    title: typeof raw['title'] === 'string' ? raw['title'] : 'sem título',
    theme: typeof raw['theme'] === 'string' ? raw['theme'] : '',
    spec: readSpec(raw['spec']),
    rhyme: readRhyme(raw['rhyme']),
    verses: typeof raw['verses'] === 'number' && Number.isFinite(raw['verses'])
      ? Math.max(0, Math.trunc(raw['verses']))
      : 0,
    style: readStyle(raw['style']),
    lines: lines.length > 0 ? lines : [{ text: '', kind: 'verse' }],
    updatedAt: typeof raw['updatedAt'] === 'string' ? raw['updatedAt'] : new Date().toISOString(),
  };
}

/** Nome de arquivo a partir do título, sem caracteres que o sistema recuse. */
export function fileName(doc: PoemDocument): string {
  const base = doc.title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${base === '' ? 'poema' : base}${EXTENSION}`;
}
