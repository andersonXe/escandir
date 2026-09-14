/**
 * Desfazer e refazer no nível do documento.
 *
 * O desfazer nativo do `<textarea>` não serve aqui: Enter, Backspace no início
 * e Delete no fim são interceptados e viram operações sobre a lista de linhas,
 * que o campo não conhece. Depois de uma dessas, a pilha do navegador está
 * dessincronizada do documento — desfazer restauraria o texto de um campo sem
 * desfazer a divisão da linha.
 *
 * Guarda só as linhas. Mudar a forma do poema não entra no histórico: seria
 * surpreendente que Ctrl+Z, depois de escrever um verso, desfizesse a escolha
 * do metro feita dez minutos antes.
 */

export interface HistoryState<T> {
  readonly lines: readonly T[];
  readonly cursor: number;
  readonly caret: number;
}

const LIMIT = 200;

/**
 * Janela em que edições seguidas contam como uma só. Sem isso, desfazer anda
 * letra a letra, que não é o que ninguém quer.
 */
const COALESCE_MS = 700;

export class History<T> {
  #past: HistoryState<T>[] = [];
  #future: HistoryState<T>[] = [];
  #lastPush = 0;

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  /**
   * Registra o estado **anterior** à mudança. `force` para operações
   * estruturais — dividir, juntar, colar, trocar o tipo da linha —, que nunca
   * se agrupam com a digitação em volta.
   */
  push(state: HistoryState<T>, force = false): void {
    const now = Date.now();
    if (!force && now - this.#lastPush < COALESCE_MS && this.#past.length > 0) {
      this.#lastPush = now;
      return;
    }
    this.#past.push(state);
    if (this.#past.length > LIMIT) this.#past.shift();
    this.#future = [];
    this.#lastPush = now;
  }

  undo(current: HistoryState<T>): HistoryState<T> | null {
    const previous = this.#past.pop();
    if (previous === undefined) return null;
    this.#future.push(current);
    this.#lastPush = 0;
    return previous;
  }

  redo(current: HistoryState<T>): HistoryState<T> | null {
    const next = this.#future.pop();
    if (next === undefined) return null;
    this.#past.push(current);
    this.#lastPush = 0;
    return next;
  }

  /** Abrir outro documento zera o histórico: não se desfaz para dentro dele. */
  clear(): void {
    this.#past = [];
    this.#future = [];
    this.#lastPush = 0;
  }
}
