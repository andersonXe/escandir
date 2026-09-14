/**
 * OpenAI, e por tabela todo provedor que fala o mesmo protocolo.
 *
 * `/chat/completions` virou de fato um padrão: OpenRouter, Groq, Together,
 * DeepSeek, LM Studio e Ollama respondem nele. Como o endereço é editável,
 * este adaptador sozinho cobre boa parte do mercado — basta trocar a URL.
 */

import {
  baseOf,
  ProviderError,
  readError,
  type CompletionRequest,
  type CompletionResult,
  type Message,
  type Provider,
  type ProviderConfig,
  type ToolCall,
} from './types.js';

function headers(config: ProviderConfig): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };
}

/**
 * Modelos que já recusaram temperatura, para não pagar a recusa de novo.
 *
 * Sem isto, cada chamada gasta uma ida perdida ao servidor antes da que
 * funciona — e numa conversa com ferramenta, que são várias idas, isso dobra
 * a espera inteira. Aprender uma vez por modelo basta.
 */
const semTemperatura = new Set<string>();

interface ChatMessage {
  role: string;
  content: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

function toChat(message: Message): ChatMessage {
  switch (message.role) {
    case 'assistant-tools':
      return {
        role: 'assistant',
        content: message.content === '' ? null : message.content,
        tool_calls: message.calls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.rawArguments },
        })),
      };
    case 'tool':
      return { role: 'tool', tool_call_id: message.callId, content: message.content };
    default:
      return { role: message.role, content: message.content };
  }
}

function readToolCalls(message: unknown): ToolCall[] {
  const calls = (message as { tool_calls?: unknown }).tool_calls;
  if (!Array.isArray(calls)) return [];
  return calls
    .map((call) => {
      const record = call as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
      const name = record.function?.name;
      if (typeof name !== 'string') return null;
      return {
        id: typeof record.id === 'string' ? record.id : name,
        name,
        rawArguments: typeof record.function?.arguments === 'string' ? record.function.arguments : '{}',
      };
    })
    .filter((call): call is ToolCall => call !== null);
}

export const openai: Provider = {
  id: 'openai',
  name: 'OpenAI',
  defaultBaseUrl: 'https://api.openai.com/v1',
  keyUrl: 'https://platform.openai.com/api-keys',
  fallbackModels: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o'],
  supportsTools: true,

  async complete(config: ProviderConfig, request: CompletionRequest): Promise<CompletionResult> {
    const body: Record<string, unknown> = {
      model: config.model,
      messages: [{ role: 'system', content: request.system }, ...request.messages.map(toChat)],
      max_completion_tokens: request.maxTokens,
    };
    if (!semTemperatura.has(config.model)) body['temperature'] = request.temperature;
    if (request.tools !== undefined && request.tools.length > 0) {
      body['tools'] = request.tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      }));
    }

    const enviar = (payload: Record<string, unknown>): Promise<Response> =>
      fetch(`${baseOf(openai, config)}/chat/completions`, {
        method: 'POST',
        headers: headers(config),
        signal: request.signal ?? null,
        body: JSON.stringify(payload),
      });

    let response = await enviar(body);

    /*
     * Alguns modelos recusam temperatura diferente da padrão. Manter uma lista
     * de quais seria exatamente o que o campo de modelo livre existe para
     * evitar: modelo novo sai toda semana. Em vez disso, o adaptador tenta,
     * lê a recusa e repete sem o parâmetro — degrada sozinho.
     */
    if (response.status === 400 && body['temperature'] !== undefined) {
      const texto = await response.clone().text();
      if (texto.includes('temperature')) {
        semTemperatura.add(config.model);
        const { temperature: _, ...limpo } = body;
        response = await enviar(limpo);
      }
    }

    if (!response.ok) await readError(response);

    const payload: unknown = await response.json();
    const choices = (payload as { choices?: unknown }).choices;
    const choice = Array.isArray(choices)
      ? (choices[0] as { message?: unknown; finish_reason?: unknown } | undefined)
      : undefined;
    const message = choice?.message;
    const content = (message as { content?: unknown } | undefined)?.content;
    const text = typeof content === 'string' ? content : '';
    const toolCalls = readToolCalls(message);

    /*
     * Resposta vazia por estouro de teto merece erro, não silêncio.
     *
     * Modelo de raciocínio gasta do mesmo `max_completion_tokens` antes de
     * escrever a primeira palavra visível: se o teto for apertado, ele pensa
     * até o fim e devolve conteúdo vazio, com aparência de "não veio nada".
     * Depurar isso às cegas custa caro — a mensagem diz o que aconteceu.
     */
    if (text === '' && toolCalls.length === 0 && choice?.finish_reason === 'length') {
      throw new ProviderError(
        'o modelo esgotou o limite de tokens antes de responder — ' +
          'modelos de raciocínio gastam desse mesmo limite; tente um modelo sem raciocínio',
      );
    }

    return { text, toolCalls };
  },

  async listModels(config: ProviderConfig, signal?: AbortSignal): Promise<string[]> {
    const response = await fetch(`${baseOf(openai, config)}/models`, {
      headers: headers(config),
      signal: signal ?? null,
    });
    if (!response.ok) await readError(response);
    const body: unknown = await response.json();
    const data = (body as { data?: unknown }).data;
    if (!Array.isArray(data)) return [];
    return data
      .map((item) => (item as { id?: unknown }).id)
      .filter((id): id is string => typeof id === 'string')
      .sort();
  },
};
