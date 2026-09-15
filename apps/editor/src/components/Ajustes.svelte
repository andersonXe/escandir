<script lang="ts">
  import { PROVIDERS, providerById } from '../lib/ai/registry.js';
  import { endpointWarning, type ProviderConfig } from '../lib/ai/types.js';

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

  /**
   * O aviso sobre o endereço, quando há o que avisar.
   *
   * A prosa da tela já dizia "a chave vai para onde este campo apontar", e isso
   * não bastava: ninguém lê o parágrafo depois de colar. O aviso aparece preso
   * ao campo, no momento em que o endereço deixa de ser seguro.
   */
  const aviso = $derived(endpointWarning(config.baseUrl));

  /**
   * Endereço alterado com chave já guardada é o momento a confirmar.
   *
   * Não é paranoia: colar um endereço é o gesto que redireciona a credencial, e
   * é o único ponto do app em que um erro de digitação manda a chave do autor
   * para um estranho. Confirmar uma vez custa um clique.
   */
  let enderecoPendente = $state<string | null>(null);

  function mudarEndereco(valor: string): void {
    const mesmoDestino = valor.trim() === config.baseUrl.trim();
    if (mesmoDestino) return;
    // Sem chave não há o que vazar, e apagar o campo volta ao padrão do
    // provedor — nos dois casos a confirmação seria cerimônia.
    if (config.apiKey.trim() === '' || valor.trim() === '') {
      onchange({ ...config, baseUrl: valor });
      return;
    }
    enderecoPendente = valor;
  }

  function confirmarEndereco(): void {
    if (enderecoPendente === null) return;
    onchange({ ...config, baseUrl: enderecoPendente });
    enderecoPendente = null;
  }

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
    <!-- `onchange`, não `oninput`: confirmar a cada tecla de um endereço sendo
         digitado seria insuportável. O gesto a confirmar é o endereço pronto. -->
    <input
      class="campo largo"
      class:atencao={aviso !== null}
      spellcheck="false"
      placeholder={provider.defaultBaseUrl}
      aria-label="endereço da API"
      value={enderecoPendente ?? config.baseUrl}
      onchange={(event) => mudarEndereco(event.currentTarget.value)}
    />

    {#if enderecoPendente !== null}
      <div class="confirmar">
        <p>
          A chave passa a ser enviada para <strong>{enderecoPendente}</strong>.
          {#if endpointWarning(enderecoPendente) !== null}
            <span class="perigo">{endpointWarning(enderecoPendente)}.</span>
          {/if}
        </p>
        <div class="linha">
          <button class="chip small on" onclick={confirmarEndereco}>mandar a chave para lá</button>
          <button class="chip small" onclick={() => (enderecoPendente = null)}>cancelar</button>
        </div>
      </div>
    {:else if aviso !== null}
      <p class="erro">{aviso}</p>
    {/if}

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

  .campo.atencao {
    border-color: var(--err);
  }

  .confirmar {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    border-left: 2px solid var(--err);
    background: var(--sel);
    border-radius: 0 3px 3px 0;
  }

  .confirmar p {
    font-size: 12px;
    color: var(--ink2);
    line-height: 1.6;
    margin: 0;
    max-width: 52ch;
    /* Endereço longo não pode empurrar a coluna para fora da tela. */
    overflow-wrap: anywhere;
  }

  .perigo {
    color: var(--err);
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
