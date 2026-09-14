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

export interface CompletionResult {
  readonly text: string;
  /** Vazio quando o modelo respondeu de vez. */
  readonly toolCalls: readonly ToolCall[];
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
