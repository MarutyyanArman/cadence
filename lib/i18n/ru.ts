/**
 * Русская версия всех текстов Cadence.
 *
 * Typed as `Dict`, so the compiler refuses a missing key, a stray one, or a
 * function whose shape drifted from the English original — a half-translated
 * build fails at `next build` rather than in front of the user.
 *
 * Три вещи, ради которых этот файл устроен именно так:
 *
 * - **`pl` для числительных.** В русском три формы («1 день», «2 дня»,
 *   «5 дней»), поэтому каждое число приходит сюда параметром, а не склеивается
 *   на стороне вызова.
 * - **Родительный падеж месяцев** задан списком: `toLocaleDateString` с
 *   `month: "long"` даёт «сентябрь», а в дате нужно «8 – 14 сентября».
 * - **Тон тот же, что и в английской версии** — ни одна строка не обвиняет.
 *   Пропущенный день называется пропущенным и на этом останавливается.
 */
import type { Dict } from "./en";

const TAG = "ru-RU";

/**
 * Одна из трёх форм по числу: 1 день / 2 дня / 5 дней.
 *
 * Исключение на 11–14 обязательно: 11 идёт по форме «дней», хотя
 * заканчивается на 1.
 */
function pl(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.round(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const days = (n: number) => pl(n, "день", "дня", "дней");

/** Родительный падеж — тот, что стоит в дате: «14 сентября». */
const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** Минуты → «1 ч 25 мин» / «45 мин». */
function minutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} ч ${m % 60} мин` : `${m} мин`;
}

export const ru: Dict = {
  tag: TAG,
  htmlLang: "ru",

  fmt: {
    minutes,
    shortDate: (d) => `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}`,
    weekdayDay: (d) =>
      `${d.toLocaleDateString(TAG, { weekday: "short", timeZone: "UTC" })}, ${d.getUTCDate()}`,
    weekdayShort: (d) => d.toLocaleDateString(TAG, { weekday: "short" }),
    monthSpan: (first, last) =>
      first.getMonth() === last.getMonth()
        ? first.toLocaleDateString(TAG, { month: "long", year: "numeric" })
        : `${first.toLocaleDateString(TAG, { month: "short" })} – ` +
          `${last.toLocaleDateString(TAG, { month: "short", year: "numeric" })}`,
    weekRange: (start, end) =>
      start.getUTCMonth() === end.getUTCMonth()
        ? `${start.getUTCDate()} – ${end.getUTCDate()} ` +
          `${MONTHS_GENITIVE[end.getUTCMonth()]} ${end.getUTCFullYear()}`
        : `${start.getUTCDate()} ${MONTHS_GENITIVE[start.getUTCMonth()]} – ` +
          `${end.getUTCDate()} ${MONTHS_GENITIVE[end.getUTCMonth()]} ${end.getUTCFullYear()}`,
    hour: (h) => `${String(h).padStart(2, "0")}:00`,
  },

  app: {
    name: "Cadence",
    description: "Цели, задачи и время — с измеренным разрывом между ними.",
  },

  language: {
    label: "Язык",
    switchAria: (name) => `Переключить на ${name}`,
  },

  auth: {
    heading: "Откройте Cadence из Telegram",
    body:
      "Вход в Cadence идёт через Telegram — пароль запоминать не нужно, а ваши записи видны только вам. Откройте бота и нажмите на приложение.",
    openInTelegram: "Открыть в Telegram",
    privacy:
      "Cadence хранит ваше имя и Telegram ID — чтобы понимать, где чьи задачи. Никому больше эти данные не передаются.",
    devHint:
      "Разработка: задайте CADENCE_DEV_USER_ID в .env.local, чтобы работать без Telegram. В production эта переменная игнорируется.",
  },

  account: {
    signedInAs: (name) => `Вы вошли как ${name}`,
    signOut: "Выйти",
    signedOut: "Вы вышли из аккаунта.",
  },

  nav: {
    tasks: "Задачи",
    backToTasks: "← Задачи",
    calendar: "Календарь",
    analytics: "Аналитика",
    recap: "Итоги",
    shortTasks: "Сегодня",
    shortCalendar: "Неделя",
    shortAnalytics: "Статистика",
    shortRecap: "Итоги",
    menu: "Меню",
    close: "Закрыть",
  },

  home: {
    title: "Сегодня",
    nothingOpen: "Нет открытых задач",
    open: (n) => `открытых: ${n}`,
    overdue: (n) => `просроченных: ${n}`,
    focusedToday: (m) => `${minutes(m)} в фокусе сегодня`,
    overdueHeading: "Просроченные",
    oldestFrom: (d) => `самая старая — ${d} ${days(d)} назад`,
    upcoming: "Предстоящие",
    completed: "Выполненные",
    consistency: "Регулярность",
  },

  composer: {
    titlePlaceholder: "Что нужно сделать?",
    estPlaceholder: "оценка, мин",
    noGoal: "Без цели",
    repeatAria: "Повтор",
    once: "Один раз",
    add: "Добавить",
    adding: "Добавляем",
    priority: { 1: "Максимальный", 2: "Высокий", 3: "Обычный", 4: "Низкий" },
  },

  tasks: {
    empty: "Ничего не запланировано. Добавьте первое дело, которое хотите сделать.",
    completeAria: (title) => `Выполнить: ${title}`,
    reopenAria: (title) => `Вернуть в работу: ${title}`,
    topPriority: "Высший приоритет",
    startTimerAria: (title) => `Запустить таймер: ${title}`,
    stopTimerAria: (title) => `Остановить таймер: ${title}`,
    deleteAria: (title) => `Удалить: ${title}`,
    confirmDeleteAria: (title) => `Подтвердить удаление: ${title}`,
    deleteConfirm: "Удалить?",
    due: {
      yesterday: "Вчера",
      daysAgo: (n) => `${n} ${days(n)} назад`,
      today: "Сегодня",
      tomorrow: "Завтра",
      inDays: (n) => `через ${n} ${days(n)}`,
    },
    overdueActions: {
      today: "Сегодня",
      reschedule: "Перенести",
      cancel: "Отменить",
      cancelDay: "Отменить только этот день?",
      cancelTask: "Отменить эту задачу?",
      newDateAria: (title) => `Новая дата для: ${title}`,
      openUntil: (day) => `открыта до ${day}, затем будет записана как пропуск`,
    },
  },

  recurrence: {
    daily: "Каждый день",
    weekdays: "По будням",
    weekly: "Каждую неделю",
  },

  habits: {
    rate: (rate) => {
      if (rate === null) return "Пока нечего считать";
      if (rate >= 0.9) return "Почти всегда";
      if (rate >= 0.7) return "Чаще всего";
      if (rate >= 0.4) return "Примерно в половине случаев";
      return "Редко в последнее время";
    },
    slip: (n) => `перенесена ${n}×`,
    done: (n) => `выполнено: ${n}`,
    missed: (n) => `пропущено: ${n}`,
    skipped: (n) => `отменено: ${n}`,
    stillOpen: (n) => `ещё открыто: ${n}`,
    keepsPushed: "Постоянно переносятся",
    movedThrice:
      "Три переноса обычно значат, что задача слишком большая — или на самом деле не нужна.",
  },

  goals: {
    heading: "Цели",
    new: "Новая",
    titlePlaceholder: "Название цели",
    colour: (n) => `Цвет ${n}`,
    create: "Создать цель",
    creating: "Создаём",
    empty: "Цели дают задачам то, во что они складываются.",
    archiveAria: (title) => `В архив: ${title}`,
    confirmArchiveAria: (title) => `Подтвердить архивацию: ${title}`,
    archiveConfirm: "В архив?",
    progressAria: (title) => `Прогресс цели «${title}»`,
    tasksOf: (done, total) => `${done}/${total} задач`,
    pace: {
      noTasks: "Пока нет задач",
      noTasksShort: "Нет задач",
      complete: "Завершена",
      notStarted: "Не начата",
      stalled: "Застопорилась",
      daysLeft: (n) => `≈${n} ${days(n)} осталось`,
      daysLeftShort: (n) => `≈${n} дн. осталось`,
      onTrack: (n) => `В графике · ≈${n} дн.`,
      behind: (n) => `Отставание ≈${n} дн.`,
      behindShort: (n) => `Отстаёт ≈${n} дн.`,
    },
  },

  calibration: {
    heading: "Калибровка",
    blurb:
      "Насколько ваши оценки совпадают с реальностью — единственный показатель здесь, который нельзя поднять объёмом работы, только более точными догадками.",
    hintLead: "Поставьте задаче оценку, включите на ней таймер, затем отметьте её выполненной.",
    hintFirst: "Три такие задачи — и показатель заработает.",
    hintMore: (n) => `Ещё ${n} — и показатель заработает.`,
    outOf: "/ 100",
    lastN: (n) =>
      n === 1
        ? "Последняя завершённая задача с оценкой"
        : `Последние ${n} ` +
          `${pl(n, "завершённая задача", "завершённые задачи", "завершённых задач")} с оценкой`,
    band: {
      sharp: "Точно",
      solid: "Уверенно",
      rough: "Примерно",
      guessing: "Наугад",
    },
    biasLonger: (pct) => `Работа занимает примерно на ${pct}% больше, чем вы планируете`,
    biasLess: (pct) => `Работа занимает примерно на ${pct}% меньше, чем вы планируете`,
    biasRight: "Ваши оценки попадают примерно в цель",
  },

  stats: {
    ariaLabel: "Серия и уровень",
    streak: "Серия",
    dayUnit: (n) => days(n),
    startsOne: (m) => `${minutes(m)} фокуса сегодня начнут серию`,
    stillStanding: (m) => `Серия держится — ${minutes(m)} сегодня её сохранят`,
    orRestDay: ", либо потратьте день отдыха",
    earnedToday: "Засчитана сегодня",
    best: (n) => ` · рекорд ${n}`,
    restDays: "Дни отдыха",
    bankedAria: (have, max) => `${have} из ${max} накоплено`,
    onePerRun: "Один за 7 дней подряд",
    coversMissed: "Покроет пропущенный день",
    level: (n) => `Уровень ${n}`,
    levelProgressAria: (n) => `Прогресс уровня ${n}`,
    topLevel: "Максимальный уровень",
    toNextLevel: (m, level) => `${minutes(m)} фокуса до уровня ${level}`,
    focusedToday: "В фокусе сегодня",
    xp: (n) => `${n} XP`,
    capped: (cap) => `Дневные ${cap} XP получены — отдых тоже считается`,
  },

  quests: {
    heading: "Три задачи на сегодня",
    focusBlock: (target) => ({
      title: `Проработайте ${target} минут без пауз`,
      hint: "Одна непрерывная сессия. Отметка о помехе сбрасывает попытку.",
      unit: "мин",
    }),
    focusMinutes: (target) => ({
      title: `Наберите ${target} минут фокуса`,
      hint: "За сколько угодно сессий.",
      unit: "мин",
    }),
    finishCount: (target) => ({
      title: `Завершите ${target} ${pl(target, "задачу", "задачи", "задач")}`,
      hint: "Подойдёт любая из списка.",
      unit: "готово",
    }),
    estimateAccuracy: (target, withinPct) => ({
      title: `Попадите в оценку ${target} ${pl(target, "раз", "раза", "раз")} с точностью ${withinPct}%`,
      hint: "Завершите задачу с оценкой близко к тому, что вы предполагали.",
      unit: "в цель",
    }),
    staleTask: (_target, afterDays) => ({
      title: "Завершите то, что тянется больше недели",
      hint: `Всё, что открыто больше ${afterDays} дней назад.`,
      unit: "готово",
    }),
  },

  notifications: {
    heading: "Уведомления",
    labels: {
      streak_risk: "Серия вот-вот прервётся",
      best_hour: "Ваш лучший рабочий час",
      calibration: "Как сработала оценка",
    },
    descriptions: {
      calibration: "Как сработала оценка, когда вы завершаете задачу",
      best_hour: "Одно напоминание в час, когда вы обычно работаете лучше всего",
      streak_risk: "После 20:00 и только если серия за сегодня ещё не засчитана",
    },
    unsupported: "Не поддерживаются в этом браузере",
    blocked: "Заблокированы в настройках браузера",
    notAsked: "Выключены — разрешение ещё не запрошено",
    allOff: "Включены, но все типы отключены",
    someOn: (on, total) => `включено типов: ${on} из ${total}`,
    allow: "Разрешить уведомления",
    blockedHelp:
      "Браузер их блокирует. Включите их для этого сайта в настройках сайта и перезагрузите страницу.",
    onlyWhileOpen: "Только пока открыта вкладка Cadence.",

    calledIt: (actual, estimate) =>
      `В точку — ${minutes(actual)} при оценке ${minutes(estimate)}`,
    estimateResult: (actual, estimate) =>
      `${minutes(actual)} при оценке ${minutes(estimate)}`,
    taskIsDone: (title) => `«${title}» выполнена.`,
    calibrationNow: (score) => `Калибровка теперь ${score}.`,
    streakIntact: (d) => `Ваши ${d} ${days(d)} всё ещё в силе`,
    streakKeeps: (m) => `${minutes(m)} на чём угодно сохранят её.`,
    restBanked: (n) =>
      ` У вас накоплено ${n} ${days(n)} отдыха, если сегодня не хочется.`,
    bestHourTitle: "Сейчас вы обычно в лучшей форме",
    bestHourBody: (hour, avg) => `Ваши сессии в ${hour} в среднем ${minutes(avg)}.`,
    bestHourPointer: (title) => ` «${title}» открыта.`,
  },

  timer: {
    break: "Перерыв",
    untitled: "Задача без названия",
    elapsed: (c) => `${c} прошло`,
    left: (c) => `${c} осталось`,
    over: (c) => `${c} сверх`,
    interruptions: (n) => ` · ${n} ${pl(n, "помеха", "помехи", "помех")}`,
    pastEstimate: (c, est) => `${c} сверх вашей оценки в ${est} мин`,
    pctOfEstimate: (pct, est) => `${pct}% от вашей оценки в ${est} мин`,
    interrupted: "Помеха",
    startBreak: "Перерыв",
    stop: "Стоп",
    settingsAria: "Настройки таймера",
    focusLength: "Фокус",
    breakLength: "Перерыв",
    longBreakLength: "Длинный перерыв",
    min: "мин",
    autoStartBreak: "Начинать перерыв автоматически",
    soundAndNotifications: "Звук и уведомления",
    breakOver: "Перерыв окончен",
    blockComplete: "Блок фокуса завершён",
    timeToSwitch: "Пора переключиться.",
  },

  calendar: {
    heading: "Календарь",
    today: "Сегодня",
    prevWeekAria: "Предыдущая неделя",
    nextWeekAria: "Следующая неделя",
    loadingWeek: "Загружаем неделю…",
    unscheduled: "Без времени",
    trayEmpty: "У всех открытых задач есть блок. Планировать нечего.",
    dragHint: "Перетащите на сетку, чтобы выделить время.",
    unscheduleAria: (title) => `Убрать из расписания: ${title}`,
    gridHint: (min, max) =>
      "Перетащите блок, чтобы переместить · тяните за нижний край, чтобы изменить длину · " +
      `блоки привязаны к 15 минутам и ограничены диапазоном ${min}–${max}`,
    couldNotMove: "Не удалось переместить блок",
    couldNotSchedule: "Не удалось запланировать задачу",
    couldNotRemove: "Не удалось убрать блок",
  },

  analytics: {
    heading: "Аналитика",
    last30: "Последние 30 дней",
    focused: "В фокусе",
    sessions: "Сессии",
    completed: "Завершено",
    medianEstimate: "Медианная оценка",
    unitHour: "ч",
    unitMinute: "мин",
    takesLonger: (pct) => `на ${pct}% дольше, чем планировалось`,
    insideEstimate: "в пределах оценки",
    goalProgress: {
      title: "Прогресс целей",
      hint: "Прогноз строится по завершениям за последние 14 дней",
      empty: "Целей пока нет. Создайте одну, чтобы видеть прогресс и прогноз завершения.",
    },
    habits: {
      title: "Привычки и буксующие задачи",
      hint: "Последние 30 завершённых дней. Отменённый день — это решение, он не идёт в минус привычке.",
      empty:
        "Задайте задаче повтор — и её дни появятся здесь. Задачи, перенесённые дважды и более, тоже.",
    },
    plannedVsActual: {
      title: "План и факт",
      hint: "Оценки сгруппированы по неделе срока, затраченное время — по неделе сессии",
      empty: "Оцените несколько задач и запишите время по ним, чтобы сравнить замысел с реальностью.",
      planned: "План",
      actual: "Факт",
    },
    accuracy: {
      title: "Точность оценок",
      hint: "Пунктир — идеальная оценка; всё, что выше неё, — недооценка",
      empty: "Завершите задачу с оценкой и записанным временем, чтобы появилась первая точка.",
      estimated: "Оценка",
      actual: "Факт",
      task: "Задача",
      over: "Сверх оценки",
      within: "В пределах оценки",
    },
    throughput: {
      title: "Пропускная способность",
      hint: "Если создаётся больше, чем завершается, копится долг",
      empty: "Добавьте и завершите несколько задач, чтобы увидеть, успеваете ли вы.",
      created: "Создано",
      completed: "Завершено",
    },
    allocation: {
      title: "Распределение времени",
      hint: "Время фокуса по целям, последние 30 дней",
      empty: "Запустите таймер по задаче, чтобы увидеть, куда на самом деле уходят часы.",
    },
    heatmap: {
      title: "Когда вы в фокусе",
      hint: "Последние 8 недель, по дням недели и часам",
      empty: "Запишите несколько сессий фокуса — и ваши продуктивные часы появятся здесь.",
    },
    consistency: {
      title: "Регулярность",
      hint: "Время фокуса по дням за последние 26 недель",
      empty: "Каждый день с записанным фокусом закрашивает квадрат.",
      daysInRow: (n) => `${n} ${days(n)} подряд`,
      noStreak: "Серия не идёт",
    },
    interruptions: {
      title: "Помехи",
      hint: "Записанные помехи на час фокуса, по часам суток",
      empty: "Нажимайте «Помеха» во время таймера, чтобы понять, что сбивает вас с работы.",
      perFocusHour: "На час фокуса",
    },
  },

  recap: {
    thisWeek: "Эта неделя пока",
    weekInReview: "Итоги недели",
    earlier: "Раньше",
    later: "Позже",
    empty:
      "За ту неделю ничего не записано. Запустите таймер по задаче — и ей будет что сказать.",
    focused: "В фокусе",
    finished: "Завершено",
    daysWorked: "Рабочих дней",
    daysOfSeven: (n) => `${n} из 7`,
    showedUp: "почти каждый день на месте",
    quietWeek: "тихая неделя",
    longestStretch: "Самый долгий отрезок",
    sessionCount: (n) => `${n} ${pl(n, "сессия", "сессии", "сессий")}`,
    interruptionCount: (n) => ` · ${n} ${pl(n, "помеха", "помехи", "помех")}`,
    firstWeek: "первая неделя, где что-то записано",
    aboutSame: "примерно столько же, сколько неделей раньше",
    morePct: (pct) => `на ${pct}% больше, чем неделей раньше`,
    lessPct: (pct) => `на ${pct}% меньше, чем неделей раньше`,
    bestHourPre: "Лучше всего вы работали около",
    bestHourPost: ". Стоит защитить этот час и на следующей неделе.",
    habitsPre: "Привычки:",
    habitsMid: (total) => ` из ${total} решённых дней выполнено. `,
    slippingCount: (n) =>
      `${pl(n, "задача перенесена", "задачи перенесены", "задач перенесены")} три раза или больше`,
    slippingTail: " — стоит разбить на части или отпустить.",
    estimatesHeading: "Как сработали оценки",
    sharpest: "Самая точная догадка",
    furthestOff: "Самый большой промах",
    against: "против",
    outOf: "/ 100",
  },

  charts: {
    notEnough: "Пока недостаточно данных.",
    weekdays: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  },

  errors: {
    taskTitle: "Дайте задаче название",
    goalTitle: "Дайте цели название",
    eventTitle: "Дайте событию название",
    invalidTask: "Некорректная задача",
    invalidGoal: "Некорректная цель",
    unknownTask: "Неизвестная задача",
    unknownGoal: "Неизвестная цель",
    unknownBlock: "Неизвестный блок",
    titleEmpty: "Название не может быть пустым",
    pickRealDate: "Выберите существующую дату",
    pickTodayOrLater: "Выберите сегодня или более поздний день",
    alreadyClosed: "Эта задача уже закрыта",
    noRunningSession: "Нет активной сессии",
    invalidTime: "Некорректное время",
    blockTooShort: "Блок должен быть не короче 15 минут",
    blockTooLong: "Блок не может быть длиннее 12 часов",
  },
};
