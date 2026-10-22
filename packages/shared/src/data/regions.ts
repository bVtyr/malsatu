/** Справочник регионов РК. Редактируется в админке; здесь — стартовые данные для сида. */
export type RegionLevel = "oblast" | "city" | "district" | "rural_okrug" | "village";

export interface RegionSeed {
  code: string;
  parent: string | null;
  level: RegionLevel;
  nameRu: string;
  nameKk: string;
  slugRu: string;
  slugKk: string;
  lat?: number;
  lng?: number;
  kato?: string; // код КАТО (при наличии)
}

export const REGIONS: RegionSeed[] = [
  // --- 3 города республиканского значения ---
  { code: "kz-ast", parent: null, level: "city", nameRu: "Астана", nameKk: "Астана", slugRu: "astana", slugKk: "astana", lat: 51.1605, lng: 71.4704, kato: "71" },
  { code: "kz-ala", parent: null, level: "city", nameRu: "Алматы", nameKk: "Алматы", slugRu: "almaty", slugKk: "almaty", lat: 43.2389, lng: 76.8897, kato: "75" },
  { code: "kz-shy", parent: null, level: "city", nameRu: "Шымкент", nameKk: "Шымкент", slugRu: "shymkent", slugKk: "shymkent", lat: 42.3417, lng: 69.5901, kato: "79" },
  // --- 17 областей ---
  { code: "kz-aba", parent: null, level: "oblast", nameRu: "область Абай", nameKk: "Абай облысы", slugRu: "abay", slugKk: "abay", lat: 50.4111, lng: 80.2275, kato: "10" },
  { code: "kz-akm", parent: null, level: "oblast", nameRu: "Акмолинская область", nameKk: "Ақмола облысы", slugRu: "akmola", slugKk: "aqmola", lat: 51.9167, lng: 69.4, kato: "11" },
  { code: "kz-akt", parent: null, level: "oblast", nameRu: "Актюбинская область", nameKk: "Ақтөбе облысы", slugRu: "aktobe", slugKk: "aqtobe", lat: 50.2839, lng: 57.1669, kato: "15" },
  { code: "kz-alm", parent: null, level: "oblast", nameRu: "Алматинская область", nameKk: "Алматы облысы", slugRu: "almaty-oblast", slugKk: "almaty-oblysy", lat: 44.85, lng: 77.0, kato: "19" },
  { code: "kz-aty", parent: null, level: "oblast", nameRu: "Атырауская область", nameKk: "Атырау облысы", slugRu: "atyrau", slugKk: "atyrau", lat: 47.1167, lng: 51.8833, kato: "23" },
  { code: "kz-vko", parent: null, level: "oblast", nameRu: "Восточно-Казахстанская область", nameKk: "Шығыс Қазақстан облысы", slugRu: "vko", slugKk: "shqo", lat: 49.9483, lng: 82.6275, kato: "63" },
  { code: "kz-zha", parent: null, level: "oblast", nameRu: "Жамбылская область", nameKk: "Жамбыл облысы", slugRu: "zhambyl", slugKk: "zhambyl", lat: 42.9, lng: 71.3667, kato: "31" },
  { code: "kz-zhe", parent: null, level: "oblast", nameRu: "область Жетісу", nameKk: "Жетісу облысы", slugRu: "zhetisu", slugKk: "zhetisu", lat: 45.0167, lng: 78.3667, kato: "33" },
  { code: "kz-zko", parent: null, level: "oblast", nameRu: "Западно-Казахстанская область", nameKk: "Батыс Қазақстан облысы", slugRu: "zko", slugKk: "bqo", lat: 51.2333, lng: 51.3667, kato: "27" },
  { code: "kz-kar", parent: null, level: "oblast", nameRu: "Карагандинская область", nameKk: "Қарағанды облысы", slugRu: "karaganda", slugKk: "qaragandy", lat: 49.8047, lng: 73.1094, kato: "35" },
  { code: "kz-kos", parent: null, level: "oblast", nameRu: "Костанайская область", nameKk: "Қостанай облысы", slugRu: "kostanay", slugKk: "qostanay", lat: 53.2144, lng: 63.6246, kato: "39" },
  { code: "kz-kzo", parent: null, level: "oblast", nameRu: "Кызылординская область", nameKk: "Қызылорда облысы", slugRu: "kyzylorda", slugKk: "qyzylorda", lat: 44.8528, lng: 65.5092, kato: "43" },
  { code: "kz-man", parent: null, level: "oblast", nameRu: "Мангистауская область", nameKk: "Маңғыстау облысы", slugRu: "mangystau", slugKk: "mangystau", lat: 43.65, lng: 51.1667, kato: "47" },
  { code: "kz-pav", parent: null, level: "oblast", nameRu: "Павлодарская область", nameKk: "Павлодар облысы", slugRu: "pavlodar", slugKk: "pavlodar", lat: 52.2873, lng: 76.9674, kato: "55" },
  { code: "kz-sko", parent: null, level: "oblast", nameRu: "Северо-Казахстанская область", nameKk: "Солтүстік Қазақстан облысы", slugRu: "sko", slugKk: "sqo", lat: 54.8667, lng: 69.15, kato: "59" },
  { code: "kz-tur", parent: null, level: "oblast", nameRu: "Туркестанская область", nameKk: "Түркістан облысы", slugRu: "turkestan", slugKk: "turkistan", lat: 43.3, lng: 68.25, kato: "61" },
  { code: "kz-uly", parent: null, level: "oblast", nameRu: "область Ұлытау", nameKk: "Ұлытау облысы", slugRu: "ulytau", slugKk: "ulytau", lat: 47.8, lng: 67.7, kato: "62" },
  // --- Районы и сёла (выборочно, для сидов; полный справочник импортируется из КАТО) ---
  { code: "kz-zha-zhambyl", parent: "kz-zha", level: "district", nameRu: "Жамбылский район", nameKk: "Жамбыл ауданы", slugRu: "zhambylskiy", slugKk: "zhambyl-audany", lat: 42.95, lng: 71.1 },
  { code: "kz-zha-zhambyl-asa", parent: "kz-zha-zhambyl", level: "village", nameRu: "с. Аса", nameKk: "Аса ауылы", slugRu: "asa", slugKk: "asa", lat: 42.9833, lng: 71.1 },
  { code: "kz-zha-merke", parent: "kz-zha", level: "district", nameRu: "Меркенский район", nameKk: "Меркі ауданы", slugRu: "merke", slugKk: "merki", lat: 42.87, lng: 73.18 },
  { code: "kz-zha-merke-merke", parent: "kz-zha-merke", level: "village", nameRu: "с. Мерке", nameKk: "Меркі ауылы", slugRu: "merke-selo", slugKk: "merki-auyly", lat: 42.8689, lng: 73.1817 },
  { code: "kz-kos-kostanay", parent: "kz-kos", level: "district", nameRu: "Костанайский район", nameKk: "Қостанай ауданы", slugRu: "kostanayskiy", slugKk: "qostanay-audany", lat: 53.1, lng: 63.5 },
  { code: "kz-kos-kostanay-zatobolsk", parent: "kz-kos-kostanay", level: "village", nameRu: "п. Тобыл", nameKk: "Тобыл кенті", slugRu: "tobyl", slugKk: "tobyl", lat: 53.1667, lng: 63.6 },
  { code: "kz-kos-auliekol", parent: "kz-kos", level: "district", nameRu: "Аулиекольский район", nameKk: "Әулиекөл ауданы", slugRu: "auliekol", slugKk: "auliekol", lat: 52.35, lng: 64.1 },
  { code: "kz-kos-auliekol-auliekol", parent: "kz-kos-auliekol", level: "village", nameRu: "с. Аулиеколь", nameKk: "Әулиекөл ауылы", slugRu: "auliekol-selo", slugKk: "auliekol-auyly", lat: 52.35, lng: 64.1 },
  { code: "kz-akm-arshaly", parent: "kz-akm", level: "district", nameRu: "Аршалынский район", nameKk: "Аршалы ауданы", slugRu: "arshaly", slugKk: "arshaly", lat: 50.95, lng: 72.1 },
  { code: "kz-akm-arshaly-arshaly", parent: "kz-akm-arshaly", level: "village", nameRu: "п. Аршалы", nameKk: "Аршалы кенті", slugRu: "arshaly-selo", slugKk: "arshaly-kenti", lat: 50.95, lng: 72.1 },
  { code: "kz-akm-tselinograd", parent: "kz-akm", level: "district", nameRu: "Целиноградский район", nameKk: "Целиноград ауданы", slugRu: "tselinograd", slugKk: "tselinograd", lat: 51.05, lng: 71.3 },
  { code: "kz-akm-tselinograd-akmol", parent: "kz-akm-tselinograd", level: "village", nameRu: "с. Акмол", nameKk: "Ақмол ауылы", slugRu: "akmol", slugKk: "aqmol", lat: 51.0833, lng: 71.1 },
  { code: "kz-vko-katon", parent: "kz-vko", level: "district", nameRu: "Катон-Карагайский район", nameKk: "Катонқарағай ауданы", slugRu: "katon-karagay", slugKk: "katonqaragay", lat: 49.17, lng: 85.6 },
  { code: "kz-vko-katon-ulken", parent: "kz-vko-katon", level: "village", nameRu: "с. Улкен Нарын", nameKk: "Үлкен Нарын ауылы", slugRu: "ulken-naryn", slugKk: "ulken-naryn", lat: 49.2, lng: 84.5 },
  { code: "kz-zko-taskala", parent: "kz-zko", level: "district", nameRu: "Таскалинский район", nameKk: "Тасқала ауданы", slugRu: "taskala", slugKk: "tasqala", lat: 51.07, lng: 50.6 },
  { code: "kz-zko-taskala-taskala", parent: "kz-zko-taskala", level: "village", nameRu: "с. Таскала", nameKk: "Тасқала ауылы", slugRu: "taskala-selo", slugKk: "tasqala-auyly", lat: 51.0667, lng: 50.6 },
  { code: "kz-aty-kurmangazy", parent: "kz-aty", level: "district", nameRu: "Курмангазинский район", nameKk: "Құрманғазы ауданы", slugRu: "kurmangazy", slugKk: "qurmangazy", lat: 46.9, lng: 49.1 },
  { code: "kz-aty-kurmangazy-ganyushkino", parent: "kz-aty-kurmangazy", level: "village", nameRu: "с. Ганюшкино", nameKk: "Ганюшкино ауылы", slugRu: "ganyushkino", slugKk: "ganyushkino", lat: 46.8333, lng: 49.2 },
  { code: "kz-man-tupkaragan", parent: "kz-man", level: "district", nameRu: "Тупкараганский район", nameKk: "Түпқараған ауданы", slugRu: "tupkaragan", slugKk: "tupqaragan", lat: 44.5, lng: 50.5 },
  { code: "kz-man-tupkaragan-fort", parent: "kz-man-tupkaragan", level: "village", nameRu: "г. Форт-Шевченко", nameKk: "Форт-Шевченко қаласы", slugRu: "fort-shevchenko", slugKk: "fort-shevchenko", lat: 44.5086, lng: 50.2625 },
  { code: "kz-tur-sairam", parent: "kz-tur", level: "district", nameRu: "Сайрамский район", nameKk: "Сайрам ауданы", slugRu: "sairam", slugKk: "sairam", lat: 42.3, lng: 69.8 },
  { code: "kz-tur-sairam-aksukent", parent: "kz-tur-sairam", level: "village", nameRu: "с. Аксукент", nameKk: "Ақсукент ауылы", slugRu: "aksukent", slugKk: "aqsukent", lat: 42.4219, lng: 69.7858 },
  { code: "kz-kar-bukhar", parent: "kz-kar", level: "district", nameRu: "Бухар-Жырауский район", nameKk: "Бұқар жырау ауданы", slugRu: "bukhar-zhyrau", slugKk: "buqar-zhyrau", lat: 49.95, lng: 73.5 },
  { code: "kz-kar-bukhar-botakara", parent: "kz-kar-bukhar", level: "village", nameRu: "п. Ботакара", nameKk: "Ботақара кенті", slugRu: "botakara", slugKk: "botaqara", lat: 49.9, lng: 73.78 },
  { code: "kz-pav-pavlodar", parent: "kz-pav", level: "district", nameRu: "Павлодарский район", nameKk: "Павлодар ауданы", slugRu: "pavlodarskiy", slugKk: "pavlodar-audany", lat: 52.3, lng: 76.9 },
  { code: "kz-pav-pavlodar-kenzhekol", parent: "kz-pav-pavlodar", level: "village", nameRu: "с. Кенжеколь", nameKk: "Кенжекөл ауылы", slugRu: "kenzhekol", slugKk: "kenzhekol", lat: 52.2167, lng: 77.05 },
  { code: "kz-alm-enbekshikazakh", parent: "kz-alm", level: "district", nameRu: "Енбекшиказахский район", nameKk: "Еңбекшіқазақ ауданы", slugRu: "enbekshikazakh", slugKk: "enbekshiqazaq", lat: 43.5, lng: 77.7 },
  { code: "kz-alm-enbekshikazakh-esik", parent: "kz-alm-enbekshikazakh", level: "village", nameRu: "г. Есик", nameKk: "Есік қаласы", slugRu: "esik", slugKk: "esik", lat: 43.35, lng: 77.45 },
  { code: "kz-sko-kyzylzhar", parent: "kz-sko", level: "district", nameRu: "Кызылжарский район", nameKk: "Қызылжар ауданы", slugRu: "kyzylzhar", slugKk: "qyzylzhar", lat: 54.8, lng: 69.3 },
  { code: "kz-sko-kyzylzhar-beskol", parent: "kz-sko-kyzylzhar", level: "village", nameRu: "с. Бесколь", nameKk: "Бескөл ауылы", slugRu: "beskol", slugKk: "beskol", lat: 54.7833, lng: 69.1 },
  { code: "kz-kzo-shieli", parent: "kz-kzo", level: "district", nameRu: "Шиелийский район", nameKk: "Шиелі ауданы", slugRu: "shieli", slugKk: "shieli", lat: 44.17, lng: 66.75 },
  { code: "kz-kzo-shieli-shieli", parent: "kz-kzo-shieli", level: "village", nameRu: "с. Шиели", nameKk: "Шиелі ауылы", slugRu: "shieli-selo", slugKk: "shieli-auyly", lat: 44.1667, lng: 66.75 },
  { code: "kz-akt-alga", parent: "kz-akt", level: "district", nameRu: "Алгинский район", nameKk: "Алға ауданы", slugRu: "alga", slugKk: "alga", lat: 49.9, lng: 57.3 },
  { code: "kz-akt-alga-alga", parent: "kz-akt-alga", level: "village", nameRu: "г. Алга", nameKk: "Алға қаласы", slugRu: "alga-gorod", slugKk: "alga-qalasy", lat: 49.9, lng: 57.33 },
  { code: "kz-aba-abay", parent: "kz-aba", level: "district", nameRu: "Абайский район", nameKk: "Абай ауданы", slugRu: "abayskiy", slugKk: "abay-audany", lat: 49.6, lng: 79.3 },
  { code: "kz-aba-abay-karaul", parent: "kz-aba-abay", level: "village", nameRu: "с. Караул", nameKk: "Қарауыл ауылы", slugRu: "karaul", slugKk: "qarauyl", lat: 48.95, lng: 79.25 },
  { code: "kz-zhe-sarkand", parent: "kz-zhe", level: "district", nameRu: "Сарканский район", nameKk: "Сарқан ауданы", slugRu: "sarkand", slugKk: "sarqan", lat: 45.4, lng: 79.9 },
  { code: "kz-zhe-sarkand-sarkand", parent: "kz-zhe-sarkand", level: "village", nameRu: "г. Сарканд", nameKk: "Сарқан қаласы", slugRu: "sarkand-gorod", slugKk: "sarqan-qalasy", lat: 45.41, lng: 79.92 },
  { code: "kz-uly-zhezkazgan", parent: "kz-uly", level: "district", nameRu: "г. Жезказган", nameKk: "Жезқазған қаласы", slugRu: "zhezkazgan", slugKk: "zhezqazgan", lat: 47.78, lng: 67.71 },
];

export const TOP_LEVEL_REGION_CODES = REGIONS.filter((r) => r.parent === null).map((r) => r.code);

export function regionPath(code: string, all: RegionSeed[] = REGIONS): RegionSeed[] {
  const byCode = new Map(all.map((r) => [r.code, r]));
  const out: RegionSeed[] = [];
  let cur = byCode.get(code);
  while (cur) { out.unshift(cur); cur = cur.parent ? byCode.get(cur.parent) : undefined; }
  return out;
}

export function topLevelOf(code: string, all: RegionSeed[] = REGIONS): string {
  return regionPath(code, all)[0]?.code ?? code;
}
