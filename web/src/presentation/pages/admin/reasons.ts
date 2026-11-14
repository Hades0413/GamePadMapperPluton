import { isReportReason } from '@domain/report/ReportReason';
import { REPORT_REASON_LABEL } from '../../lib/labels';

/** "broken: no va" -> "No funciona / está mal hecho: no va" */
export function reasonText(raw: string): string {
  const sep = raw.indexOf(':');
  const code = sep >= 0 ? raw.slice(0, sep) : raw;
  const label = isReportReason(code) ? REPORT_REASON_LABEL[code] : code;
  return sep >= 0 ? `${label}:${raw.slice(sep + 1)}` : label;
}
