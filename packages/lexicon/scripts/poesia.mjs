/**
 * Coleta o vocabulário de poesia em domínio público do Wikisource.
 *
 * Legenda de cinema é o corpus do que se **fala**. Falta nele justamente o que
 * se procura ao rimar: "dardeja", "acalentara", "ardentias", "plagas". Este
 * script lê a obra de poetas mortos há mais de setenta anos e conta as
 * palavras. O resultado, `data/poesia.txt`, é versionado: é a parte do
 * dicionário que é nossa, e não depende de o Wikisource estar no ar na hora
 * do deploy.
 *
 * Aqui não se filtra nada além de marcação. Grafia antiga ("dous",
 * "tranqüilo"), nome próprio e erro de transcrição entram na contagem; quem
 * decide o que é palavra é o gerador, pelo corretor ortográfico. Assim a lista
 * guarda o que os poemas dizem, e o critério fica num lugar só.
 *
 * Uso (raramente — o resultado está no repositório):
 *   node scripts/poesia.mjs
 */

import { writeFile } from 'node:fs/promises';

const API = 'https://pt.wikisource.org/w/api.php';
// A política da Wikimedia pede identificação de quem faz as requisições.
const AGENTE = 'escandir-lexico/1.0 (https://github.com/andersonXe/escandir)';

/**
 * Poetas de língua portuguesa mortos antes de 1956: domínio público no Brasil,
 * onde a proteção dura setenta anos a partir do ano seguinte à morte.
 * Os portugueses entram pelo vocabulário; a grafia de Portugal ("acção") o
 * corretor pt_BR recusa sozinho.
 */
const AUTORES = [
  'Olavo Bilac',
  'Castro Alves',
  'Gonçalves Dias',
  'Álvares de Azevedo',
  'Casimiro de Abreu',
  'Fagundes Varela',
  'Cruz e Sousa',
  'Augusto dos Anjos',
  'Alphonsus de Guimaraens',
  'Raimundo Correia',
  'Alberto de Oliveira',
  'Vicente de Carvalho',
  'Machado de Assis',
  'Gregório de Matos',
  'Tomás Antônio Gonzaga',
  'Cláudio Manuel da Costa',
  'Sousândrade',
  'Luís Delfino',
  'Bernardino Lopes',
  'Luís Vaz de Camões',
  'Antero de Quental',
  'Cesário Verde',
  'Florbela Espanca',
  'Fernando Pessoa',
];

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  for (let tentativa = 1; ; tentativa += 1) {
    const resposta = await fetch(url, { headers: { 'User-Agent': AGENTE } });
    if (resposta.ok) return resposta.json();
    if (tentativa >= 3) throw new Error(`${resposta.status} em ${url}`);
    await espera(2000 * tentativa);
  }
}

/** Páginas de uma categoria, descendo um nível nas subcategorias. */
async function paginas(categoria, profundidade = 1) {
  const titulos = [];
  let continuar = {};
  do {
    const dados = await api({
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Categoria:${categoria}`,
      cmlimit: '500',
      ...continuar,
    });
    for (const membro of dados.query?.categorymembers ?? []) {
      if (membro.ns === 0) titulos.push(membro.title);
      else if (membro.ns === 14 && profundidade > 0) {
        titulos.push(...(await paginas(membro.title.replace(/^Categoria:/, ''), profundidade - 1)));
      }
    }
    continuar = dados.continue ?? null;
  } while (continuar !== null);
  return titulos;
}

async function textos(titulos) {
  const saida = [];
  for (let i = 0; i < titulos.length; i += 50) {
    const dados = await api({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      titles: titulos.slice(i, i + 50).join('|'),
    });
    for (const pagina of dados.query?.pages ?? []) {
      const conteudo = pagina.revisions?.[0]?.slots?.main?.content;
      if (typeof conteudo === 'string') saida.push(conteudo);
    }
    await espera(300);
  }
  return saida;
}

/** Só o texto: tira predefinição, ligação, referência, tag e cabeçalho. */
function limpar(wikitexto) {
  let texto = wikitexto;
  // Predefinições podem aninhar; tira de dentro para fora.
  for (let i = 0; i < 5; i += 1) texto = texto.replace(/\{\{[^{}]*\}\}/g, ' ');
  return texto
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, ' ')
    .replace(/\[\[(?:Categoria|Category|Ficheiro|File|Imagem):[^\]]*\]\]/gi, ' ')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:[^\]]*\]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^=+.*=+$/gm, ' ')
    .replace(/'{2,}/g, '');
}

const contagem = new Map();
const vistos = new Set();
const origem = [];

for (const autor of AUTORES) {
  const titulos = (await paginas(autor)).filter((t) => !vistos.has(t));
  for (const t of titulos) vistos.add(t);
  let palavras = 0;
  for (const texto of await textos(titulos)) {
    for (const palavra of limpar(texto).toLowerCase().normalize('NFC').match(/\p{L}+(?:-\p{L}+)*/gu) ?? []) {
      contagem.set(palavra, (contagem.get(palavra) ?? 0) + 1);
      palavras += 1;
    }
  }
  origem.push(`# ${autor}: ${titulos.length} páginas, ${palavras} palavras`);
  console.log(origem.at(-1).slice(2));
}

const linhas = [...contagem]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
  .map(([palavra, n]) => `${palavra} ${n}`);

await writeFile(
  new URL('../data/poesia.txt', import.meta.url),
  [
    '# Vocabulário de poesia em domínio público, do Wikisource (pt.wikisource.org).',
    '# Gerado por scripts/poesia.mjs. Formato: palavra contagem.',
    ...origem,
    ...linhas,
    '',
  ].join('\n'),
  'utf8',
);
console.log(`${linhas.length} palavras distintas`);
