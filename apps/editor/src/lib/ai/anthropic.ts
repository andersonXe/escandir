/**
 * Anthropic. Existe menos por necessidade imediata que por prova: se a
 * abstração só coubesse no formato da OpenAI, ela não seria uma abstração.
 *
 * As diferenças são exatamente as previstas — cabeçalho próprio, `system` fora
 * da lista de mensagens, conteúdo em blocos, e ferramenta como bloco de
 * conteúdo em vez de campo separado.
 */

import {
  baseOf,
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
    'x-api-key': config.apiKey,
    'anthropic-version': '2023-06-01',
    // Sem isto o navegador é recusado: a API espera chamada de servidor, e
    // aqui não há servidor nenhum por decisão de arquitetura.
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

function toMessage(message: Message): { role: string; content: unknown } {
  switch (message.role) {
    case 'assistant-tools': {
      const blocks: unknown[] = [];
      if (message.content !== '') blocks.push({ type: 'text', text: message.content });
      for (const call of message.calls) {
        let input: unknown = {};
        try {
          input = JSON.parse(call.rawArguments);
        } catch {
          input = {};
        }
        blocks.push({ type: 'tool_use', id: call.id, name: call.name, input });
      }
      return { role: 'assistant', content: blocks };
    }
    case 'tool':
      return {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: message.callId, content: message.content }],
      };
    default:
      return { role: message.role, content: message.content };
  }
}

export const anthropic: Provider = {
  id: 'anthropic',
  name: 'Anthropic',
  defaultBaseUrl: 'https://api.anthropic.com',
  keyUrl: 'https://console.anthropic.com/settings/keys',
  fallbackModels: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
  supportsTools: true,

  async complete(config: ProviderConfig, request: CompletionRequest): Promise<CompletionResult> {
    const body: Record<string, unknown> = {
      model: config.model,
      system: request.system,
      messages: request.messages.map(toMessage),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
    };
    if (request.tools !== undefined && request.tools.length > 0) {
      body['tools'] = request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }));
    }

    const response = await fetch(`${baseOf(anthropic, config)}/v1/messages`, {
      method: 'POST',
      headers: headers(config),
      signal: request.signal ?? null,
      body: JSON.stringify(body),
    });
    if (!response.ok) await readError(response);

    const payload: unknown = await response.json();
    const content = (payload as { content?: unknown }).content;
    if (!Array.isArray(content)) return { text: '', toolCalls: [] };

    const text = content
      .filter((block) => (block as { type?: unknown }).type === 'text')
      .map((block) => (block as { text?: unknown }).text)
      .filter((value): value is string => typeof value === 'string')
      .join('');

    const toolCalls: ToolCall[] = content
      .filter((block) => (block as { type?: unknown }).type === 'tool_use')
      .map((block) => {
        const record = block as { id?: unknown; name?: unknown; input?: unknown };
        return {
          id: typeof record.id === 'string' ? record.id : '',
          name: typeof record.name === 'string' ? record.name : '',
          rawArguments: JSON.stringify(record.input ?? {}),
        };
      })
      .filter((call) => call.name !== '');

    return { text, toolCalls };
  },

  async listModels(config: ProviderConfig, signal?: AbortSignal): Promise<string[]> {
    const response = await fetch(`${baseOf(anthropic, config)}/v1/models?limit=100`, {
      headers: headers(config),
      signal: signal ?? null,
    });
    if (!response.ok) await readError(response);
    const body: unknown = await response.json();
    const data = (body as { data?: unknown }).data;
    if (!Array.isArray(data)) return [];
    return data
      .map((item) => (item as { id?: unknown }).id)
      .filter((id): id is string => typeof id === 'string');
  },
};
