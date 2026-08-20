// Copy for the cron validator + humanizer (src/lib/cron.ts, rendered by
// src/composables/useCronText.ts). Shared by the Pipelines list, the pipeline
// wizard and Transformations, so it lives in its own `cron` namespace rather
// than in any one view's fragment.
//
// Grammar notes for translators: `long.*.single` for month/day-of-week renders
// a ready-made prepositional phrase from `names.monthIn` / `names.dayOn`
// (Czech needs "v lednu", "ve středu" — a nominative name plus a fixed
// preposition would be wrong), while lists and ranges use the plain
// nominative `names.months` / `names.days`.
export default {
  en: {
    cron: {
      errors: {
        fieldCount: 'A cron schedule has 5 fields (minute hour day-of-month month day-of-week) — got {count}.',
        secondsField: 'Six-field cron (with seconds) is not supported — drop the leading seconds field.',
        macroUnsupported: '“{macro}” shortcuts are not supported — use {suggestion} instead.',
        macroUnknown: '“{macro}” shortcuts are not supported — use a 5-field expression.',
        emptyItem: '{field}: empty value in the list — remove the stray comma.',
        badValue: '{field}: “{token}” is not a valid value.',
        outOfRange: '{field}: {value} is out of range ({min}–{max}).',
        reversedRange: '{field}: the range {from}–{to} runs backwards.',
        badStep: '{field}: the step “{step}” must be a whole number greater than 0.',
      },
      fields: {
        minute: 'Minute',
        hour: 'Hour',
        dayOfMonth: 'Day-of-month',
        month: 'Month',
        dayOfWeek: 'Day-of-week',
      },
      long: {
        everyMinute: 'Every minute',
        everyNMinutes: 'Every minute | Every {n} minutes',
        at: 'At {desc}',
        atTime: 'At {time}',
        atPast: 'At {minute} past {hour}',
        minute: {
          all: 'every minute',
          step: 'every {ord} minute',
          single: 'minute {value}',
          list: 'minutes {list}',
          range: 'every minute from {from} through {to}',
          rangeStep: 'every {ord} minute from {from} through {to}',
          complex: 'minute {raw}',
        },
        hour: {
          all: 'every hour',
          step: 'every {ord} hour',
          single: 'hour {value}',
          list: 'hours {list}',
          range: 'every hour from {from} through {to}',
          rangeStep: 'every {ord} hour from {from} through {to}',
          complex: 'hour {raw}',
        },
        dayOfMonth: {
          step: 'on every {ord} day-of-month',
          single: 'on day-of-month {value}',
          list: 'on day-of-month {list}',
          range: 'on every day-of-month from {from} through {to}',
          rangeStep: 'on every {ord} day-of-month from {from} through {to}',
          complex: 'on day-of-month {raw}',
        },
        month: {
          step: 'in every {ord} month',
          single: '{name}',
          list: 'in {list}',
          range: 'in every month from {from} through {to}',
          rangeStep: 'in every {ord} month from {from} through {to}',
          complex: 'in month {raw}',
        },
        dayOfWeek: {
          step: 'on every {ord} day-of-week',
          single: '{name}',
          list: 'on {list}',
          range: 'on every day-of-week from {from} through {to}',
          rangeStep: 'on every {ord} day-of-week from {from} through {to}',
          complex: 'on day-of-week {raw}',
        },
      },
      short: {
        everyMinute: 'Every minute',
        everyNMin: 'Every minute | Every {n} min',
        hourly: 'Hourly',
        hourlyAt: 'Hourly at :{mm}',
        everyNHours: 'Hourly | Every {n}h',
        everyNHoursAt: 'Hourly at :{mm} | Every {n}h at :{mm}',
        daily: 'Daily at {time}',
        everyNDays: 'Daily at {time} | Every {n} days at {time}',
        weekly: '{days} at {time}',
        monthly: 'Monthly on the {ord} at {time}',
      },
      names: {
        monthIn: {
          jan: 'in January', feb: 'in February', mar: 'in March', apr: 'in April',
          may: 'in May', jun: 'in June', jul: 'in July', aug: 'in August',
          sep: 'in September', oct: 'in October', nov: 'in November', dec: 'in December',
        },
        months: {
          jan: 'January', feb: 'February', mar: 'March', apr: 'April',
          may: 'May', jun: 'June', jul: 'July', aug: 'August',
          sep: 'September', oct: 'October', nov: 'November', dec: 'December',
        },
        dayOn: {
          sun: 'on Sunday', mon: 'on Monday', tue: 'on Tuesday', wed: 'on Wednesday',
          thu: 'on Thursday', fri: 'on Friday', sat: 'on Saturday',
        },
        days: {
          sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
          thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
        },
        daysShort: {
          sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat',
        },
      },
      nextRuns: 'Next (UTC): {list}',
    },
  },
  cs: {
    cron: {
      errors: {
        fieldCount: 'Cron má 5 polí (minuta hodina den-v-měsíci měsíc den-v-týdnu) — zadáno {count}.',
        secondsField: 'Šestipolový cron (se sekundami) není podporován — vynechte úvodní pole se sekundami.',
        macroUnsupported: 'Zkratka „{macro}“ není podporována — použijte {suggestion}.',
        macroUnknown: 'Zkratka „{macro}“ není podporována — použijte výraz o 5 polích.',
        emptyItem: '{field}: prázdná hodnota v seznamu — odstraňte přebytečnou čárku.',
        badValue: '{field}: „{token}“ není platná hodnota.',
        outOfRange: '{field}: {value} je mimo rozsah ({min}–{max}).',
        reversedRange: '{field}: rozsah {from}–{to} jde pozpátku.',
        badStep: '{field}: krok „{step}“ musí být celé číslo větší než 0.',
      },
      fields: {
        minute: 'Minuta',
        hour: 'Hodina',
        dayOfMonth: 'Den v měsíci',
        month: 'Měsíc',
        dayOfWeek: 'Den v týdnu',
      },
      long: {
        everyMinute: 'Každou minutu',
        everyNMinutes: 'Každou minutu | Každé {n} minuty | Každých {n} minut',
        at: 'V {desc}',
        atTime: 'V {time}',
        atPast: 'V {minute} {hour}',
        minute: {
          all: 'každou minutu',
          step: 'každou {ord} minutu',
          single: 'minutu {value}',
          list: 'minuty {list}',
          range: 'každou minutu od {from} do {to}',
          rangeStep: 'každou {ord} minutu od {from} do {to}',
          complex: 'minutu {raw}',
        },
        hour: {
          all: 'každou hodinu',
          step: 'každou {ord} hodinu',
          single: 'hodinu {value}',
          list: 'hodiny {list}',
          range: 'každou hodinu od {from} do {to}',
          rangeStep: 'každou {ord} hodinu od {from} do {to}',
          complex: 'hodinu {raw}',
        },
        dayOfMonth: {
          step: 'každý {ord} den v měsíci',
          single: '{value}. den v měsíci',
          list: 've dnech {list}. v měsíci',
          range: 've dnech {from}.–{to}. v měsíci',
          rangeStep: 'každý {ord} den ve dnech {from}.–{to}. v měsíci',
          complex: 've dnech {raw} v měsíci',
        },
        month: {
          step: 'každý {ord} měsíc',
          single: '{name}',
          list: 'v měsících {list}',
          range: 'v měsících {from}–{to}',
          rangeStep: 'každý {ord} měsíc v období {from}–{to}',
          complex: 'v měsících {raw}',
        },
        dayOfWeek: {
          step: 'každý {ord} den v týdnu',
          single: '{name}',
          list: 've dnech {list}',
          range: 've dnech {from}–{to}',
          rangeStep: 'každý {ord} den ve dnech {from}–{to}',
          complex: 've dnech {raw}',
        },
      },
      short: {
        everyMinute: 'Každou minutu',
        everyNMin: 'Každou minutu | Každé {n} min | Každých {n} min',
        hourly: 'Každou hodinu',
        hourlyAt: 'Každou hodinu v :{mm}',
        everyNHours: 'Každou hodinu | Každé {n} h | Každých {n} h',
        everyNHoursAt: 'Každou hodinu v :{mm} | Každé {n} h v :{mm} | Každých {n} h v :{mm}',
        daily: 'Denně v {time}',
        everyNDays: 'Denně v {time} | Každé {n} dny v {time} | Každých {n} dní v {time}',
        weekly: '{days} v {time}',
        monthly: 'Měsíčně {ord} v {time}',
      },
      names: {
        monthIn: {
          jan: 'v lednu', feb: 'v únoru', mar: 'v březnu', apr: 'v dubnu',
          may: 'v květnu', jun: 'v červnu', jul: 'v červenci', aug: 'v srpnu',
          sep: 'v září', oct: 'v říjnu', nov: 'v listopadu', dec: 'v prosinci',
        },
        months: {
          jan: 'leden', feb: 'únor', mar: 'březen', apr: 'duben',
          may: 'květen', jun: 'červen', jul: 'červenec', aug: 'srpen',
          sep: 'září', oct: 'říjen', nov: 'listopad', dec: 'prosinec',
        },
        dayOn: {
          sun: 'v neděli', mon: 'v pondělí', tue: 'v úterý', wed: 've středu',
          thu: 've čtvrtek', fri: 'v pátek', sat: 'v sobotu',
        },
        days: {
          sun: 'neděle', mon: 'pondělí', tue: 'úterý', wed: 'středa',
          thu: 'čtvrtek', fri: 'pátek', sat: 'sobota',
        },
        daysShort: {
          sun: 'ne', mon: 'po', tue: 'út', wed: 'st', thu: 'čt', fri: 'pá', sat: 'so',
        },
      },
      nextRuns: 'Další (UTC): {list}',
    },
  },
}
