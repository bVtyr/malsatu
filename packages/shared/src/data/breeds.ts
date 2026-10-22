export interface BreedSeed { code: string; species: "cattle" | "sheep" | "goat" | "horse" | "camel"; nameRu: string; nameKk: string; direction?: string }
export const BREEDS: BreedSeed[] = [
  // КРС
  { code: "kazakh_whitehead", species: "cattle", nameRu: "Казахская белоголовая", nameKk: "Қазақтың ақбас сиыры", direction: "мясная" },
  { code: "auliekol", species: "cattle", nameRu: "Аулиекольская", nameKk: "Әулиекөл", direction: "мясная" },
  { code: "angus", species: "cattle", nameRu: "Абердин-ангус", nameKk: "Абердин-ангус", direction: "мясная" },
  { code: "hereford", species: "cattle", nameRu: "Герефорд", nameKk: "Герефорд", direction: "мясная" },
  { code: "simmental", species: "cattle", nameRu: "Симментальская", nameKk: "Симментал", direction: "мясо-молочная" },
  { code: "holstein", species: "cattle", nameRu: "Голштинская", nameKk: "Голштин", direction: "молочная" },
  { code: "alatau", species: "cattle", nameRu: "Алатауская", nameKk: "Алатау", direction: "молочная" },
  { code: "kalmyk", species: "cattle", nameRu: "Калмыцкая", nameKk: "Қалмақ", direction: "мясная" },
  { code: "santa_gertrudis", species: "cattle", nameRu: "Санта-гертруда", nameKk: "Санта-гертруда", direction: "мясная" },
  { code: "local_cattle", species: "cattle", nameRu: "Местная (беспородная)", nameKk: "Жергілікті (тұқымсыз)" },
  { code: "other_cattle", species: "cattle", nameRu: "Другая", nameKk: "Басқа" },
  // МРС
  { code: "edilbay", species: "sheep", nameRu: "Едильбаевская", nameKk: "Еділбай", direction: "мясо-сальная (курдючная)" },
  { code: "kazakh_fat_tailed", species: "sheep", nameRu: "Казахская курдючная грубошёрстная", nameKk: "Қазақтың құйрықты қылшық жүнді қойы", direction: "мясо-сальная" },
  { code: "kazakh_finewool", species: "sheep", nameRu: "Казахская тонкорунная", nameKk: "Қазақтың биязы жүнді қойы", direction: "шёрстно-мясная" },
  { code: "gissar", species: "sheep", nameRu: "Гиссарская", nameKk: "Гиссар", direction: "мясо-сальная" },
  { code: "kazakh_arkhar_merino", species: "sheep", nameRu: "Казахский архаромеринос", nameKk: "Қазақ арқар-мериносы" },
  { code: "saryarka", species: "sheep", nameRu: "Сарыаркинская", nameKk: "Сарыарқа", direction: "мясо-сальная" },
  { code: "ordabasy", species: "sheep", nameRu: "Ордабасинская", nameKk: "Ордабасы" },
  { code: "romanov", species: "sheep", nameRu: "Романовская", nameKk: "Романов" },
  { code: "other_sheep", species: "sheep", nameRu: "Другая", nameKk: "Басқа" },
  { code: "zaanen", species: "goat", nameRu: "Зааненская", nameKk: "Заанен", direction: "молочная" },
  { code: "kazakh_goat", species: "goat", nameRu: "Местная казахская", nameKk: "Жергілікті қазақ ешкісі" },
  { code: "other_goat", species: "goat", nameRu: "Другая", nameKk: "Басқа" },
  // Лошади
  { code: "kazakh_zhabe", species: "horse", nameRu: "Казахская лошадь (жабе)", nameKk: "Қазақ жылқысы (жабы)", direction: "мясо-молочная" },
  { code: "kushum", species: "horse", nameRu: "Кушумская", nameKk: "Көшім", direction: "мясо-молочная" },
  { code: "mugalzhar", species: "horse", nameRu: "Мугалжарская", nameKk: "Мұғалжар", direction: "мясная" },
  { code: "adaev", species: "horse", nameRu: "Адаевская", nameKk: "Адай", direction: "верховая" },
  { code: "kostanay", species: "horse", nameRu: "Костанайская", nameKk: "Қостанай", direction: "верхово-упряжная" },
  { code: "other_horse", species: "horse", nameRu: "Другая", nameKk: "Басқа" },
  // Верблюды
  { code: "kazakh_bactrian", species: "camel", nameRu: "Казахский бактриан", nameKk: "Қазақ айыр түйесі" },
  { code: "arvana", species: "camel", nameRu: "Аруана (дромедар)", nameKk: "Аруана (нар түйе)" },
  { code: "other_camel", species: "camel", nameRu: "Другая", nameKk: "Басқа" },
];
