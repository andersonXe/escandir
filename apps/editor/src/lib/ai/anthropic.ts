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
  readUsage,
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

const CACHE = { type: 'ephemeral' } as const;

/**
 * Marca o fim do prefixo estável desta chamada.
 *
 * O laço de ferramenta reenvia a conversa inteira a cada rodada: a rodada 3 de
 * uma proposta manda de novo tudo o que a 0, a 1 e a 2 já mandaram. Marcando o
 * último bloco, cada rodada lê do cache o que a anterior escreveu, e paga cheio
 * só o que cresceu.
 *
 * A marca **anda**: é sempre o último bloco, não um ponto fixo. Fixá-la no
 * sistema pareceria mais simples e não pagaria — o prefixo de sistema mais
 * ferramentas tem cerca de 900 tokens, acima do mínimo do Opus mas abaixo do do
 * Sonnet e bem abaixo do do Haiku, que é o padrão daqui. O que passa do mínimo
 * em todo modelo é a conversa acumulada, e é ela que a marca móvel alcança.
 *
 * Quando não cacheia, não quebra: o provedor ignora e cobra o preço normal.
 */
function marcarCache(mensagem: { role: string; content: unknown }): { role: string; content: unknown } {
  const { role, content } = mensagem;
  if (typeof content === 'string') {
    return { role, content: [{ type: 'text', text: content, cache_control: CACHE }] };
  }
  if (!Array.isArray(content) || content.length === 0) return mensagem;
  const blocos = [...content];
  const ultimo = blocos[blocos.length - 1];
  if (typeof ultimo !== 'object' || ultimo === null) return mensagem;
  blocos[blocos.length - 1] = { ...(ultimo as Record<string, unknown>), cache_control: CACHE };
  return { role, content: blocos };
}

export const anthropic: Provider = {
  id: 'anthropic',
  name: 'Anthropic',
  defaultBaseUrl: 'https://api.anthropic.com',
  keyUrl: 'https://console.anthropic.com/settings/keys',
  // O primeiro da lista é o que `trocarProvedor` adota, então ele é o padrão de
  // fato. Precisa ser um modelo rápido: de raciocínio gasta o orçamento de
  // tokens pensando antes de escrever a primeira palavra, e com a régua na mão
  // isso não compra medida melhor — compra espera e conta maior.
  fallbackModels: ['claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5'],
  supportsTools: true,

  async complete(config: ProviderConfig, request: CompletionRequest): Promise<CompletionResult> {
    const mensagens = request.messages.map(toMessage);
    if (mensagens.length > 0) {
      mensagens[mensagens.length - 1] = marcarCache(mensagens[mensagens.length - 1]!);
    }

    const body: Record<string, unknown> = {
      model: config.model,
      // Em bloco, e não em texto solto, para caber a marca de cache. O sistema
      // é idêntico entre as rodadas de uma proposta e entre propostas do mesmo
      // poema — é o prefixo mais estável que existe aqui.
      system: [{ type: 'text', text: request.system, cache_control: CACHE }],
      messages: mensagens,
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
    // `cache_creation` é o que se escreveu no cache nesta chamada e custa mais
    // caro; só `cache_read` é economia. Somar os dois em "cached" mentiria.
    const usage = readUsage(payload, {
      input: 'input_tokens',
      output: 'output_tokens',
      cached: ['cache_read_input_tokens'],
    });
    const content = (payload as { content?: unknown }).content;
    if (!Array.isArray(content)) return { text: '', toolCalls: [], usage };

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

    return { text, toolCalls, usage };
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
