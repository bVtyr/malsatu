# Дизайн-система MalSatu: плакатная (v2)

Единый файл стилей для сайта и приложения: `apps/web/public/malsatu.css` (подключён в `app/[locale]/layout.tsx`), дополнения экранов в `apps/web/app/globals.css`. Tailwind не используется.

## Направление
«Рыночная афиша»: цветные блоки несут иерархию, заголовки жирным широким гротеском, цена всегда жёлтой плашкой. Выбрано пользователем из трёх вариантов (чистый маркетплейс / тёмный / плакатный).

## Токены
| Роль | Значение |
|---|---|
| `--paper` | #FFFFFF, фон |
| `--surface` / `--surface-2` | #F3F2EC / #E7E5DC, поверхности и разделители |
| `--ink` / `--line` | #141414, текст и обводки 2 px |
| `--yellow` | #FFD23F, действие и цена (единственный акцент) |
| `--green` | #0F7A3E, категории, доверие, успех |
| `--red` / `--red-bg` | #C8102E / #FBE3E6, предупреждения, споры |
| Шрифты | Unbounded 600–800 (заголовки, цены; cyrillic-ext), Golos Text 400–700 (интерфейс, цифры tabular) |
| Сетка | 8 px (`--s-1…--s-9`), gutter clamp(16px, 4vw, 40px), радиус 12 px, обводка 2 px, цель касания 48 px |

Контраст: чёрный на жёлтом 13:1, белый на зелёном 5,4:1, muted #5A5A54 на белом 7:1.

## Компоненты
`.tile` (цветная плитка: `--yellow --green --ink --surface --lg`, `.tile-title`, `.tile-sub`, `.tile-icon`), `.btn` (`--ink --green --white --ghost --wide --sm`), `.chip` (пилюля, `aria-pressed` = выбрано), `.field`, `.label`, `.hint`, `.error`, `.check`, `.search`, `.card` / `.card--tile` (фото + `.price-tag`), `.price-tag` (`--lg --ink`), `.mark` (`--green --yellow --red --ink`), `.panel` (`--surface --yellow --green --ink --red`), `.notice` (`--red --green --plain`), `.kv`, `.lines` / `.line` (строки «название — значение»), `.steps`, `.actions`, `.seg`, `.gallery` + `.dots`, `.msgs` / `.msg`, `.avatar`, `.rowline`, `.map`, `.photo-grid`, `.app-top` + `.logo`, `.app-nav` (чёрная панель, жёлтая кнопка «Подать»).

## Прототипы и проверка
- `apps/web/public/design/index.html` — лендинг; `app.html` — шесть экранов 1:1.
- Локально: `cd apps/web/public && python3 -m http.server 8731` → http://127.0.0.1:8731/design/
- Скриншоты в эмуляции телефона: `node ~/.claude/skills/taste-skill/scripts/inspect.mjs <url> --out .taste-skill/inspect2` (правила этого инспектора рассчитаны на другой стиль, используется только рендер).
- Самопроверка по Vercel Web Interface Guidelines (навык `web-design-guidelines`): подписи полей, `inputmode`/`autocomplete`, `aria-pressed` на чипах, фокус-кольцо 3 px, `prefers-reduced-motion`, цели 48 px, `touch-action: manipulation`.

## Фотографии
`apps/web/public/img/` с кредитами в `credits.json` и в футере лендинга (Wikimedia Commons, CC BY / CC BY-SA / public domain). Объявления из сида используют picsum-заглушки до появления фото продавцов.

## Движение (motion)
Только `transform`, `opacity`, `clip-path`; под `prefers-reduced-motion` остаётся конечное состояние; без JS контент виден (класс `js` ставит `Motion.tsx`).
- Герой: строки заголовка выезжают из-под маски (`.lines .line-in`, шаг 120 мс), подзаголовок и кнопки (`data-rise`), фото раскрывается `clip-path` и оседает со scale 1.12.
- Секции: `[data-reveal]` (`"left"`, `"scale"`), задержка `--i` × 70 мс через IntersectionObserver, один раз.
- Наведение: сдвиг −3px с жёсткой плакатной тенью `6px 6px 0 #141414` на плитках, кнопках, карточках; фото в карточке scale 1.06, ценник поворачивается на −2°; нажатие scale 0.98 (`--ease-spring`).
- Счётчики фактов (`data-count`), бегущая строка цен (`.ticker`, 40 с, пауза при наведении), сжимающаяся шапка (`.is-scrolled`), аккордеон через `grid-template-rows`, скелетоны `.skeleton`, тост `toast()`.
- Переходы между экранами: View Transitions (`@view-transition`, `::view-transition-*`; в Next включён `experimental.viewTransition` и `unstable_ViewTransition`), шапка и нижняя навигация закреплены через `view-transition-name: chrome`.
