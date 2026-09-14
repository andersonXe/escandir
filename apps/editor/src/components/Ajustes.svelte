<script lang="ts">
  import { PROVIDERS, providerById } from '../lib/ai/registry.js';
  import type { ProviderConfig } from '../lib/ai/types.js';

  interface Props {
    config: ProviderConfig;
    onchange: (next: ProviderConfig) => void;
    onclear: () => void;
    onclose: () => void;
  }

  const { config, onchange, onclear, onclose }: Props = $props();

  let modelos = $state<string[]>([]);
  let buscando = $state(false);
  let erro = $state<string | null>(null);

  const provider = $derived(providerById(config.providerId) ?? PROVIDERS[0]!);
  const sugestoes = $derived(modelos.length > 0 ? modelos : provider.fallbackModels);

  async function buscarModelos(): Promise<void> {
    if (provider.listModels === undefined || config.apiKey.trim() === '') return;
    buscando = true;
    erro = null;
    try {
      modelos = await provider.listModels(config);
      if (modelos.length === 0) erro = 'o provedor não listou modelos';
    } catch (e) {
      erro = e instanceof Error ? e.message : 'falha ao buscar modelos';
    } finally {
      buscando = false;
    }
  }

  function trocarProvedor(id: string): void {
    modelos = [];
    erro = null;
    const proximo = providerById(id);
    onchange({
      providerId: id,
      apiKey: config.apiKey,
      // Modelo não atravessa provedor: nome de um não existe no outro.
      model: proximo?.fallbackModels[0] ?? '',
      baseUrl: '',
    });
  }
</script>

<div class="ajustes">
  <div class="intro">
    <h1>Quem propõe</h1>
    <p>
      A chave é sua e fica neste navegador. Não há servidor neste projeto — a chamada sai daqui
      direto para o endereço abaixo, e é só para lá que a chave vai.
    </p>
  </div>

  <section>
    <div class="label">provedor</div>
    <div class="chips">
      {#each PROVIDERS as p (p.id)}
        <button class="chip" class:on={p.id === config.providerId} onclick={() => trocarProvedor(p.id)}>
          {p.name}
        </button>
      {/each}
    </div>
  </section>

  <section>
    <div class="label">chave</div>
    <input
      class="campo largo"
      type="password"
      autocomplete="off"
      spellcheck="false"
      placeholder="cole aqui a sua chave"
      aria-label="chave da API"
      value={config.apiKey}
      oninput={(event) => onchange({ ...config, apiKey: event.currentTarget.value })}
    />
    <p class="nota">
      <a href={provider.keyUrl} target="_blank" rel="noopener noreferrer">onde pegar a chave</a>
    </p>
  </section>

  <section>
    <div class="label">modelo</div>
    <div class="linha">
      <input
        class="campo"
        list="modelos-ia"
        spellcheck="false"
        placeholder="nome do modelo"
        aria-label="modelo"
        value={config.model}
        oninput={(event) => onchange({ ...config, model: event.currentTarget.value })}
      />
      <datalist id="modelos-ia">
        {#each sugestoes as modelo (modelo)}
          <option value={modelo}></option>
        {/each}
      </datalist>
      {#if provider.listModels !== undefined}
        <button class="chip small" disabled={buscando || config.apiKey.trim() === ''} onclick={buscarModelos}>
          {buscando ? 'buscando…' : 'buscar do provedor'}
        </button>
      {/if}
    </div>
    <!-- Campo livre de propósito: modelo lançado ontem precisa funcionar hoje,
         sem versão nova do editor. A lista é atalho, não catálogo. -->
    <p class="nota">
      Texto livre. {modelos.length > 0
        ? `${modelos.length} modelos listados pelo provedor.`
        : 'As sugestões são ponto de partida e envelhecem.'}
    </p>
  </section>

  <section>
    <div class="label">endereço</div>
    <input
      class="campo largo"
      spellcheck="false"
      placeholder={provider.defaultBaseUrl}
      aria-label="endereço da API"
      value={config.baseUrl}
      oninput={(event) => onchange({ ...config, baseUrl: event.currentTarget.value })}
    />
    <p class="nota">
      Vazio usa o padrão. Trocar aqui alcança qualquer serviço que fale o mesmo protocolo —
      compatíveis, roteadores, modelo rodando na sua máquina. <strong>A chave vai para onde este
      campo apontar</strong>, então confira antes de mudar.
    </p>
  </section>

  {#if erro !== null}
    <p class="erro">{erro}</p>
  {/if}

  <div class="foot">
    <button class="link" onclick={onclear}>apagar chave deste navegador</button>
    <button class="go" onclick={onclose}>Voltar ao poema</button>
  </div>
</div>

<style>
  .ajustes {
    width: var(--colw);
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .intro h1 {
    font-family: Spectral, Georgia, serif;
    font-size: 28px;
    font-weight: 400;
    color: var(--ink);
    margin: 0 0 8px;
  }

  .intro p {
    font-size: 13px;
    color: var(--ink2);
    line-height: 1.6;
    max-width: 48ch;
    margin: 0;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink3);
  }

  .linha {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .chip {
    font: inherit;
    font-size: 13px;
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid var(--rule);
    background: transparent;
    color: var(--ink2);
    cursor: pointer;
  }

  .chip.small {
    font-size: 11.5px;
    padding: 6px 12px;
  }

  .chip:hover:not(:disabled) {
    background: var(--sel);
    color: var(--ink);
  }

  .chip.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }

  .chip:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .campo {
    font: inherit;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    padding: 8px 10px;
    border-radius: 3px;
    border: 1px solid var(--rule);
    background: var(--surface);
    color: var(--ink);
    outline: none;
    width: 260px;
  }

  .campo.largo {
    width: 100%;
    box-sizing: border-box;
  }

  .campo:focus {
    border-color: var(--ink3);
  }

  .nota {
    font-size: 11.5px;
    color: var(--ink3);
    line-height: 1.6;
    margin: 0;
    max-width: 52ch;
  }

  .nota a {
    color: var(--elis);
  }

  .erro {
    font-size: 12px;
    color: var(--err);
    margin: 0;
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
    padding-top: 20px;
    border-top: 1px solid var(--rule);
  }

  .link {
    font: inherit;
    font-size: 11.5px;
    background: none;
    border: 0;
    padding: 0;
    color: var(--ink3);
    cursor: pointer;
  }

  .link:hover {
    color: var(--err);
  }

  .go {
    font: inherit;
    font-size: 13px;
    padding: 10px 20px;
    border-radius: 999px;
    border: 0;
    background: var(--ink);
    color: var(--paper);
    cursor: pointer;
  }
</style>
