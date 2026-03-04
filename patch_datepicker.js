const fs = require('fs');
const path = require('path');

const dashPath = path.join(__dirname, 'src', 'components', 'Dashboard.tsx');
let source = fs.readFileSync(dashPath, 'utf8');

// 1. Add imports for date picker and locales at the top
if (!source.includes('react-datepicker')) {
  source = source.replace('import { useLanguage } from "@/components/LanguageProvider";',
    `import { useLanguage } from "@/components/LanguageProvider";\nimport DatePicker, { registerLocale } from "react-datepicker";\nimport "react-datepicker/dist/react-datepicker.css";\nimport ruLocale from "date-fns/locale/ru";\nimport enLocale from "date-fns/locale/en-US";\n\nregisterLocale("ru", ruLocale);\nregisterLocale("en", enLocale);`
  );
}

// 2. Add state for Date object
if (!source.includes('const [selectedDate, setSelectedDate] = useState<Date | null>(null);')) {
  source = source.replace('const [scheduleDate, setScheduleDate] = useState<string>("");',
    'const [scheduleDate, setScheduleDate] = useState<string>("");\n  const [selectedDate, setSelectedDate] = useState<Date | null>(null);'
  );
}


// 3. Update the handleFetchByLink / schedule date sync
const newDatePickerHtml = `<DatePicker
                        selected={selectedDate}
                        onChange={(date: Date | null) => {
                          setSelectedDate(date);
                          if (date) {
                            // Convert to format required by action: YYYY-MM-DDTHH:mm
                            const tzOffset = date.getTimezoneOffset() * 60000;
                            const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 16);
                            setScheduleDate(localISOTime);
                          } else {
                            setScheduleDate("");
                          }
                        }}
                        showTimeSelect
                        timeFormat="HH:mm"
                        timeIntervals={15}
                        timeCaption={language === "ru" ? "Время" : "Time"}
                        dateFormat="dd.MM.yyyy HH:mm"
                        locale={language}
                        placeholderText={language === "ru" ? "ДД.ММ.ГГГГ --:--" : "MM/DD/YYYY --:--"}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                      />`;

source = source.replace(
  /<input\s+type="datetime-local"[\s\S]*?className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"\s*\/>/m,
  newDatePickerHtml
);

fs.writeFileSync(dashPath, source, 'utf8');
console.log('Successfully patched Dashboard.tsx with custom datepicker');
