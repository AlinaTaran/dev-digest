# План: Conventions Extractor + API Contract Reviewer

> Робочий план для гілки `hw-2`. Два треки, обидва — про перетворення знань про
> проєкт у **Skills**, які підключаються до ревʼю-агентів.

## Context (навіщо це)

1. **Conventions Extractor** — сканує **весь клонований репозиторій** (не PR!), дешевою
   моделлю витягує кандидатів-конвенцій (`{категорія, правило, evidence: файл+рядок,
   впевненість}`), **кодом** перевіряє докази (файл/рядок реально існують), показує список
   з approve / reject / edit / re-scan / deselect-all, і зі схвалених негайно **мерджить**
   один редагований `repo-conventions` skill body, який лінкується до агента. Аналог того,
   що Claude Code пропонує в `/insights`.

2. **API Contract Reviewer** — агент, який ревʼює **конкретний PR** і ловить проблеми
   API-контракту. Пишемо 4 директивні скіли з прикладами «добре/погано», лінкуємо (хоч один —
   через import) і на **реальному GitHub PR** показуємо різницю: прогін без скілів (пропускає)
   проти прогону зі скілами (ловить breaking change).

**Репо vs PR:** Трек 1 = скан усього репо (як у дизайні: «Conventions in payments-api»,
«Detected from 84 sample files», `Re-scan`). Трек 2 = ревʼю окремого пул-реквеста.

**Каркас фічі 1 уже майже весь є** — таблиця `conventions`, DTO `ConventionCandidate`, слот
`conventions` у реєстрі feature-models, метод `repoIntel.getConventionSamples()`,
i18n-namespace `conventions.json`, active-key сайдбару, enum скілів `type:'convention'` +
`source:'extracted'` + `evidence_files`. Відсутня лише проводка (модуль сервера, роути, UI, hooks).

Пакетні менеджери: **server/client = pnpm**, reviewer-core = npm. Міграції — **вручну**.

---

## Трек 1 — Conventions Extractor

### 1.1 Спільні контракти (`vendor/shared`)

Розширити `ConventionCandidate` в **обох** копіях однаково:
- `server/src/vendor/shared/contracts/knowledge.ts`
- `client/src/vendor/shared/contracts/knowledge.ts`

Додати поля: `category`, `evidence_line_start?`, `evidence_line_end?`,
`status: 'pending'|'accepted'|'rejected'`. Наявні `rule`, `evidence_path`,
`evidence_snippet`, `confidence` лишаються. `status` (замість boolean `accepted`) потрібен,
щоб re-scan не піднімав повторно відхилені.

### 1.2 Схема БД + міграція

`server/src/db/schema/knowledge.ts` — до таблиці `conventions` додати:
`category`, `evidenceLineStart`, `evidenceLineEnd`,
`status text enum ['pending','accepted','rejected'] notNull default 'pending'`.

Згенерувати: `cd server && pnpm db:generate` → перевірити SQL у `src/db/migrations/**`
(не редагувати руками) → `pnpm db:migrate`.

### 1.3 Читання файлів клону (repo-intel)

`getConventionSamples()` повертає лише шляхи. FS-доступ живе в repo-intel — **додати
публічний метод у facade**, а не читати fs із conventions-сервісу (межа onion):
- `server/src/modules/repo-intel/types.ts`:
  `getConventionSampleFiles(repoId, n): Promise<{ path: string; content: string }[]>`
- `server/src/modules/repo-intel/service.ts` — реалізація через наявні `readClone` + `clonePath`.

### 1.4 Новий модуль `server/src/modules/conventions/`

Дзеркалити `skills/` та `repo-intel/routes.ts`. Зареєструвати в `server/src/modules/index.ts`.

**routes.ts** (тонкі, Zod, `getContext`, `IdParams`):
- `POST /repos/:id/conventions/extract` — синхронно, повертає `ConventionCandidate[]`.
- `GET  /repos/:id/conventions` — список кандидатів.
- `PATCH /conventions/:id` — `{ status?, rule?, evidence_snippet? }` (accept/reject/edit).

Створення скіла — наявним `POST /skills` (клієнт зливає accepted у body). Окремий роут не потрібен.

**service.ts** — `extract(workspaceId, repoId)`:
1. **Вибір зразків кодом, без моделі**: конфіги (`eslint.config.*`/`.eslintrc*`,
   `tsconfig.json`, `.prettierrc*`, `package.json`) + топ-12 файлів через
   `repoIntel.getConventionSampleFiles(repoId, 12)`.
2. **Дешева модель, overridable**: `container.llm(provider).completeStructured(...)`,
   `schemaName:'ConventionExtraction'` (це імʼя вже очікує `MockLLMProvider` у `adapters/mocks.ts`).
   Модель: `getFeatureModelOverride(..., 'conventions')` → інакше `routeModel('classify', provider)`
   (дешева, напр. `gpt-4o-mini`).
3. **Кодова верифікація доказів** (ключова вимога): файл є серед семплів + `evidence_snippet`
   реально трапляється у вмісті біля вказаного рядка → інакше кандидата **відкидаємо**.
4. **Персист**: видалити попередні `pending` для репо (re-scan замінює pending; accepted/rejected
   лишаються), вставити верифіковані як `pending`, повернути DTO.

**repository.ts** — `insertMany`, `listByRepo`, `updateStatus/updateFields`, `deletePendingByRepo`.

### 1.5 Клієнт

- **Nav**: у `client/src/vendor/ui/nav.ts` додати до `SKILLS LAB`
  `{ key:'conventions', label:'Conventions', icon:'<існуючий>', href:'/conventions' }`
  (іконку звірити в `src/vendor/ui/icons.tsx`). `activeKeyFor` та label готові.
- **Роут**: `src/app/conventions/page.tsx` (тонкий) → `_components/ConventionsView/*`.
  Активне репо через `useActiveRepo()`, запит gated `enabled:!!repoId`.
- **Hooks**: `src/lib/hooks/conventions.ts` (дзеркало `skills.ts`): `useConventions`,
  `useExtractConventions`, `useUpdateConvention`; для скіла — наявний `useCreateSkill`.
- **Компоненти** (максимальний reuse):
  - `ConventionsView` — хедер (`Conventions in <repo>`, лічильник, `Re-scan`), тулбар
    (Deselect all, `N of M accepted`, `Create skill`), список карток, empty/error стани.
  - `ConventionCandidateCard` — адаптувати `FindingCard`: заголовок = `rule`; `evidence_path:line`
    через `MonoLink`; блок сніпета з **CopyButton** (`IconBtn icon="Copy"` +
    `navigator.clipboard`); `ProgressBar` впевненості з кольором за порогами `ConfidenceNum`
    (≥85 green, ≥65 orange, інакше muted); кнопки `Accepted`/`Reject`; edit `rule` інлайн.
  - `CreateSkillFromConventionsModal` — клон `CreateSkillModal` + `Enabled` toggle + лічильник
    токенів (`estimateTokens`). Префіл: name `<repo>-conventions`, description, body — **злиті
    accepted-кандидати** у Markdown (`## <category>` + правило + `Detected in \`file:line\``),
    усе редаговане перед збереженням. Submit →
    `useCreateSkill({ type:'convention', source:'extracted', enabled:true, evidence_files:[...] })`.
- **i18n**: розширити `client/messages/en/conventions.json` (`toolbar.*`, `edit.*`, `createSkillModal.*`).
- **Лінк до агента** — наявним механізмом: Agents → таб **Skills** (`SkillsTab`), чекбокс.

---

## Трек 2 — API Contract Reviewer

### 2.1 Агент
Через UI (`POST /agents`) «API Contract Reviewer»: `strategy:'single-pass'`,
`ci_fail_on:'critical'`, `repo_intel:true`, директивний `system_prompt` (тіло — у `docs/agent-prompts/`).

### 2.2 Чотири скіли (директивні, з «добре/погано»)
`.md` з frontmatter у `docs/agent-prompts/`, кожен — директивний опис + good/bad:
- `breaking-change`, `response-schema`, `semver-discipline`, `deprecation-policy`.
3 через `POST /skills` (`source:'manual'` → enabled, verbatim), **щонайменше 1 через import**
(`POST /skills/import` preview → `POST /skills`). Лінк: `POST /agents/:id/skills` або таб Skills.

### 2.3 Реальний PR + експеримент (before/after)
- Імпорт: підключити репо, `GET /repos/:id/pulls` (синк), `GET /pulls/:id` (дзеркалить
  `pr_files.patch`). Потрібен GitHub-токен через `SecretsProvider` + PR, що перейменовує поле
  у відповіді / змінює сигнатуру роуту.
- A/B (рекомендовано — два агенти): без скілів → `POST /pulls/:id/review {agentId}`; зі скілами →
  ще раз. Порівняти `findings` + `RunTrace.prompt_assembly.skills` (present vs null) через
  `GET /runs/:id/trace`, `GET /pulls/:id/reviews`. Очікування: breaking-change finding лише зі скілами.
- Ін'єкція скілів: `reviews/run-executor.ts:190` (фільтр `enabled`) → reviewer-core `prompt.ts`
  секція `## Skills / rules`; без скілів секції нема (= baseline).

---

## Продуктове покращення (додаткове завдання)

- **Two-pass**: спершу модель обирає файли (`schemaName:'ConventionFileSelection'` — імʼя вже
  очікує мок), потім екстракція → ширше покриття за фіксовані top-12.
- **Per-category** виклики (naming/error-handling/structure/imports/testing) → рівномірне покриття.
- **Few-shot** приклади хороших конвенцій.
- **Дедуп/кластеризація** через `container.embedder()`.
- **Калібрування впевненості**: конвенція у ≥2 файлах → вища впевненість, менше false-positive.
- **Lint як ground truth**: вже enforced eslint/prettier → відкидати; цінні — ті, що lint НЕ ловить.
- **Active learning**: accepted/rejected → few-shot у наступний re-scan.
- **Сигнали repo-intel** (`getSymbolsInFiles`, `getCallerSignatures`, `getRepoMap`) як докази.

---

## Файли: створити / змінити

**Server**
- `src/vendor/shared/contracts/knowledge.ts` (+ клієнтська копія) — розширити `ConventionCandidate`.
- `src/db/schema/knowledge.ts` — нові поля; `pnpm db:generate` + `db:migrate`.
- `src/modules/repo-intel/{types.ts,service.ts}` — `getConventionSampleFiles()`.
- `src/modules/conventions/{routes,service,repository}.ts` + реєстрація в `src/modules/index.ts`.
- `docs/agent-prompts/` — system-prompt агента + 4 тіла скілів.

**Client**
- `src/vendor/ui/nav.ts` — nav-айтем Conventions.
- `src/app/conventions/page.tsx` + `_components/{ConventionsView,ConventionCandidateCard,CreateSkillFromConventionsModal,CopyButton}`.
- `src/lib/hooks/conventions.ts`.
- `messages/en/conventions.json` — нові ключі.

---

## Verification

**Трек 1:**
1. Unit-тести conventions-сервісу (vitest) з `MockLLMProvider.structuredBySchema` на
   `'ConventionExtraction'`: валідний доказ лишається, неіснуючий файл/рядок — **відкидається**.
   `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`.
2. `pnpm db:migrate`, `./scripts/dev.sh`, у UI: Conventions → `Run extraction` → картки з
   доказами й confidence → accept/reject/edit → `Create skill` → зберегти `repo-conventions` →
   підключити в Agents → Skills.
3. `pnpm typecheck` (server+client), `pnpm test` (client), depcruise (onion).

**Трек 2:**
4. Створити агента + 4 скіли (1 через import), імпортувати реальний breaking-change PR,
   прогнати без/зі скілами, порівняти `findings` + `RunTrace…skills`. Breaking-change finding —
   лише зі скілами.

**Перед PR:** запустити skill `pr-self-review` (проганяє UI/onion-скіли + depcruise/typecheck/tests,
блокує на CRITICAL); памʼятати, що self-review може пропускати нові untracked-файли — перелічити вручну.