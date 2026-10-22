/** Категории каталога (настраиваются в админке). Атрибуты описаны конструктором ниже. */
export type AttrType = "select" | "multiselect" | "number" | "boolean" | "text" | "date" | "range";

export interface AttributeDef {
  code: string;
  type: AttrType;
  labelRu: string;
  labelKk: string;
  required?: boolean;
  unit?: string;
  options?: Array<{ value: string; ru: string; kk: string }>;
  filterable?: boolean;
}

export interface CategorySeed {
  code: string;
  parent: string | null;
  kind: "livestock" | "meat" | "service";
  nameRu: string; nameKk: string;
  slugRu: string; slugKk: string;
  icon: string; // имя иконки (см. web/components/icons)
  species?: "cattle" | "sheep" | "goat" | "horse" | "camel" | "poultry" | "other";
  enabled?: boolean;
  attributes?: AttributeDef[];
  sort: number;
}

const SEX = (opts: Array<[string, string, string]>): AttributeDef => ({
  code: "sex", type: "select", labelRu: "Пол", labelKk: "Жынысы", required: true, filterable: true,
  options: opts.map(([value, ru, kk]) => ({ value, ru, kk })),
});
const AGE: AttributeDef = { code: "age_months", type: "number", labelRu: "Возраст, мес.", labelKk: "Жасы, ай", required: true, unit: "мес", filterable: true };
const WEIGHT: AttributeDef = { code: "live_weight_kg", type: "number", labelRu: "Живой вес, кг", labelKk: "Тірі салмағы, кг", unit: "кг", filterable: true };
const WEIGHT_APPROX: AttributeDef = { code: "weight_is_approx", type: "boolean", labelRu: "Вес примерный", labelKk: "Салмағы шамамен" };
const FATNESS: AttributeDef = { code: "fatness", type: "select", labelRu: "Упитанность", labelKk: "Қоңдылығы", filterable: true, options: [
  { value: "low", ru: "ниже средней", kk: "орташадан төмен" }, { value: "medium", ru: "средняя", kk: "орташа" }, { value: "high", ru: "высшая", kk: "жоғары" } ] };
const PURPOSE: AttributeDef = { code: "purpose", type: "multiselect", labelRu: "Назначение", labelKk: "Мақсаты", required: true, filterable: true, options: [
  { value: "slaughter", ru: "на убой", kk: "союға" }, { value: "fattening", ru: "на откорм", kk: "бордақылауға" }, { value: "breeding", ru: "на племя", kk: "тұқымға" },
  { value: "kurban", ru: "на Курбан айт", kk: "Құрбан айтқа" }, { value: "dairy", ru: "дойная", kk: "сауын" }, { value: "sogym", ru: "на согым", kk: "соғымға" } ] };
const BREED: AttributeDef = { code: "breed", type: "select", labelRu: "Порода", labelKk: "Тұқымы", filterable: true }; // options из справочника пород
const VACCINATED: AttributeDef = { code: "vaccinated", type: "boolean", labelRu: "Вакцинирован", labelKk: "Вакцинацияланған", filterable: true };
const LAST_TREATMENT: AttributeDef = { code: "last_treatment_at", type: "date", labelRu: "Дата последней обработки", labelKk: "Соңғы өңдеу күні" };
const SLAUGHTER_ON_SITE: AttributeDef = { code: "slaughter_on_site", type: "boolean", labelRu: "Забой на месте", labelKk: "Орнында сою", filterable: true };
const PEDIGREE: AttributeDef = { code: "pedigree_doc", type: "text", labelRu: "Племенное свидетельство №", labelKk: "Асыл тұқымды куәлік №" };

const livestockCommon = (sex: AttributeDef, extra: AttributeDef[] = []): AttributeDef[] => [sex, BREED, AGE, WEIGHT, WEIGHT_APPROX, FATNESS, PURPOSE, VACCINATED, LAST_TREATMENT, SLAUGHTER_ON_SITE, ...extra];

const MEAT_COMMON: AttributeDef[] = [
  { code: "cut", type: "select", labelRu: "Формат", labelKk: "Пішімі", required: true, filterable: true, options: [
    { value: "carcass", ru: "туша", kk: "тұтас ұша" }, { value: "half", ru: "полутуша", kk: "жарты ұша" }, { value: "quarter", ru: "четвертина", kk: "ширек ұша" },
    { value: "parts", ru: "части", kk: "бөліктер" }, { value: "minced", ru: "фарш", kk: "тартылған ет" }, { value: "offal", ru: "субпродукты", kk: "субөнімдер" }, { value: "bones", ru: "кости", kk: "сүйек" }, { value: "national", ru: "национальная продукция", kk: "ұлттық өнім" } ] },
  { code: "part", type: "multiselect", labelRu: "Части", labelKk: "Бөліктері", filterable: true, options: [
    { value: "leg", ru: "окорок", kk: "сан" }, { value: "shoulder", ru: "лопатка", kk: "жауырын" }, { value: "ribs", ru: "рёбра", kk: "қабырға" }, { value: "brisket", ru: "грудинка", kk: "төс" }, { value: "tenderloin", ru: "вырезка", kk: "сүбе" },
    { value: "kazy", ru: "казы", kk: "қазы" }, { value: "shuzhyk", ru: "шұжық", kk: "шұжық" }, { value: "zhaya", ru: "жая", kk: "жая" }, { value: "karta", ru: "қарта", kk: "қарта" }, { value: "sur_et", ru: "сүр ет", kk: "сүр ет" } ] },
  { code: "condition", type: "select", labelRu: "Состояние", labelKk: "Күйі", required: true, filterable: true, options: [
    { value: "fresh", ru: "парное", kk: "жаңа сойылған" }, { value: "chilled", ru: "охлаждённое", kk: "салқындатылған" }, { value: "frozen", ru: "замороженное", kk: "мұздатылған" } ] },
  { code: "slaughter_date", type: "date", labelRu: "Дата забоя", labelKk: "Сою күні", required: true },
  { code: "slaughter_place", type: "select", labelRu: "Место забоя", labelKk: "Сою орны", required: true, filterable: true, options: [
    { value: "licensed", ru: "лицензированная бойня", kk: "лицензияланған мал сою орны" }, { value: "household", ru: "подворье", kk: "жеке қора" } ] },
  { code: "halal", type: "boolean", labelRu: "Халал", labelKk: "Халал", filterable: true },
  { code: "halal_cert_no", type: "text", labelRu: "Халал-сертификат №", labelKk: "Халал сертификаты №" },
  { code: "storage", type: "text", labelRu: "Условия хранения", labelKk: "Сақтау шарттары" },
  { code: "packaging", type: "text", labelRu: "Упаковка", labelKk: "Орамы" },
  { code: "min_order_kg", type: "number", labelRu: "Минимальный заказ, кг", labelKk: "Ең аз тапсырыс, кг", unit: "кг" },
  { code: "available_kg", type: "number", labelRu: "Доступно, кг", labelKk: "Қолжетімді, кг", unit: "кг", required: true },
  { code: "regular_supply", type: "boolean", labelRu: "Регулярные поставки", labelKk: "Тұрақты жеткізу", filterable: true },
];

export const CATEGORIES: CategorySeed[] = [
  // ---------- Живой скот ----------
  { code: "cattle", parent: null, kind: "livestock", species: "cattle", nameRu: "КРС", nameKk: "Ірі қара мал", slugRu: "krs", slugKk: "iri-qara", icon: "cow", sort: 10 },
  { code: "cattle_bull", parent: "cattle", kind: "livestock", species: "cattle", nameRu: "Быки", nameKk: "Бұқалар", slugRu: "byki", slugKk: "buqa", icon: "cow", sort: 11, attributes: livestockCommon(SEX([["male", "бык", "бұқа"], ["castrated", "вол", "өгіз"]])) },
  { code: "cattle_cow", parent: "cattle", kind: "livestock", species: "cattle", nameRu: "Коровы", nameKk: "Сиырлар", slugRu: "korovy", slugKk: "siyr", icon: "cow", sort: 12, attributes: livestockCommon(SEX([["female", "корова", "сиыр"]]), [{ code: "lactation", type: "number", labelRu: "Лактация, №", labelKk: "Лактация, №" }, { code: "pregnant", type: "boolean", labelRu: "Стельная", labelKk: "Буаз", filterable: true }]) },
  { code: "cattle_heifer", parent: "cattle", kind: "livestock", species: "cattle", nameRu: "Нетели / тёлки", nameKk: "Тана / қашарлар", slugRu: "neteli", slugKk: "tana", icon: "cow", sort: 13, attributes: livestockCommon(SEX([["female", "тёлка", "тана"]]), [{ code: "pregnant", type: "boolean", labelRu: "Стельная", labelKk: "Буаз", filterable: true }]) },
  { code: "cattle_feeder", parent: "cattle", kind: "livestock", species: "cattle", nameRu: "Бычки на откорм", nameKk: "Бордақылауға тайыншалар", slugRu: "bychki", slugKk: "tayynsha", icon: "cow", sort: 14, attributes: livestockCommon(SEX([["male", "бычок", "тайынша"]])) },
  { code: "cattle_calf", parent: "cattle", kind: "livestock", species: "cattle", nameRu: "Телята", nameKk: "Бұзаулар", slugRu: "telyata", slugKk: "buzau", icon: "cow", sort: 15, attributes: livestockCommon(SEX([["male", "бычок", "еркек"], ["female", "тёлочка", "ұрғашы"]])) },

  { code: "sheep", parent: null, kind: "livestock", species: "sheep", nameRu: "МРС", nameKk: "Ұсақ мал", slugRu: "mrs", slugKk: "usaq-mal", icon: "sheep", sort: 20 },
  { code: "sheep_ram", parent: "sheep", kind: "livestock", species: "sheep", nameRu: "Бараны", nameKk: "Қошқарлар", slugRu: "barany", slugKk: "qoshqar", icon: "sheep", sort: 21, attributes: livestockCommon(SEX([["male", "баран", "қошқар"], ["castrated", "валух", "ісек"]]), [{ code: "fat_tailed", type: "boolean", labelRu: "Курдючный", labelKk: "Құйрықты", filterable: true }]) },
  { code: "sheep_ewe", parent: "sheep", kind: "livestock", species: "sheep", nameRu: "Овцематки", nameKk: "Саулықтар", slugRu: "ovcematki", slugKk: "saulyq", icon: "sheep", sort: 22, attributes: livestockCommon(SEX([["female", "овцематка", "саулық"]])) },
  { code: "sheep_lamb", parent: "sheep", kind: "livestock", species: "sheep", nameRu: "Ягнята", nameKk: "Қозылар", slugRu: "yagnyata", slugKk: "qozy", icon: "sheep", sort: 23, attributes: livestockCommon(SEX([["male", "баранчик", "еркек"], ["female", "ярочка", "ұрғашы"]])) },
  { code: "goat", parent: "sheep", kind: "livestock", species: "goat", nameRu: "Козы", nameKk: "Ешкілер", slugRu: "kozy", slugKk: "eshki", icon: "goat", sort: 24, attributes: livestockCommon(SEX([["male", "козёл", "теке"], ["female", "коза", "ешкі"]])) },
  { code: "goat_kid", parent: "sheep", kind: "livestock", species: "goat", nameRu: "Козлята", nameKk: "Лақтар", slugRu: "kozlyata", slugKk: "laq", icon: "goat", sort: 25, attributes: livestockCommon(SEX([["male", "козлик", "еркек"], ["female", "козочка", "ұрғашы"]])) },

  { code: "horse", parent: null, kind: "livestock", species: "horse", nameRu: "Лошади", nameKk: "Жылқылар", slugRu: "loshadi", slugKk: "zhylqy", icon: "horse", sort: 30 },
  { code: "horse_stallion", parent: "horse", kind: "livestock", species: "horse", nameRu: "Жеребцы", nameKk: "Айғырлар", slugRu: "zherebcy", slugKk: "aigyr", icon: "horse", sort: 31, attributes: livestockCommon(SEX([["male", "жеребец", "айғыр"], ["castrated", "мерин", "ат"]])) },
  { code: "horse_mare", parent: "horse", kind: "livestock", species: "horse", nameRu: "Кобылы", nameKk: "Биелер", slugRu: "kobyly", slugKk: "bie", icon: "horse", sort: 32, attributes: livestockCommon(SEX([["female", "кобыла", "бие"]]), [{ code: "in_foal", type: "boolean", labelRu: "Жерёбая", labelKk: "Буаз", filterable: true }]) },
  { code: "horse_foal", parent: "horse", kind: "livestock", species: "horse", nameRu: "Жеребята", nameKk: "Құлындар", slugRu: "zherebyata", slugKk: "qulyn", icon: "horse", sort: 33, attributes: livestockCommon(SEX([["male", "жеребчик", "еркек"], ["female", "кобылка", "ұрғашы"]])) },
  { code: "horse_sogym", parent: "horse", kind: "livestock", species: "horse", nameRu: "Лошади на согым (жая)", nameKk: "Соғымға жылқы (жая)", slugRu: "loshadi-na-sogym", slugKk: "sogymga-zhylqy", icon: "horse", sort: 34, attributes: livestockCommon(SEX([["male", "жеребец/мерин", "айғыр/ат"], ["female", "кобыла", "бие"]]), [{ code: "fattening_months", type: "number", labelRu: "На откорме, мес.", labelKk: "Бордақыда, ай" }]) },

  { code: "camel", parent: null, kind: "livestock", species: "camel", nameRu: "Верблюды", nameKk: "Түйелер", slugRu: "verblyudy", slugKk: "tuie", icon: "camel", sort: 40, attributes: livestockCommon(SEX([["male", "самец", "бура/атан"], ["female", "самка", "інген"]]), [
    { code: "camel_type", type: "select", labelRu: "Тип", labelKk: "Түрі", required: true, filterable: true, options: [{ value: "bactrian", ru: "бактриан", kk: "айыр түйе" }, { value: "dromedary", ru: "дромедар", kk: "нар түйе" }, { value: "hybrid", ru: "гибрид (нар)", kk: "будан (нар)" }] } ]) },

  { code: "poultry", parent: null, kind: "livestock", species: "poultry", nameRu: "Птица", nameKk: "Құс", slugRu: "ptica", slugKk: "qus", icon: "chicken", sort: 50, attributes: [
    { code: "bird", type: "select", labelRu: "Вид", labelKk: "Түрі", required: true, filterable: true, options: [{ value: "chicken", ru: "куры", kk: "тауық" }, { value: "goose", ru: "гуси", kk: "қаз" }, { value: "duck", ru: "утки", kk: "үйрек" }, { value: "turkey", ru: "индейки", kk: "күркетауық" }] },
    AGE, { code: "laying", type: "boolean", labelRu: "Несушки", labelKk: "Жұмыртқалайтын", filterable: true }, VACCINATED ] },

  { code: "other_livestock", parent: null, kind: "livestock", species: "other", nameRu: "Прочее", nameKk: "Басқа", slugRu: "prochee", slugKk: "basqa", icon: "paw", sort: 60, attributes: [AGE, WEIGHT, PURPOSE] },

  { code: "breeding", parent: null, kind: "livestock", species: "other", nameRu: "Племенной скот", nameKk: "Асыл тұқымды мал", slugRu: "plemennoy-skot", slugKk: "asyl-tuqymdy-mal", icon: "medal", sort: 5, attributes: [
    { code: "species", type: "select", labelRu: "Вид", labelKk: "Түрі", required: true, filterable: true, options: [{ value: "cattle", ru: "КРС", kk: "ІҚМ" }, { value: "sheep", ru: "МРС", kk: "ұсақ мал" }, { value: "horse", ru: "лошади", kk: "жылқы" }, { value: "camel", ru: "верблюды", kk: "түйе" }] },
    SEX([["male", "самец", "еркек"], ["female", "самка", "ұрғашы"]]), BREED, AGE, WEIGHT, PEDIGREE,
    { code: "pedigree_class", type: "select", labelRu: "Класс", labelKk: "Класы", filterable: true, options: [{ value: "elite_record", ru: "элита-рекорд", kk: "элита-рекорд" }, { value: "elite", ru: "элита", kk: "элита" }, { value: "class1", ru: "I класс", kk: "I класс" }, { value: "class2", ru: "II класс", kk: "II класс" }] },
    { code: "sire", type: "text", labelRu: "Отец", labelKk: "Әкесі" }, { code: "dam", type: "text", labelRu: "Мать", labelKk: "Анасы" }, VACCINATED ] },

  // ---------- Мясо и продукция ----------
  { code: "meat", parent: null, kind: "meat", nameRu: "Мясо и продукция", nameKk: "Ет және өнім", slugRu: "myaso", slugKk: "et", icon: "meat", sort: 100 },
  { code: "meat_beef", parent: "meat", kind: "meat", nameRu: "Говядина", nameKk: "Сиыр еті", slugRu: "govyadina", slugKk: "siyr-eti", icon: "meat", sort: 101, attributes: MEAT_COMMON },
  { code: "meat_mutton", parent: "meat", kind: "meat", nameRu: "Баранина", nameKk: "Қой еті", slugRu: "baranina", slugKk: "qoi-eti", icon: "meat", sort: 102, attributes: MEAT_COMMON },
  { code: "meat_horse", parent: "meat", kind: "meat", nameRu: "Конина", nameKk: "Жылқы еті", slugRu: "konina", slugKk: "zhylqy-eti", icon: "meat", sort: 103, attributes: MEAT_COMMON },
  { code: "meat_camel", parent: "meat", kind: "meat", nameRu: "Верблюжатина", nameKk: "Түйе еті", slugRu: "verblyuzhatina", slugKk: "tuie-eti", icon: "meat", sort: 104, attributes: MEAT_COMMON },
  { code: "meat_goat", parent: "meat", kind: "meat", nameRu: "Козлятина", nameKk: "Ешкі еті", slugRu: "kozlyatina", slugKk: "eshki-eti", icon: "meat", sort: 105, attributes: MEAT_COMMON },
  { code: "meat_poultry", parent: "meat", kind: "meat", nameRu: "Птица", nameKk: "Құс еті", slugRu: "myaso-pticy", slugKk: "qus-eti", icon: "meat", sort: 106, attributes: MEAT_COMMON },
  { code: "meat_national", parent: "meat", kind: "meat", nameRu: "Национальная продукция", nameKk: "Ұлттық өнімдер", slugRu: "nacionalnaya-produkciya", slugKk: "ulttyq-onimder", icon: "kazy", sort: 107, attributes: MEAT_COMMON },

  // ---------- Услуги ----------
  { code: "service", parent: null, kind: "service", nameRu: "Услуги", nameKk: "Қызметтер", slugRu: "uslugi", slugKk: "qyzmetter", icon: "tools", sort: 200 },
  { code: "service_slaughter", parent: "service", kind: "service", nameRu: "Забой и разделка", nameKk: "Сою және мүшелеу", slugRu: "zaboy", slugKk: "soyu", icon: "knife", sort: 201, attributes: [
    { code: "ritual", type: "boolean", labelRu: "По обряду (халал)", labelKk: "Шариғат бойынша (халал)", filterable: true },
    { code: "licensed", type: "boolean", labelRu: "Лицензированная бойня", labelKk: "Лицензияланған сою орны", filterable: true },
    { code: "on_site", type: "boolean", labelRu: "Выезд к клиенту", labelKk: "Клиентке бару", filterable: true },
    { code: "species_served", type: "multiselect", labelRu: "Виды", labelKk: "Түрлері", options: [{ value: "cattle", ru: "КРС", kk: "ІҚМ" }, { value: "sheep", ru: "МРС", kk: "ұсақ мал" }, { value: "horse", ru: "лошади", kk: "жылқы" }, { value: "camel", ru: "верблюды", kk: "түйе" }] } ] },
  { code: "service_transport", parent: "service", kind: "service", nameRu: "Перевозка", nameKk: "Тасымалдау", slugRu: "perevozka", slugKk: "tasymaldau", icon: "truck", sort: 202, attributes: [
    { code: "vehicle", type: "select", labelRu: "Транспорт", labelKk: "Көлік", required: true, filterable: true, options: [{ value: "livestock_truck", ru: "скотовоз", kk: "мал тасығыш" }, { value: "refrigerator", ru: "рефрижератор", kk: "рефрижератор" }, { value: "flatbed", ru: "бортовой", kk: "борттық" }] },
    { code: "capacity_heads", type: "number", labelRu: "Вместимость, голов КРС", labelKk: "Сыйымдылығы, ІҚМ бас" }, { code: "capacity_tons", type: "number", labelRu: "Вместимость, т", labelKk: "Сыйымдылығы, т" } ] },
  { code: "service_vet", parent: "service", kind: "service", nameRu: "Вызов ветеринара", nameKk: "Мал дәрігерін шақыру", slugRu: "veterinar", slugKk: "mal-darigeri", icon: "stethoscope", sort: 203, attributes: [
    { code: "license_no", type: "text", labelRu: "Лицензия №", labelKk: "Лицензия №" }, { code: "services", type: "multiselect", labelRu: "Услуги", labelKk: "Қызметтер", options: [{ value: "inspection", ru: "осмотр перед покупкой", kk: "сатып алар алдындағы тексеру" }, { value: "vaccination", ru: "вакцинация", kk: "вакцинация" }, { value: "docs", ru: "ветдокументы", kk: "вет. құжаттар" }, { value: "treatment", ru: "лечение", kk: "емдеу" }] } ] },
  { code: "service_boarding", parent: "service", kind: "service", nameRu: "Передержка и откорм", nameKk: "Уақытша ұстау және бордақылау", slugRu: "otkorm", slugKk: "bordaqylau", icon: "barn", sort: 204, attributes: [{ code: "capacity_heads", type: "number", labelRu: "Мест, голов", labelKk: "Орын, бас" }, { code: "price_per_day", type: "number", labelRu: "Цена за голову/день", labelKk: "Бас/күн бағасы", unit: "₸" }] },
  { code: "service_appraisal", parent: "service", kind: "service", nameRu: "Оценка животного (зоотехник)", nameKk: "Малды бағалау (зоотехник)", slugRu: "ocenka", slugKk: "bagalau", icon: "scale", sort: 205 },
  { code: "service_packaging", parent: "service", kind: "service", nameRu: "Упаковка и заморозка", nameKk: "Орау және мұздату", slugRu: "upakovka", slugKk: "orau", icon: "snowflake", sort: 206 },
];

export const SPECIES_OF_CATEGORY = (code: string): string | null => CATEGORIES.find((c) => c.code === code)?.species ?? null;
