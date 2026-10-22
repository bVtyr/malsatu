/** Справочник ветеринарных и прочих документов, причины отклонения модерацией. */
export interface DocTypeSeed { code: string; nameRu: string; nameKk: string; appliesTo: Array<"livestock" | "meat" | "service">; verifiableBy: Array<"moderator" | "vet"> }
export const DOCUMENT_TYPES: DocTypeSeed[] = [
  { code: "vet_certificate_f1", nameRu: "Ветеринарный сертификат (форма 1, перевозка живых животных)", nameKk: "Ветеринариялық сертификат (1-нысан)", appliesTo: ["livestock"], verifiableBy: ["moderator", "vet"] },
  { code: "vet_certificate_f2", nameRu: "Ветеринарный сертификат (форма 2, продукция)", nameKk: "Ветеринариялық сертификат (2-нысан)", appliesTo: ["meat"], verifiableBy: ["moderator", "vet"] },
  { code: "vet_reference", nameRu: "Ветеринарная справка", nameKk: "Ветеринариялық анықтама", appliesTo: ["livestock", "meat"], verifiableBy: ["moderator", "vet"] },
  { code: "animal_passport", nameRu: "Ветеринарный паспорт животного", nameKk: "Малдың ветеринариялық паспорты", appliesTo: ["livestock"], verifiableBy: ["vet"] },
  { code: "pedigree_certificate", nameRu: "Племенное свидетельство", nameKk: "Асыл тұқымды мал куәлігі", appliesTo: ["livestock"], verifiableBy: ["moderator"] },
  { code: "halal_certificate", nameRu: "Халал-сертификат", nameKk: "Халал сертификаты", appliesTo: ["meat", "service"], verifiableBy: ["moderator"] },
  { code: "slaughterhouse_license", nameRu: "Лицензия/учётный номер бойни", nameKk: "Мал сою орнының лицензиясы", appliesTo: ["meat", "service"], verifiableBy: ["moderator"] },
  { code: "vet_license", nameRu: "Лицензия ветеринара", nameKk: "Мал дәрігерінің лицензиясы", appliesTo: ["service"], verifiableBy: ["moderator"] },
  { code: "vehicle_vet_permit", nameRu: "Ветеринарно-санитарный паспорт транспорта", nameKk: "Көліктің ветеринариялық-санитариялық паспорты", appliesTo: ["service"], verifiableBy: ["moderator", "vet"] },
];

export interface RejectReasonSeed { code: string; ru: string; kk: string }
export const REJECT_REASONS: RejectReasonSeed[] = [
  { code: "photos_quality", ru: "Фото низкого качества или не соответствуют животному", kk: "Фото сапасы төмен немесе малға сәйкес емес" },
  { code: "photos_internet", ru: "Фото взяты из интернета", kk: "Фото интернеттен алынған" },
  { code: "contacts_in_text", ru: "Контакты или ссылки в тексте объявления", kk: "Хабарландыру мәтінінде байланыс деректері немесе сілтемелер бар" },
  { code: "price_suspicious", ru: "Цена значительно ниже рыночной — укажите реальную цену", kk: "Баға нарықтықтан әлдеқайда төмен — нақты бағаны көрсетіңіз" },
  { code: "duplicate", ru: "Дубликат объявления", kk: "Қайталанған хабарландыру" },
  { code: "wrong_category", ru: "Неверная категория", kk: "Санат дұрыс емес" },
  { code: "quarantine_zone", ru: "Объявление из карантинной зоны", kk: "Карантин аймағынан хабарландыру" },
  { code: "docs_invalid", ru: "Ветеринарные документы не прошли проверку", kk: "Ветеринариялық құжаттар тексерістен өтпеді" },
  { code: "prohibited", ru: "Запрещённый товар или услуга", kk: "Тыйым салынған тауар немесе қызмет" },
  { code: "other", ru: "Другое (см. комментарий)", kk: "Басқа (түсініктемені қараңыз)" },
];
