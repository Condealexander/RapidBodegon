// Fechas fijas de corte de cobro, cada mes. Se pueden ajustar aquí sin
// tocar ningún otro archivo.
export const CUTOFF_DAYS = [3, 10, 17, 25];

const atMidnight = (year: number, monthIndex: number, day: number) =>
  new Date(year, monthIndex, day, 0, 0, 0, 0);

// Genera los cortes del mes anterior, el actual y el siguiente, ordenados.
// Cubrir 3 meses evita casos raros en los bordes de enero/diciembre.
const cutoffsAround = (date: Date): Date[] => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const dates: Date[] = [];
  for (const offset of [-1, 0, 1]) {
    for (const day of CUTOFF_DAYS) {
      dates.push(atMidnight(year, month + offset, day));
    }
  }
  return dates.sort((a, b) => a.getTime() - b.getTime());
};

/** El próximo corte después de `date` (estrictamente posterior). */
export const getNextCutoff = (date: Date = new Date()): Date => {
  const all = cutoffsAround(date);
  const next = all.find(d => d.getTime() > date.getTime());
  return next ?? all[all.length - 1];
};

/** El último corte que ya pasó (o es hoy mismo). */
export const getPreviousCutoff = (date: Date = new Date()): Date => {
  const all = cutoffsAround(date);
  const past = all.filter(d => d.getTime() <= date.getTime());
  return past.length ? past[past.length - 1] : all[0];
};

/** Días que faltan para el próximo corte (redondeado hacia arriba). */
export const daysUntilNextCutoff = (date: Date = new Date()): number => {
  const next = getNextCutoff(date);
  const ms = next.getTime() - date.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
};

/** Id determinístico de un ciclo, a partir de su fecha de corte final. */
export const cycleIdFor = (cutoffEnd: Date): string => {
  const y = cutoffEnd.getFullYear();
  const m = String(cutoffEnd.getMonth() + 1).padStart(2, '0');
  const d = String(cutoffEnd.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export interface CyclePeriod {
  id: string;
  start: Date;
  end: Date;
}

/**
 * Ciclos pasados que todavía no están registrados en `closedIds`, desde el
 * más reciente hacia atrás, hasta `maxLookback` ciclos o hasta encontrar uno
 * ya cerrado (lo que ocurra primero). Así, si nadie abre el panel de admin
 * en varias semanas, al entrar se ponen al día todos los cortes que faltaron.
 */
export const listPastUnclosedCycles = (
  now: Date,
  closedIds: Set<string>,
  maxLookback = 12
): CyclePeriod[] => {
  const result: CyclePeriod[] = [];
  let end = getPreviousCutoff(now);

  for (let i = 0; i < maxLookback; i++) {
    const id = cycleIdFor(end);
    if (closedIds.has(id)) break;
    const start = getPreviousCutoff(new Date(end.getTime() - 1));
    result.unshift({ id, start, end });
    end = start;
  }
  return result;
};

export const formatCutoffDate = (date: Date): string =>
  date.toLocaleDateString('es-VE', { day: 'numeric', month: 'long' });
