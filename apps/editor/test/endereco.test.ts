/**
 * O endereço para onde a chave do autor é enviada.
 *
 * É o único campo do editor em que um erro de digitação manda a credencial de
 * alguém para um estranho. A prosa da tela já avisava disso, e não bastava:
 * ninguém lê o parágrafo depois de colar. Daí a checagem, e daí estes testes —
 * o que se quer garantir é que `http://` nunca passe em silêncio, e que
 * `localhost` nunca seja recusado, porque modelo local é metade do motivo de o
 * campo ser editável.
 */

import { describe, expect, test } from 'vitest';

import { endpointWarning } from '../src/lib/ai/types.js';

describe('endereços que passam sem aviso', () => {
  test('vazio usa o padrão do provedor', () => {
    expect(endpointWarning('')).toBeNull();
    expect(endpointWarning('   ')).toBeNull();
  });

  test('https é o caso normal', () => {
    expect(endpointWarning('https://api.openai.com/v1')).toBeNull();
    expect(endpointWarning('https://api.anthropic.com')).toBeNull();
  });

  test('modelo rodando na máquina do autor não sai da máquina', () => {
    expect(endpointWarning('http://localhost:11434/v1')).toBeNull();
    expect(endpointWarning('http://127.0.0.1:1234/v1')).toBeNull();
    expect(endpointWarning('http://[::1]:8080')).toBeNull();
    expect(endpointWarning('http://ollama.localhost:11434')).toBeNull();
  });
});

describe('endereços que precisam de aviso', () => {
  test('http para fora manda a chave em claro', () => {
    expect(endpointWarning('http://api.exemplo.com/v1')).toMatch(/sem https/);
    expect(endpointWarning('http://192.168.1.50:8080')).toMatch(/sem https/);
  });

  test('texto que não é endereço é dito como tal', () => {
    expect(endpointWarning('api.openai.com')).toMatch(/não parece um endereço/);
    expect(endpointWarning('cole aqui')).toMatch(/não parece um endereço/);
  });

  test('esquema que não serve para chamar uma API é recusado', () => {
    // `javascript:` e `file:` chegam aqui se alguém colar o que não devia.
    expect(endpointWarning('javascript:alert(1)')).toMatch(/não serve/);
    expect(endpointWarning('file:///etc/passwd')).toMatch(/não serve/);
  });
});
