/**
 * Corpus de palavras escandidas à mão.
 *
 * Escansão é domínio onde cobertura de linha não diz nada: uma regra pode
 * executar em todos os ramos e ainda estar errada. Só este arquivo pega
 * regressão. Toda regra nova entra com os casos que ela existe para resolver
 * *e* com os casos vizinhos que ela não pode quebrar.
 *
 * Formato: sílabas separadas por `|`, tônica em caixa alta.
 */

export type GoldenWord = readonly [word: string, pattern: string];

export const PALAVRAS: readonly GoldenWord[] = [
  // --- Paroxítonas regulares -----------------------------------------------
  ['casa', 'CA|sa'],
  ['menino', 'me|NI|no'],
  ['janela', 'ja|NE|la'],
  ['caderno', 'ca|DER|no'],
  ['palavra', 'pa|LA|vra'],
  ['livro', 'LI|vro'],

  // --- Oxítonas -------------------------------------------------------------
  ['amor', 'a|MOR'],
  ['papel', 'pa|PEL'],
  ['feliz', 'fe|LIZ'],
  ['rapaz', 'ra|PAZ'],
  ['jardim', 'jar|DIM'],
  ['comum', 'co|MUM'],
  ['café', 'ca|FÉ'],
  ['avó', 'a|VÓ'],
  ['alguém', 'al|GUÉM'],
  ['porém', 'po|RÉM'],

  // --- Proparoxítonas (sempre acentuadas, resolvidas pelo acento) -----------
  ['sílaba', 'SÍ|la|ba'],
  ['último', 'ÚL|ti|mo'],
  ['lâmpada', 'LÂM|pa|da'],
  ['médico', 'MÉ|di|co'],
  ['pêssego', 'PÊS|se|go'],

  // --- Monossílabos ---------------------------------------------------------
  ['pé', 'PÉ'],
  ['mar', 'MAR'],
  ['sol', 'SOL'],
  ['luz', 'LUZ'],
  ['flor', 'FLOR'],
  ['três', 'TRÊS'],
  ['pneu', 'PNEU'],

  // --- Dígrafos e grupos consonantais --------------------------------------
  // rr/ss/sc/xc separam; consoante + l/r não.
  ['carro', 'CAR|ro'],
  ['passo', 'PAS|so'],
  ['nascer', 'nas|CER'],
  ['exceto', 'ex|CE|to'],
  ['chave', 'CHA|ve'],
  ['filho', 'FI|lho'],
  ['banho', 'BA|nho'],
  ['abraço', 'a|BRA|ço'],
  ['abstrato', 'abs|TRA|to'],
  ['constante', 'cons|TAN|te'],
  ['perspectiva', 'pers|pec|TI|va'],
  ['ritmo', 'RIT|mo'],
  ['digno', 'DIG|no'],
  ['absoluto', 'ab|so|LU|to'],
  ['escrever', 'es|cre|VER'],
  ['sublinhar', 'su|bli|NHAR'],
  ['psicologia', 'psi|co|lo|GI|a'],
  ['atlas', 'A|tlas'],

  // --- Ditongos decrescentes ------------------------------------------------
  ['pai', 'PAI'],
  ['lei', 'LEI'],
  ['céu', 'CÉU'],
  ['boi', 'BOI'],
  ['mau', 'MAU'],
  ['dois', 'DOIS'],
  ['saudade', 'sau|DA|de'],
  ['dinheiro', 'di|NHEI|ro'],
  ['coisa', 'COI|sa'],
  ['depois', 'de|POIS'],
  ['azuis', 'a|ZUIS'],
  ['museus', 'mu|SEUS'],
  ['ainda', 'AIN|da'],
  ['ideia', 'i|DEI|a'],
  ['praia', 'PRAI|a'],
  ['joia', 'JOI|a'],
  ['cadeia', 'ca|DEI|a'],
  ['muito', 'MUI|to'],
  ['viu', 'VIU'],
  ['fui', 'FUI'],

  // --- Hiatos ---------------------------------------------------------------
  ['poeta', 'po|E|ta'],
  ['poesia', 'po|e|SI|a'],
  ['voo', 'VO|o'],
  ['caos', 'CA|os'],
  ['área', 'Á|re|a'],
  ['aéreo', 'a|É|re|o'],
  // Acento sobre vogal fraca desfaz o ditongo.
  ['saída', 'sa|Í|da'],
  ['país', 'pa|ÍS'],
  ['saúde', 'sa|Ú|de'],
  ['ciúme', 'ci|Ú|me'],
  // Fraca + forte fora da sílaba final: hiato.
  ['piano', 'pi|A|no'],
  ['criança', 'cri|AN|ça'],
  ['ciência', 'ci|ÊN|cia'],
  ['idiota', 'i|di|O|ta'],

  // --- O par que a ortografia distingue ------------------------------------
  // Sem acento, a fraca final é a tônica e o encontro é hiato; com acento
  // antes dela, o encontro é ditongo crescente.
  ['dia', 'DI|a'],
  ['rio', 'RI|o'],
  ['vazio', 'va|ZI|o'],
  ['sabia', 'sa|BI|a'],
  ['energia', 'e|ner|GI|a'],
  ['história', 'his|TÓ|ria'],
  ['série', 'SÉ|rie'],
  ['família', 'fa|MÍ|lia'],
  ['memória', 'me|MÓ|ria'],
  ['vácuo', 'VÁ|cuo'],
  ['mútua', 'MÚ|tua'],
  // "historia" (verbo) não tem acento: volta a ser hiato.
  ['historia', 'his|to|RI|a'],

  // --- Vogal fraca tônica por exigência da terminação ----------------------
  ['cair', 'ca|IR'],
  ['juiz', 'ju|IZ'],
  ['raiz', 'ra|IZ'],
  ['ruim', 'ru|IM'],
  ['possuir', 'pos|su|IR'],
  ['pior', 'pi|OR'],
  ['maior', 'mai|OR'],
  ['cruel', 'cru|EL'],
  // O `s` de plural não conta: o ditongo sobrevive.
  ['pais', 'PAIS'],

  // --- `nh` desfaz o ditongo anterior --------------------------------------
  ['rainha', 'ra|I|nha'],
  ['moinho', 'mo|I|nho'],
  ['bainha', 'ba|I|nha'],

  // --- Nasais e til ---------------------------------------------------------
  ['não', 'NÃO'],
  ['mãe', 'MÃE'],
  ['põe', 'PÕE'],
  ['irmã', 'ir|MÃ'],
  ['coração', 'co|ra|ÇÃO'],
  ['razão', 'ra|ZÃO'],
  ['leões', 'le|ÕES'],
  ['cantarão', 'can|ta|RÃO'],
  // Agudo/circunflexo vencem o til.
  ['órgão', 'ÓR|gão'],
  ['bênção', 'BÊN|ção'],
  // Sem til, `-am`/`-em`/`-ens` são terminações de paroxítona.
  ['cantam', 'CAN|tam'],
  ['homem', 'HO|mem'],
  ['jovens', 'JO|vens'],
  ['campo', 'CAM|po'],
  ['canto', 'CAN|to'],

  // --- `qu` / `gu`: o `u` nunca abre sílaba --------------------------------
  ['quando', 'QUAN|do'],
  ['quase', 'QUA|se'],
  ['aquele', 'a|QUE|le'],
  ['guerra', 'GUER|ra'],
  ['guia', 'GUI|a'],
  ['águia', 'Á|guia'],
  ['água', 'Á|gua'],
  ['linguiça', 'lin|GUI|ça'],
  ['paraguai', 'pa|ra|GUAI'],
  ['equação', 'e|qua|ÇÃO'],
  ['cinquenta', 'cin|QUEN|ta'],

  // --- Hífen e apóstrofo ----------------------------------------------------
  ['dá-lo', 'DÁ-|lo'],
  ['diz-me', 'DIZ-|me'],
  ['sabe-se', 'sa|BE-|se'],
  ['guarda-chuva', 'guar|da-|CHU|va'],
  ['bem-vindo', 'bem-|VIN|do'],
  ["d'água", "D'Á|gua"],

  // --- Léxico: o que a regra erra -------------------------------------------
  ['reunir', 're|u|NIR'],
  ['reunião', 're|u|ni|ÃO'],
  ['mágoa', 'MÁ|goa'],
  ['nódoa', 'NÓ|doa'],
  ['ao', 'AO'],
  ['aos', 'AOS'],
  ['proibir', 'pro|i|BIR'],
  ['coincidir', 'co|in|ci|DIR'],
  // Vizinhas que a regra acerta e o léxico não pode roubar.
  ['reumatismo', 'reu|ma|TIS|mo'],
  ['proa', 'PRO|a'],
  ['aonde', 'a|ON|de'],
  ['coroa', 'co|RO|a'],
  ['lagoa', 'la|GO|a'],
  ['reúne', 're|Ú|ne'],

  // --- Verificados por sondagem, fora do corpus inicial ---------------------
  // Rodados contra o motor e conferidos um a um; entram aqui para travar.
  ['soneto', 'so|NE|to'],
  ['quinhentos', 'qui|NHEN|tos'],
  ['naufrágio', 'nau|FRÁ|gio'],
  ['saguão', 'sa|GUÃO'],
  ['perpétua', 'per|PÉ|tua'],
  ['oceano', 'o|ce|A|no'],
  ['oceânico', 'o|ce|Â|ni|co'],
  ['silêncio', 'si|LÊN|cio'],
  ['anteontem', 'an|te|ON|tem'],
  ['entreouvir', 'en|tre|ou|VIR'],
  ['aguardente', 'a|guar|DEN|te'],
  ['tranquilo', 'tran|QUI|lo'],
  ['sequência', 'se|QUÊN|cia'],
  ['averiguei', 'a|ve|ri|GUEI'],
  ['inúteis', 'i|NÚ|teis'],
  ['heroico', 'he|ROI|co'],
  ['herói', 'he|RÓI'],
  ['veículo', 've|Í|cu|lo'],
  ['egoísta', 'e|go|ÍS|ta'],
  ['balaústre', 'ba|la|ÚS|tre'],
  ['cafeína', 'ca|fe|Í|na'],
  ['faísca', 'fa|ÍS|ca'],
  ['miúdo', 'mi|Ú|do'],
  ['feiura', 'fei|U|ra'],
  ['poeira', 'po|EI|ra'],
  ['teatro', 'te|A|tro'],
  ['ideal', 'i|de|AL'],
  ['europa', 'eu|RO|pa'],
  ['abençoe', 'a|ben|ÇO|e'],
  ['magoado', 'ma|go|A|do'],
  ['suave', 'su|A|ve'],
  ['luar', 'lu|AR'],
  ['apoio', 'a|POI|o'],
  ['destruir', 'des|tru|IR'],
  ['beira-mar', 'bei|ra-|MAR'],
];

/** Palavras átonas: têm tônica, mas não firmam posição métrica. */
export const ATONAS: readonly string[] = [
  'o', 'a', 'os', 'as', 'de', 'do', 'da', 'em', 'no', 'na',
  'que', 'e', 'se', 'me', 'te', 'lhe', 'por', 'com', 'para', 'um',
  // Polissilábicas de classe fechada: a régua não marca tempo forte nelas.
  'sobre', 'entre', 'quando', 'como', 'onde', 'depois',
];

/** Contraprova: palavras plenas que devem continuar tônicas. */
export const TONICAS: readonly string[] = [
  'mar', 'sol', 'é', 'vai', 'noite', 'dor', 'vento', 'nome', 'ele', 'nada',
];
