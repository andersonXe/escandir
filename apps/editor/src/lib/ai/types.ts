/**
 * Contrato de provedor de IA.
 *
 * O que varia entre provedores é pequeno e bem delimitado: endereço, formato
 * do cabeçalho de autenticação, formato do corpo, e como se lê a resposta.
 * Tudo o mais — o texto do pedido, a validação dos candidatos pelo motor, a
 * interface de proposta — é comum e não pode saber de qual provedor veio.
 *
 * Acrescentar um provedor novo é escrever um arquivo deste tamanho e pôr na
 * lista do `registry`. Nada mais no app muda.
 */

export interface ProviderConfig {
  readonly providerId: string;
  /** Chave do usuário. Fica no navegador dele e vai só para o endereço abaixo. */
  readonly apiKey: string;
  /** Texto livre de propósito: modelo novo não pode exigir versão nova do app. */
  readonly model: string;
  /** Vazio = endereço padrão do provedor. */
  readonly baseUrl: string;
}

/** Ferramenta que o modelo pode chamar. Executa **no navegador**, não num servidor. */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  /** JSON Schema dos argumentos. */
  readonly parameters: Record<string, unknown>;
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  /** Argumentos como o modelo mandou: JSON em string, que pode vir torto. */
  readonly rawArguments: string;
}

export type Message =
  | { readonly role: 'user' | 'assistant'; readonly content: string }
  /** Resposta do modelo pedindo ferramenta, devolvida ao provedor no turno seguinte. */
  | { readonly role: 'assistant-tools'; readonly content: string; readonly calls: readonly ToolCall[] }
  | { readonly role: 'tool'; readonly callId: string; readonly name: string; readonly content: string };

export interface CompletionRequest {
  readonly system: string;
  readonly messages: readonly Message[];
  readonly maxTokens: number;
  readonly temperature: number;
  readonly tools?: readonly ToolDefinition[];
  readonly signal?: AbortSignal;
}

/**
 * O que a chamada consumiu.
 *
 * Em BYOK quem paga é o autor, e até aqui ele não tinha como saber se uma
 * proposta custou pouco ou muito — o laço de ferramenta reenvia a conversa
 * inteira a cada rodada, e o número cresce sem aparecer em lugar nenhum.
 *
 * Conta token, não dinheiro. Preço muda por modelo, por provedor e por mês, e o
 * campo de modelo é texto livre justamente para não precisar de catálogo: uma
 * tabela de preços aqui envelheceria e passaria a mentir. Token é o que os dois
 * provedores relatam e o que o autor pode converter na tabela de quem cobra.
 */
export interface Usage {
  readonly input: number;
  readonly output: number;
  /** Parte da entrada que veio do cache do provedor, quando ele relata. */
  readonly cached: number;
}

export const NO_USAGE: Usage = { input: 0, output: 0, cached: 0 };

export function addUsage(a: Usage, b: Usage): Usage {
  return { input: a.input + b.input, output: a.output + b.output, cached: a.cached + b.cached };
}

/** Lê o bloco `usage` de um corpo de resposta, sob os nomes de cada provedor. */
export function readUsage(payload: unknown, campos: { input: string; output: string; cached: readonly string[] }): Usage {
  const bloco = (payload as { usage?: unknown }).usage;
  if (typeof bloco !== 'object' || bloco === null) return NO_USAGE;
  const record = bloco as Record<string, unknown>;

  const numero = (valor: unknown): number => (typeof valor === 'number' && Number.isFinite(valor) ? valor : 0);

  let cached = 0;
  for (const caminho of campos.cached) {
    // Um provedor põe o número na raiz, o outro aninhado num objeto de
    // detalhes; o caminho com ponto cobre os dois sem um ramo por provedor.
    const partes = caminho.split('.');
    let atual: unknown = record;
    for (const parte of partes) {
      if (typeof atual !== 'object' || atual === null) { atual = undefined; break; }
      atual = (atual as Record<string, unknown>)[parte];
    }
    cached += numero(atual);
  }

  return { input: numero(record[campos.input]), output: numero(record[campos.output]), cached };
}

export interface CompletionResult {
  readonly text: string;
  /** Vazio quando o modelo respondeu de vez. */
  readonly toolCalls: readonly ToolCall[];
  /** Ausente quando o provedor não relata consumo. */
  readonly usage?: Usage;
}

export interface Provider {
  readonly id: string;
  readonly name: string;
  readonly defaultBaseUrl: string;
  /** Onde o usuário consegue a chave. */
  readonly keyUrl: string;
  /**
   * Ponto de partida, não catálogo. A lista real vem de `listModels`, e o
   * campo aceita qualquer texto — modelo lançado ontem funciona hoje.
   */
  readonly fallbackModels: readonly string[];
  /** Nem todo endereço compatível suporta ferramenta; o laço lida com isso. */
  readonly supportsTools: boolean;
  complete(config: ProviderConfig, request: CompletionRequest): Promise<CompletionResult>;
  /** Pergunta ao provedor que modelos existem. Nem todo provedor responde. */
  listModels?(config: ProviderConfig, signal?: AbortSignal): Promise<string[]>;
}

/** Erro com mensagem que pode ir para a tela sem tradução. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export function baseOf(provider: Provider, config: ProviderConfig): string {
  const raw = config.baseUrl.trim() === '' ? provider.defaultBaseUrl : config.baseUrl.trim();
  return raw.replace(/\/+$/, '');
}

/**
 * O endereço é seguro para receber a chave?
 *
 * `http://` manda a chave em claro pela rede. A exceção é a máquina do próprio
 * autor — modelo local em `localhost` não tem certificado e não sai da máquina,
 * e recusá-lo mataria metade do motivo de o campo ser editável.
 *
 * Devolve o motivo em texto, ou `null` quando está tudo bem. Quem decide o que
 * fazer com isso é a tela: aqui não se bloqueia nada, só se diz o que é.
 */
export function endpointWarning(baseUrl: string): string | null {
  const raw = baseUrl.trim();
  if (raw === '') return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'não parece um endereço válido';
  }

  const local =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]' ||
    url.hostname.endsWith('.localhost');

  if (url.protocol === 'https:') return null;
  if (url.protocol === 'http:' && local) return null;
  if (url.protocol === 'http:') {
    return 'endereço sem https: a chave sairia em claro pela rede';
  }
  return `endereço em "${url.protocol}", que não serve para chamar uma API`;
}

/**
 * Extrai a mensagem de erro do provedor. Cada um embrulha de um jeito; o que
 * chega na tela tem de ser legível, não um JSON cru.
 */
export async function readError(response: Response): Promise<never> {
  let detail = '';
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>;
      const error = record['error'];
      if (typeof error === 'string') detail = error;
      else if (typeof error === 'object' && error !== null) {
        const message = (error as Record<string, unknown>)['message'];
        if (typeof message === 'string') detail = message;
      }
      if (detail === '' && typeof record['message'] === 'string') detail = record['message'];
    }
  } catch {
    // Resposta sem JSON: o código de status já diz o suficiente.
  }
  const suffix = detail === '' ? '' : ` — ${detail}`;
  throw new ProviderError(`${response.status} ${response.statusText}${suffix}`, response.status);
}
