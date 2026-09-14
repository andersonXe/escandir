/**
 * Chave fonêmica da terminação, para comparar rima por som e não por letra.
 *
 * Rima é som. "ca-ça" e "mas-sa" rimam; "giz" e "quis" rimam; "mal" e "mau"
 * rimam. Comparar grafia recusa os três, e nenhum poeta aceitaria a recusa.
 *
 * Não é transcrição fonética: é uma **chave canônica**, boa o bastante para
 * dizer se duas terminações soam igual. Colapsa as famílias que a ortografia
 * separa sem motivo sonoro e ignora o que não muda o julgamento de rima.
 *
 * Limitação conhecida: `x` tem quatro leituras em português (/ʃ/ em "xarope",
 * /ks/ em "táxi", /s/ em "máximo", /z/ em "exame") e aqui vira sempre /ʃ/.
 * Terminação com `x` depois da tônica é rara; quando aparecer, erra.
 */

const SEM_ACENTO: ReadonlyMap<string, string> = new Map([
  ['á', 'a'], ['â', 'a'], ['à', 'a'],
  ['é', 'e'], ['ê', 'e'],
  ['í', 'i'],
  ['ó', 'o'], ['ô', 'o'],
  ['ú', 'u'], ['ü', 'u'],
]);

const VOGAIS = 'aeiouãõ';

function isVowel(c: string): boolean {
  return c !== '' && VOGAIS.includes(c);
}

function at(s: string, i: number): string {
  return s[i] ?? '';
}

/**
 * Converte a terminação (da vogal tônica ao fim) numa chave de som.
 *
 * Marcas usadas: `~` nasaliza a vogal anterior, `L` = lh, `N` = nh,
 * `X` = ch/x, `Z` = j/g(e,i), `R` = rr, `w`/`y` = semivogais.
 */
export function rhymeSound(tail: string): string {
  const s = [...tail.toLowerCase().normalize('NFC')]
    .map((c) => SEM_ACENTO.get(c) ?? c)
    .join('');

  const out: string[] = [];
  let i = 0;

  const nasalizar = (): void => {
    // A nasal de coda não é consoante própria: ela muda a vogal de antes.
    if (out.length > 0 && out[out.length - 1] !== '~') out.push('~');
  };

  while (i < s.length) {
    const c = at(s, i);
    const n = at(s, i + 1);
    const depois = at(s, i + 2);
    const anterior = out[out.length - 1] ?? '';

    if (c === 'l' && n === 'h') {
      out.push('L');
      i += 2;
    } else if (c === 'n' && n === 'h') {
      out.push('N');
      i += 2;
    } else if (c === 'c' && n === 'h') {
      out.push('X');
      i += 2;
    } else if (c === 's' && n === 's') {
      out.push('s');
      i += 2;
    } else if (c === 'r' && n === 'r') {
      out.push('R');
      i += 2;
    } else if ((c === 'q' || c === 'g') && n === 'u') {
      const base = c === 'q' ? 'k' : 'g';
      // O `u` é mudo antes de e/i e semivogal antes de a/o.
      out.push(depois === 'e' || depois === 'i' ? base : `${base}w`);
      i += 2;
    } else if (c === 'ç') {
      out.push('s');
      i += 1;
    } else if (c === 'c') {
      out.push(n === 'e' || n === 'i' ? 's' : 'k');
      i += 1;
    } else if (c === 'g') {
      out.push(n === 'e' || n === 'i' ? 'Z' : 'g');
      i += 1;
    } else if (c === 'j') {
      out.push('Z');
      i += 1;
    } else if (c === 'x') {
      out.push('X');
      i += 1;
    } else if (c === 'h') {
      i += 1;
    } else if (c === 'z') {
      // Em fim de palavra o `z` ensurdece: "paz" soa como "pás".
      out.push(n === '' ? 's' : 'z');
      i += 1;
    } else if (c === 's') {
      // Entre vogais soa /z/ — é o que separa "casa" de "caça".
      out.push(isVowel(anterior) && isVowel(n) ? 'z' : 's');
      i += 1;
    } else if (c === 'l') {
      // `l` que fecha sílaba virou /w/ no Brasil: "mal" rima com "mau".
      out.push(isVowel(n) ? 'l' : 'w');
      i += 1;
    } else if (c === 'm' || c === 'n') {
      if (isVowel(n)) out.push(c);
      else nasalizar();
      i += 1;
    } else if (c === 'ã' || c === 'õ') {
      out.push(c === 'ã' ? 'a' : 'o');
      out.push('~');
      i += 1;
    } else if (isVowel(c)) {
      // Depois de vogal, `i`/`u` são semivogais — e é isso que faz "au" e
      // "al" caírem na mesma chave.
      const glide = (c === 'i' || c === 'u') && (isVowel(anterior) || anterior === '~');
      if (glide) out.push(c === 'i' ? 'y' : 'w');
      else out.push(c);
      i += 1;
    } else {
      out.push(c);
      i += 1;
    }
  }

  // Vogal átona final se fecha no Brasil: "bolo" soa "bolu", "sede" soa "sedi".
  // A primeira vogal da terminação é a tônica e nunca reduz.
  const chave = out.join('');
  return chave.replace(/o$/, 'u').replace(/e$/, 'i');
}

/** Só as vogais: é o que a rima toante compara. */
export function rhymeVowels(sound: string): string {
  return [...sound].filter((c) => 'aeiouwy~'.includes(c)).join('');
}
