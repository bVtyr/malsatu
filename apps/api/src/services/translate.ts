/** Автоперевод kk↔ru. mock — помечает текст и возвращает как есть (с пометкой auto_translated в данных). */
import { config } from "../config.js";
export interface Translator { translate(text: string, from: "kk" | "ru", to: "kk" | "ru"): Promise<string> }
const mock: Translator = { async translate(text) { return text; } };
const deepl: Translator = {
  async translate(text, from, to) {
    const r = await fetch("https://api-free.deepl.com/v2/translate", {
      method: "POST", headers: { Authorization: `DeepL-Auth-Key ${config.TRANSLATE_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ text: [text], source_lang: from.toUpperCase(), target_lang: to.toUpperCase() }),
    });
    const j: any = await r.json(); return j.translations?.[0]?.text ?? text;
  },
};
export const translator: Translator = config.TRANSLATE_PROVIDER === "deepl" ? deepl : mock;
