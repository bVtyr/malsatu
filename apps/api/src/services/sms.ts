/** SMS/мессенджер-шлюз. Провайдеры: mock (лог), smsc.kz, mobizon.kz, kazinfoteh — интерфейс единый. */
import { config } from "../config.js";

export interface SmsProvider { send(phone: string, text: string, channel?: "sms" | "whatsapp" | "telegram"): Promise<{ ok: boolean; ref?: string }> }

const mock: SmsProvider = {
  async send(phone, text, channel = "sms") { console.log(`[sms:${channel}] → ${phone}: ${text}`); return { ok: true, ref: "mock" }; },
};

const smsc: SmsProvider = {
  async send(phone, text) {
    const url = new URL("https://smsc.kz/sys/send.php");
    url.searchParams.set("login", config.SMS_SENDER); url.searchParams.set("psw", config.SMS_API_KEY ?? "");
    url.searchParams.set("phones", phone); url.searchParams.set("mes", text); url.searchParams.set("fmt", "3");
    const r = await fetch(url); const j: any = await r.json().catch(() => ({}));
    return { ok: !j.error, ref: j.id ? String(j.id) : undefined };
  },
};

const mobizon: SmsProvider = {
  async send(phone, text) {
    const r = await fetch(`https://api.mobizon.kz/service/message/sendsmsmessage?apiKey=${config.SMS_API_KEY}`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ recipient: phone.replace("+", ""), text, from: config.SMS_SENDER }),
    });
    const j: any = await r.json().catch(() => ({}));
    return { ok: j.code === 0, ref: j.data?.messageId };
  },
};

export const sms: SmsProvider = config.SMS_PROVIDER === "smsc" ? smsc : config.SMS_PROVIDER === "mobizon" ? mobizon : mock;
