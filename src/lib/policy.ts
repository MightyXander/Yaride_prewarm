/**
 * Единый источник версий юридических документов сервиса (152-ФЗ + оферта).
 *
 * ВАЖНО: значения должны совпадать с версиями в public/privacy.html
 * (`window.POLICY_VERSION`) и public/offer.html (`window.OFFER_VERSION`).
 * При выпуске новой редакции документа меняем ОБА места согласованно —
 * фронт шлёт эти версии в pdn_consent_version / offer_consent_version при
 * регистрации и при принятии согласия в Telegram-онбординге; БД хранит
 * факт+дату+версию каждого согласия.
 */
export const POLICY_VERSION = 'v2';

/** Версия Публичной оферты / Пользовательского соглашения (public/offer.html). */
export const OFFER_VERSION = 'v1';
