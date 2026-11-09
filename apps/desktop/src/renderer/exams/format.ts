import { useTranslation } from "react-i18next";
import { formatters } from "../../shared/format";

export function useExamFormat() {
  const { i18n } = useTranslation();
  const locale = i18n.language || document.documentElement.lang || "en";
  const format = formatters(locale);
  const percentFormat = new Intl.NumberFormat(
    locale === "en-XA" ? "en" : locale,
    { style: "percent" },
  );
  return {
    dateTime: (value: string) =>
      format.date(value, { dateStyle: "medium", timeStyle: "short" }),
    percent: (ratio: number) => percentFormat.format(ratio),
    percentParts: (ratio: number) => percentFormat.formatToParts(ratio),
  };
}
