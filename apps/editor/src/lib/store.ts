/**
 * Persistência local. Sem backend, sem conta, sem rede.
 *
 * IndexedDB guarda os poemas, os modelos de forma que o autor criou e a
 * configuração de IA; o arquivo `.poema` é a saída, e é o que garante zero lock-in — o que
 * está aqui dentro sempre pode sair inteiro.
 */

import { fromRaw, type PoemDocument } from './document.js';
import type { ProviderConfig } from './ai/types.js';
import type { Modelo } from './forma.js';

const DB_NAME = 'metrica';
const DB_VERSION = 3;
const POEMAS = 'poemas';
const MODELOS = 'modelos';
const CONFIG = 'config';

/**
 * Chave do rascunho único que existia antes de haver biblioteca. Fica aqui
 * porque quem escreveu naquela versão não pode perder o que escreveu.
 */
const CURRENT = 'rascunho';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(POEMAS)) db.createObjectStore(POEMAS);
      if (!db.objectStoreNames.contains(MODELOS)) db.createObjectStore(MODELOS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(CONFIG)) db.createObjectStore(CONFIG);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB indisponível'));
  });
}

/**
 * Guardar não pode derrubar o editor. Navegador em aba anônima, cota estourada
 * ou armazenamento bloqueado são condições normais — o poema continua na tela,
 * e o autor ainda pode exportar o arquivo.
 */
async function write(store: string, run: (os: IDBObjectStore) => void): Promise<boolean> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      run(tx.objectStore(store));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('falha ao gravar'));
    });
    db.close();
    return true;
  } catch (error) {
    // Falha de armazenamento é condição normal; falha de programação não é, e
    // engolir as duas em silêncio custou uma hora de depuração uma vez.
    console.warn('[metrica] não foi possível gravar:', error);
    return false;
  }
}

async function read<T>(store: string, pick: (os: IDBObjectStore) => IDBRequest): Promise<T | null> {
  try {
    const db = await open();
    const value = await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const request = pick(tx.objectStore(store));
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('falha ao ler'));
    });
    db.close();
    return value;
  } catch (error) {
    console.warn('[metrica] não foi possível ler:', error);
    return null;
  }
}

/** Ficha de um poema na biblioteca. Não carrega o documento inteiro. */
export interface PoemSummary {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
  /** Primeiro verso com texto: reconhece-se um poema pelo que ele diz. */
  readonly opening: string;
  readonly verses: number;
}

function summarize(doc: PoemDocument): PoemSummary {
  const versos = doc.lines.filter((line) => (line.kind ?? 'verse') === 'verse');
  return {
    id: doc.id,
    title: doc.title,
    updatedAt: doc.updatedAt,
    opening: versos.find((line) => line.text.trim() !== '')?.text ?? '',
    verses: versos.filter((line) => line.text.trim() !== '').length,
  };
}

/**
 * Traz o rascunho da versão de slot único para a biblioteca.
 *
 * Roda uma vez: depois de migrado, a chave antiga deixa de existir. Sem isto,
 * quem atualizasse o editor abriria a tela em branco com o poema ainda no
 * banco, e concluiria — com razão — que o editor perdeu o texto.
 */
async function migrateLegacy(): Promise<void> {
  const raw = await read<unknown>(POEMAS, (os) => os.get(CURRENT));
  if (raw === null) return;
  try {
    const doc = fromRaw(raw);
    await write(POEMAS, (os) => {
      os.put(doc, doc.id);
      os.delete(CURRENT);
    });
    await setLastOpened(doc.id);
  } catch (error) {
    console.warn('[metrica] rascunho antigo ilegível, mantido como está:', error);
  }
}

export async function listPoems(): Promise<PoemSummary[]> {
  await migrateLegacy();
  const all = await read<unknown[]>(POEMAS, (os) => os.getAll());
  if (all === null) return [];
  const resumos: PoemSummary[] = [];
  for (const raw of all) {
    try {
      resumos.push(summarize(fromRaw(raw)));
    } catch {
      // Registro ilegível não derruba a lista dos outros.
    }
  }
  return resumos.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function savePoem(doc: PoemDocument): Promise<boolean> {
  return write(POEMAS, (os) => os.put(doc, doc.id));
}

/**
 * O poema volta pela mesma normalização que um arquivo. O que está no banco
 * também envelhece, e ler direto quebraria o editor de quem gravou numa versão
 * anterior do formato.
 */
export async function loadPoem(id: string): Promise<PoemDocument | null> {
  const raw = await read<unknown>(POEMAS, (os) => os.get(id));
  if (raw === null) return null;
  try {
    return fromRaw(raw);
  } catch (error) {
    console.warn('[metrica] poema gravado é ilegível:', error);
    return null;
  }
}

export function deletePoem(id: string): Promise<boolean> {
  return write(POEMAS, (os) => os.delete(id));
}

/** Qual poema reabrir ao voltar. */
export function setLastOpened(id: string): Promise<boolean> {
  return write(CONFIG, (os) => os.put(id, 'lastOpened'));
}

export async function loadLastOpened(): Promise<PoemDocument | null> {
  await migrateLegacy();
  const id = await read<string>(CONFIG, (os) => os.get('lastOpened'));
  if (id !== null) {
    const doc = await loadPoem(id);
    if (doc !== null) return doc;
  }
  // Sem marca, ou marca apontando para poema apagado: abre o mais recente.
  const [primeiro] = await listPoems();
  return primeiro === undefined ? null : loadPoem(primeiro.id);
}

export async function listModelos(): Promise<Modelo[]> {
  return (await read<Modelo[]>(MODELOS, (os) => os.getAll())) ?? [];
}

export function saveModelo(modelo: Modelo): Promise<boolean> {
  return write(MODELOS, (os) => os.put(modelo));
}

export function deleteModelo(id: string): Promise<boolean> {
  return write(MODELOS, (os) => os.delete(id));
}

/**
 * Agrupa gravações em rajada: escrever é por tecla, gravar não precisa ser.
 *
 * Recebe o valor a gravar em vez de ir buscá-lo depois. Num framework
 * reativo isso não é detalhe: quem monta o valor é o efeito, e é ao montá-lo
 * que ele assina as dependências certas. Ir buscar o estado lá dentro, 400ms
 * depois e fora de contexto reativo, faz o efeito não observar nada.
 */
export function debounced<T>(fn: (value: T) => void, delay: number): (value: T) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: T;
  return (value: T) => {
    latest = value;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => fn(latest), delay);
  };
}

/**
 * Configuração de IA: provedor, modelo, endereço e **a chave do usuário**.
 *
 * A chave fica no navegador dele e vai só para o endereço configurado. Não há
 * servidor neste projeto para onde ela pudesse ir, e é por isso que o modelo é
 * BYOK: sem chave do desenvolvedor, não há custo recorrente nem intermediário.
 *
 * O endereço é editável porque é o que torna dezenas de provedores compatíveis
 * utilizáveis sem código novo — e por isso mesmo é o campo a conferir antes de
 * colar uma chave: ela vai para onde esse campo apontar.
 */
export function saveAiConfig(config: ProviderConfig): Promise<boolean> {
  return write(CONFIG, (os) => os.put(config, 'ai'));
}

export function loadAiConfig(): Promise<ProviderConfig | null> {
  return read<ProviderConfig>(CONFIG, (os) => os.get('ai'));
}

export function clearAiConfig(): Promise<boolean> {
  return write(CONFIG, (os) => os.delete('ai'));
}
