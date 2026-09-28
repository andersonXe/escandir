/**
 * Expande um dicionário Hunspell (.dic + .aff) em todas as formas que ele
 * reconhece.
 *
 * O .dic guarda radicais com marcas de flexão — "cantar" com a marca de "verbo
 * em -ar" —, e o .aff diz o que cada marca gera. A lista de palavras que o
 * léxico usava antes era só a dos radicais: tinha "cantar" e não "cantava", e
 * quase metade das palavras em fim de verso de Bilac e Castro Alves ficava de
 * fora.
 *
 * Não é um Hunspell completo. Cobre o que o VERO (pt_BR do LibreOffice) usa:
 * prefixos e sufixos com condição, produto cruzado entre eles, e marca de
 * palavra proibida. Não cobre composição nem sufixo encadeado, que o VERO não
 * usa — e o gerador falha alto se um dia usar, em vez de expandir errado.
 *
 * Existe um corretor em JavaScript pronto (nspell), e foi testado: levou mais
 * de dez minutos só para carregar este dicionário. A expansão direta leva
 * segundos, e não acrescenta dependência.
 */

import { readFileSync } from 'node:fs';

/** Primeira linha do .dic é a contagem; o resto é `radical/marcas`. */
function lerDic(path) {
  const linhas = readFileSync(path, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  return linhas.slice(1).flatMap((linha) => {
    // Campos morfológicos, quando há, vêm depois de espaço ou tabulação.
    const campo = linha.split(/[\t ]/)[0]?.trim() ?? '';
    if (campo === '') return [];
    const barra = campo.indexOf('/');
    return [barra < 0 ? { radical: campo, marcas: '' } : { radical: campo.slice(0, barra), marcas: campo.slice(barra + 1) }];
  });
}

function lerAff(path) {
  const linhas = readFileSync(path, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  const grupos = new Map();
  let proibida = '';
  let naoSugerir = '';
  for (const bruta of linhas) {
    const linha = bruta.replace(/#.*$/, '').trim();
    if (linha === '') continue;
    const campos = linha.split(/\s+/);
    const [tipo] = campos;
    if (tipo === 'FORBIDDENWORD') proibida = campos[1] ?? '';
    if (tipo === 'NOSUGGEST') naoSugerir = campos[1] ?? '';
    if (tipo === 'FLAG' && campos[1] !== 'UTF-8') throw new Error(`FLAG ${campos[1]} não suportado`);
    for (const nao of ['COMPOUNDFLAG', 'COMPOUNDBEGIN', 'COMPOUNDRULE', 'NEEDAFFIX', 'CIRCUMFIX', 'AF', 'COMPLEXPREFIXES']) {
      if (tipo === nao) throw new Error(`${nao} não suportado pelo expansor`);
    }
    if (tipo !== 'PFX' && tipo !== 'SFX') continue;

    const marca = campos[1];
    if (campos.length === 4 && (campos[2] === 'Y' || campos[2] === 'N')) {
      grupos.set(marca, { tipo, cruza: campos[2] === 'Y', regras: [] });
      continue;
    }
    const grupo = grupos.get(marca);
    if (grupo === undefined) throw new Error(`regra de ${marca} antes do cabeçalho`);
    const [, , tira, poeBruto, condicao = '.'] = campos;
    // Marca depois do afixo é sufixo encadeado. O VERO só usa isso para
    // marcar como "não sugerir" os nomes de estado gerados das siglas — nome
    // próprio, que o léxico descarta. Qualquer outra marca seria flexão que
    // este expansor não sabe fazer: melhor falhar do que expandir errado.
    const [poeTexto, continua = ''] = poeBruto.split('/');
    for (const m of continua) {
      if (m !== naoSugerir && m !== proibida) throw new Error(`sufixo encadeado em ${marca} não suportado`);
    }
    if (continua !== '') continue;
    const poe = poeTexto === '0' ? '' : poeTexto;
    const corta = tira === '0' ? '' : tira;
    const re = tipo === 'SFX' ? new RegExp(`${condicao}$`, 'u') : new RegExp(`^${condicao}`, 'u');
    grupo.regras.push({ corta, poe, re });
  }
  return { grupos, proibida };
}

function aplica(palavra, grupo) {
  const saida = [];
  for (const { corta, poe, re } of grupo.regras) {
    if (!re.test(palavra)) continue;
    if (grupo.tipo === 'SFX') {
      if (corta !== '' && !palavra.endsWith(corta)) continue;
      saida.push(palavra.slice(0, palavra.length - corta.length) + poe);
    } else {
      if (corta !== '' && !palavra.startsWith(corta)) continue;
      saida.push(poe + palavra.slice(corta.length));
    }
  }
  return saida;
}

/**
 * Todas as formas reconhecidas, em minúscula, e à parte os radicais — a forma
 * de dicionário de cada entrada. Radical em maiúscula (nome próprio, sigla)
 * fica de fora: "Maria" é nome, e o léxico de rimas não quer nome.
 */
export function expandir(dicPath, affPath) {
  const { grupos, proibida } = lerAff(affPath);
  const formas = new Set();
  const radicais = new Set();
  const proibidas = new Set();

  for (const { radical, marcas } of lerDic(dicPath)) {
    if (radical !== radical.toLowerCase()) continue;
    const lista = [...marcas];
    const destino = proibida !== '' && lista.includes(proibida) ? proibidas : formas;
    destino.add(radical);
    if (destino === formas) radicais.add(radical);

    const sufixos = lista.map((m) => grupos.get(m)).filter((g) => g?.tipo === 'SFX');
    const prefixos = lista.map((m) => grupos.get(m)).filter((g) => g?.tipo === 'PFX');
    const comSufixo = [];
    for (const g of sufixos) {
      for (const f of aplica(radical, g)) {
        destino.add(f);
        if (g.cruza) comSufixo.push(f);
      }
    }
    for (const g of prefixos) {
      for (const f of aplica(radical, g)) destino.add(f);
      if (!g.cruza) continue;
      for (const base of comSufixo) for (const f of aplica(base, g)) destino.add(f);
    }
  }
  for (const p of proibidas) {
    formas.delete(p);
    radicais.delete(p);
  }
  return { formas, radicais };
}
