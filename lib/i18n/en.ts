/**
 * Every word Cadence says, in English.
 *
 * This file is the source of truth for copy, not merely the English
 * translation of it: the pure modules (calibration, habits, quests,
 * recurrence, notifications) take a dictionary and default to this one, so
 * their existing behaviour — and the suites that assert on it — is unchanged.
 *
 * Two rules hold across both languages:
 *
 * - **Counts are parameters, never interpolated by the caller.** Russian
 *   inflects a noun three ways by its count ("1 день", "2 дня", "5 дней"), so
 *   a caller that builds `${n} ${word}` itself cannot be translated. Every
 *   count is a function here instead.
 * - **Dates are formatted by the dictionary**, with its own locale tag. A bare
 *   `toLocaleDateString(undefined, …)` follows the browser's language, not the
 *   one the user picked here.
 *
 * Deliberately imports nothing from the modules that consume it — the
 * constants those would supply are passed in as arguments. That keeps this
 * file a leaf and the import graph acyclic.
 */

const TAG = "en-GB";

/** Minutes → "1h 25m" / "45m". */
function minutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

const s = (n: number) => (n === 1 ? "" : "s");

export const en = {
  tag: TAG,
  htmlLang: "en",

  fmt: {
    minutes,
    /** "19 Sep" */
    shortDate: (d: Date) => d.toLocaleDateString(TAG, { month: "short", day: "numeric" }),
    /** "Sat 19", from a UTC-midnight date, so the day can't drift. */
    weekdayDay: (d: Date) =>
      d.toLocaleDateString(TAG, { weekday: "short", day: "numeric", timeZone: "UTC" }),
    /** "Mon" */
    weekdayShort: (d: Date) => d.toLocaleDateString(TAG, { weekday: "short" }),
    /** "September 2026", or "Dec – Jan 2027" across a month boundary. */
    monthSpan: (first: Date, last: Date) =>
      first.getMonth() === last.getMonth()
        ? first.toLocaleDateString(TAG, { month: "long", year: "numeric" })
        : `${first.toLocaleDateString(TAG, { month: "short" })} – ` +
          `${last.toLocaleDateString(TAG, { month: "short", year: "numeric" })}`,
    /** "8 – 14 September 2026" */
    weekRange: (start: Date, end: Date) => {
      const month = (d: Date) => d.toLocaleDateString(TAG, { month: "long", timeZone: "UTC" });
      return start.getUTCMonth() === end.getUTCMonth()
        ? `${start.getUTCDate()} – ${end.getUTCDate()} ${month(end)} ${end.getUTCFullYear()}`
        : `${start.getUTCDate()} ${month(start)} – ${end.getUTCDate()} ${month(end)} ` +
          `${end.getUTCFullYear()}`;
    },
    hour: (h: number) => `${String(h).padStart(2, "0")}:00`,
  },

  app: {
    name: "Cadence",
    description: "Goals, tasks and time — with the gap between them measured.",
  },

  language: {
    label: "Language",
    switchAria: (name: string) => `Switch to ${name}`,
  },

  auth: {
    heading: "Open Cadence from Telegram",
    body:
      "Cadence signs you in through Telegram, so there is no password to remember and your work is yours alone. Open the bot and tap the app.",
    openInTelegram: "Open in Telegram",
    privacy:
      "Cadence stores your name and Telegram id so it knows whose tasks are whose. Nothing is shared with anyone else.",
    devHint:
      "Development: set CADENCE_DEV_USER_ID in .env.local to use Cadence without Telegram. It is ignored in production.",
  },

  account: {
    signedInAs: (name: string) => `Signed in as ${name}`,
    signOut: "Sign out",
    signedOut: "Signed out.",
  },

  nav: {
    tasks: "Tasks",
    backToTasks: "← Tasks",
    calendar: "Calendar",
    analytics: "Analytics",
    recap: "Recap",
    /** The bottom bar on a phone has room for a word, not a phrase. */
    shortTasks: "Today",
    shortCalendar: "Week",
    shortAnalytics: "Stats",
    shortRecap: "Recap",
    menu: "Menu",
    close: "Close",
  },

  home: {
    title: "Today",
    nothingOpen: "Nothing open",
    open: (n: number) => `${n} open`,
    overdue: (n: number) => `${n} overdue`,
    focusedToday: (m: number) => `${minutes(m)} focused today`,
    overdueHeading: "Overdue",
    oldestFrom: (days: number) => `oldest from ${days} days ago`,
    upcoming: "Upcoming",
    completed: "Completed",
    consistency: "Consistency",
  },

  composer: {
    titlePlaceholder: "What needs doing?",
    estPlaceholder: "est. min",
    noGoal: "No goal",
    repeatAria: "Repeat",
    once: "Once",
    add: "Add",
    adding: "Adding",
    priority: { 1: "Top", 2: "High", 3: "Normal", 4: "Low" } as Record<number, string>,
  },

  tasks: {
    empty: "Nothing scheduled. Add the first thing you want to get done.",
    completeAria: (title: string) => `Complete ${title}`,
    reopenAria: (title: string) => `Reopen ${title}`,
    topPriority: "Top priority",
    startTimerAria: (title: string) => `Start timer for ${title}`,
    stopTimerAria: (title: string) => `Stop timer for ${title}`,
    deleteAria: (title: string) => `Delete ${title}`,
    confirmDeleteAria: (title: string) => `Confirm delete ${title}`,
    deleteConfirm: "Delete?",
    due: {
      yesterday: "Yesterday",
      daysAgo: (n: number) => `${n} days ago`,
      today: "Today",
      tomorrow: "Tomorrow",
      inDays: (n: number) => `${n} days`,
    },
    overdueActions: {
      today: "Today",
      reschedule: "Reschedule",
      cancel: "Cancel",
      cancelDay: "Cancel just this day?",
      cancelTask: "Cancel this task?",
      newDateAria: (title: string) => `New date for ${title}`,
      openUntil: (day: string) => `open until ${day}, then recorded as missed`,
    },
  },

  recurrence: {
    daily: "Every day",
    weekdays: "Weekdays",
    weekly: "Every week",
  } as Record<string, string>,

  habits: {
    rate: (rate: number | null): string => {
      if (rate === null) return "Nothing decided yet";
      if (rate >= 0.9) return "Near every time";
      if (rate >= 0.7) return "Most days";
      if (rate >= 0.4) return "About half the time";
      return "Rarely, lately";
    },
    slip: (n: number) => `pushed ${n}×`,
    done: (n: number) => `${n} done`,
    missed: (n: number) => `${n} missed`,
    skipped: (n: number) => `${n} skipped`,
    stillOpen: (n: number) => `${n} still open`,
    keepsPushed: "Keeps getting pushed",
    movedThrice: "Moved three times usually means too big, or not actually wanted.",
  },

  goals: {
    heading: "Goals",
    new: "New",
    titlePlaceholder: "Goal title",
    colour: (n: number) => `Colour ${n}`,
    create: "Create goal",
    creating: "Creating",
    empty: "Goals give your tasks somewhere to add up to.",
    archiveAria: (title: string) => `Archive ${title}`,
    confirmArchiveAria: (title: string) => `Confirm archive ${title}`,
    archiveConfirm: "Archive?",
    progressAria: (title: string) => `${title} progress`,
    tasksOf: (done: number, total: number) => `${done}/${total} tasks`,
    pace: {
      noTasks: "No tasks yet",
      noTasksShort: "No tasks",
      complete: "Complete",
      notStarted: "Not started",
      stalled: "Stalled",
      daysLeft: (n: number) => `~${n} days left`,
      daysLeftShort: (n: number) => `~${n}d left`,
      onTrack: (n: number) => `On track · ~${n}d`,
      behind: (n: number) => `Behind by ~${n}d`,
      behindShort: (n: number) => `Behind ~${n}d`,
    },
  },

  calibration: {
    heading: "Calibration",
    blurb:
      "How close your estimates land to reality — the one score here you can't get by doing more, only by guessing better.",
    hintLead: "Give a task an estimate, run the timer on it, then tick it off.",
    hintFirst: "Three of those and this starts working.",
    hintMore: (n: number) => `${n} more and this starts working.`,
    outOf: "/ 100",
    lastN: (n: number): string => `Last ${n} finished task${s(n)} with an estimate`,
    band: {
      sharp: "Sharp",
      solid: "Solid",
      rough: "Rough",
      guessing: "Guessing",
    } as Record<string, string>,
    biasLonger: (pct: number) => `Work takes about ${pct}% longer than you plan`,
    biasLess: (pct: number) => `Work takes about ${pct}% less time than you plan`,
    biasRight: "Your estimates land about right",
  },

  stats: {
    ariaLabel: "Streak and rank",
    streak: "Streak",
    dayUnit: (n: number): string => (n === 1 ? "day" : "days"),
    startsOne: (m: number) => `${minutes(m)} of focus today starts one`,
    stillStanding: (m: number) => `Still standing — ${minutes(m)} today keeps it`,
    orRestDay: ", or spend a rest day",
    earnedToday: "Earned today",
    best: (n: number) => ` · best ${n}`,
    restDays: "Rest days",
    bankedAria: (have: number, max: number) => `${have} of ${max} banked`,
    onePerRun: "One per 7-day run",
    coversMissed: "Covers a missed day",
    level: (n: number) => `Level ${n}`,
    levelProgressAria: (n: number) => `Level ${n} progress`,
    topLevel: "Top level",
    toNextLevel: (m: number, level: number) => `${minutes(m)} of focus to level ${level}`,
    focusedToday: "Focused today",
    xp: (n: number) => `${n} XP`,
    capped: (cap: number) => `Daily ${cap} XP earned — rest counts too`,
  },

  quests: {
    heading: "Today's three",
    focusBlock: (target: number) => ({
      title: `Work one ${target}-minute block without pausing`,
      hint: "One unbroken session. Logging an interruption resets the attempt.",
      unit: "min",
    }),
    focusMinutes: (target: number) => ({
      title: `Log ${target} minutes of focus`,
      hint: "Across as many sessions as you like.",
      unit: "min",
    }),
    finishCount: (target: number) => ({
      title: `Finish ${target} tasks`,
      hint: "Anything on the list counts.",
      unit: "done",
    }),
    estimateAccuracy: (target: number, withinPct: number) => ({
      title: `Land ${target} estimates within ${withinPct}%`,
      hint: "Finish an estimated task close to what you guessed.",
      unit: "on target",
    }),
    staleTask: (_target: number, afterDays: number) => ({
      title: `Finish something you've carried over a week`,
      hint: `Anything opened more than ${afterDays} days ago.`,
      unit: "done",
    }),
  },

  notifications: {
    heading: "Notifications",
    labels: {
      streak_risk: "Streak about to lapse",
      best_hour: "Your best working hour",
      calibration: "How an estimate landed",
    } as Record<string, string>,
    descriptions: {
      calibration: "How an estimate landed, once you finish the task",
      best_hour: "One nudge at the hour you historically focus best",
      streak_risk: "After 8pm, only if a live streak hasn't been earned yet",
    } as Record<string, string>,
    unsupported: "Not supported in this browser",
    blocked: "Blocked in browser settings",
    notAsked: "Off — not asked yet",
    allOff: "On, but every type is off",
    someOn: (on: number, total: number) => `${on} of ${total} types on`,
    allow: "Allow notifications",
    blockedHelp:
      "Your browser is blocking them. Turn them back on for this site in its site settings, then reload.",
    onlyWhileOpen: "Only while a Cadence tab is open.",

    /* the messages themselves */
    calledIt: (actual: number, estimate: number) =>
      `Called it — ${minutes(actual)} on a ${minutes(estimate)} estimate`,
    estimateResult: (actual: number, estimate: number) =>
      `${minutes(actual)} on a ${minutes(estimate)} estimate`,
    taskIsDone: (title: string) => `“${title}” is done.`,
    calibrationNow: (score: number) => `Calibration is now ${score}.`,
    streakIntact: (days: number) => `Your ${days} days are still intact`,
    streakKeeps: (m: number) => `${minutes(m)} on anything keeps it.`,
    restBanked: (n: number) => ` You have ${n} rest day${s(n)} banked if you'd rather not.`,
    bestHourTitle: "You focus best around now",
    bestHourBody: (hour: string, avg: number) =>
      `Your ${hour} sessions average ${minutes(avg)}.`,
    bestHourPointer: (title: string) => ` “${title}” is open.`,
  },

  timer: {
    break: "Break",
    untitled: "Untitled task",
    elapsed: (c: string) => `${c} elapsed`,
    left: (c: string) => `${c} left`,
    over: (c: string) => `${c} over`,
    interruptions: (n: number) => ` · ${n} interruption${s(n)}`,
    pastEstimate: (c: string, est: number) => `${c} past your ${est}m estimate`,
    pctOfEstimate: (pct: number, est: number) => `${pct}% of your ${est}m estimate`,
    interrupted: "Interrupted",
    startBreak: "Break",
    stop: "Stop",
    settingsAria: "Timer settings",
    focusLength: "Focus",
    breakLength: "Break",
    longBreakLength: "Long break",
    min: "min",
    autoStartBreak: "Auto-start break",
    soundAndNotifications: "Sound and notifications",
    breakOver: "Break over",
    blockComplete: "Focus block complete",
    timeToSwitch: "Time to switch.",
  },

  calendar: {
    heading: "Calendar",
    today: "Today",
    prevWeekAria: "Previous week",
    nextWeekAria: "Next week",
    loadingWeek: "Loading week…",
    unscheduled: "Unscheduled",
    trayEmpty: "Everything open has a block. Nothing left to schedule.",
    dragHint: "Drag onto the grid to block out time.",
    unscheduleAria: (title: string) => `Unschedule ${title}`,
    gridHint: (min: string, max: string) =>
      "Drag a block to move it · drag its bottom edge to resize · blocks snap to " +
      `15 minutes and are clamped to ${min}–${max}`,
    couldNotMove: "Could not move that block",
    couldNotSchedule: "Could not schedule that task",
    couldNotRemove: "Could not remove that block",
  },

  analytics: {
    heading: "Analytics",
    last30: "Last 30 days",
    focused: "Focused",
    sessions: "Sessions",
    completed: "Completed",
    medianEstimate: "Median estimate",
    /** Chart axis units — short enough to look like symbols, but they aren't. */
    unitHour: "h",
    unitMinute: "m",
    takesLonger: (pct: number) => `takes ${pct}% longer than planned`,
    insideEstimate: "inside estimate",
    goalProgress: {
      title: "Goal progress",
      hint: "Projection extrapolates the last 14 days of completions",
      empty: "No goals yet. Create one to see progress and a projected finish.",
    },
    habits: {
      title: "Habits and slipping tasks",
      hint: "Last 30 finished days. Skipped days are decisions, so they don't count against a habit.",
      empty:
        "Give a task a repeat and its days show up here. Tasks you reschedule twice or more appear too.",
    },
    plannedVsActual: {
      title: "Planned vs actual",
      hint: "Estimates bucketed by due week, time logged by session week",
      empty: "Estimate a few tasks and log time against them to compare intention with reality.",
      planned: "Planned",
      actual: "Actual",
    },
    accuracy: {
      title: "Estimate accuracy",
      hint: "Dashed line is a perfect estimate; above it is an underestimate",
      empty: "Complete a task that had an estimate and logged time to plot your first point.",
      estimated: "Estimated",
      actual: "Actual",
      task: "Task",
      over: "Over estimate",
      within: "Within estimate",
    },
    throughput: {
      title: "Throughput",
      hint: "Created above completed means a backlog forming",
      empty: "Add and complete a few tasks to see whether you're keeping pace.",
      created: "Created",
      completed: "Completed",
    },
    allocation: {
      title: "Time allocation",
      hint: "Focus time by goal, last 30 days",
      empty: "Run the timer against a task to see where your hours actually go.",
    },
    heatmap: {
      title: "When you focus",
      hint: "Last 8 weeks, by weekday and hour",
      empty: "Log a few focus sessions and your productive hours will show up here.",
    },
    consistency: {
      title: "Consistency",
      hint: "Daily focus time over the last 26 weeks",
      empty: "Each day you log focus time fills in a square.",
      daysInRow: (n: number) => `${n} day${s(n)} in a row`,
      noStreak: "No streak running",
    },
    interruptions: {
      title: "Interruptions",
      hint: "Logged interruptions per hour of focus, by hour of day",
      empty: "Tap Interrupted while the timer runs to find out what breaks your flow.",
      perFocusHour: "Per focus hour",
    },
  },

  recap: {
    thisWeek: "This week so far",
    weekInReview: "Week in review",
    earlier: "Earlier",
    later: "Later",
    empty:
      "Nothing logged that week. Run a timer against a task and it will have something to say.",
    focused: "Focused",
    finished: "Finished",
    daysWorked: "Days worked",
    daysOfSeven: (n: number) => `${n} of 7`,
    showedUp: "showed up most days",
    quietWeek: "a quiet week",
    longestStretch: "Longest stretch",
    sessionCount: (n: number) => `${n} session${s(n)}`,
    interruptionCount: (n: number) => ` · ${n} interruption${s(n)}`,
    firstWeek: "first week with anything logged",
    aboutSame: "about the same as the week before",
    morePct: (pct: number) => `${pct}% more than the week before`,
    lessPct: (pct: number) => `${pct}% less than the week before`,
    bestHourPre: "You did your best work around",
    bestHourPost: ". Worth defending that hour next week.",
    habitsPre: "Habits:",
    habitsMid: (total: number) => ` of ${total} decided days done. `,
    slippingCount: (n: number): string =>
      n === 1
        ? "task has been pushed three times or more"
        : "tasks have been pushed three times or more",
    slippingTail: " — worth splitting, or letting go.",
    estimatesHeading: "How the estimates landed",
    sharpest: "Sharpest guess",
    furthestOff: "Furthest off",
    against: "against",
    outOf: "/ 100",
  },

  charts: {
    notEnough: "Not enough data yet.",
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  },

  errors: {
    taskTitle: "Give the task a title",
    goalTitle: "Give the goal a title",
    eventTitle: "Give the event a title",
    invalidTask: "Invalid task",
    invalidGoal: "Invalid goal",
    unknownTask: "Unknown task",
    unknownGoal: "Unknown goal",
    unknownBlock: "Unknown block",
    titleEmpty: "Title can't be empty",
    pickRealDate: "Pick a real date",
    pickTodayOrLater: "Pick today or a later day",
    alreadyClosed: "That task is already closed",
    noRunningSession: "No running session",
    invalidTime: "Invalid time",
    blockTooShort: "A block must be at least 15 minutes",
    blockTooLong: "A block can't be longer than 12 hours",
  },
};

export type Dict = typeof en;
