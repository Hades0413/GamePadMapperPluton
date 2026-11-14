/**
 * Grafica de respuesta (entrada -> salida), como las de x360ce pero propia: la diagonal es la
 * respuesta lineal, la curva es la configurada y el punto es la posicion en vivo.
 */

interface Props {
  /** Respuesta para una entrada (-1..1, o 0..1 si `positiva`). */
  funcion: (x: number) => number;
  /** Entrada en vivo (o null). */
  entrada: number | null;
  /** Solo la mitad positiva (gatillos). */
  positiva?: boolean;
  etiqueta: string;
}

const LADO = 100;

export function GraficoRespuesta({ funcion, entrada, positiva = false, etiqueta }: Props) {
  const min = positiva ? 0 : -1;
  const px = (x: number) => ((x - min) / (1 - min)) * LADO;
  const py = (y: number) => LADO - ((y - min) / (1 - min)) * LADO;
  const puntos: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const x = min + ((1 - min) * i) / 120;
    puntos.push(`${px(x).toFixed(2)},${py(funcion(x)).toFixed(2)}`);
  }
  const salida = entrada === null ? null : funcion(entrada);
  return (
    <svg viewBox={`-2 -2 ${LADO + 4} ${LADO + 4}`} className="aspect-square w-full max-w-44 shrink-0 rounded-lg bg-bg" role="img" aria-label={etiqueta}>
      <rect x={0} y={0} width={LADO} height={LADO} fill="none" stroke="var(--color-line)" />
      {!positiva && (
        <>
          <line x1={LADO / 2} x2={LADO / 2} y1={0} y2={LADO} stroke="var(--color-line)" strokeWidth={0.5} />
          <line y1={LADO / 2} y2={LADO / 2} x1={0} x2={LADO} stroke="var(--color-line)" strokeWidth={0.5} />
        </>
      )}
      <line x1={px(min)} y1={py(min)} x2={px(1)} y2={py(1)} stroke="var(--color-muted)" strokeOpacity={0.35} strokeDasharray="2 2" />
      <polyline points={puts(puntos)} fill="none" stroke="var(--color-primary)" strokeWidth={1.6} strokeLinejoin="round" />
      {entrada !== null && salida !== null && (
        <>
          <line x1={px(entrada)} x2={px(entrada)} y1={0} y2={LADO} stroke="var(--color-accent)" strokeOpacity={0.4} strokeWidth={0.6} />
          <circle cx={px(entrada)} cy={py(salida)} r={2.6} fill="var(--color-accent)" />
        </>
      )}
    </svg>
  );
}

const puts = (p: string[]) => p.join(' ');
