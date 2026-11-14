/** Contenido de un perfil .conf ya interpretado (para validar y dibujar la vista previa). */

export interface Point {
  readonly x: number;
  readonly y: number;
}

interface BindingBase {
  /** Clave completa tal como esta en el archivo: "A", "L2+A", "AXIS_9+". */
  readonly key: string;
  /** Boton que dispara la accion ("A" en "L2+A"). */
  readonly button: string;
  /** Boton de capa que hay que mantener ("L2" en "L2+A"), o null. */
  readonly modifier: string | null;
}

export type Binding = BindingBase &
  (
    | { readonly type: 'tap' | 'quick' | 'toggle'; readonly at: Point }
    | { readonly type: 'burst'; readonly at: Point; readonly count: number; readonly gapMs: number }
    | { readonly type: 'turbo'; readonly at: Point; readonly rate: number }
    | { readonly type: 'swipe'; readonly at: Point; readonly to: Point; readonly durationMs: number }
    | { readonly type: 'macro'; readonly at: Point; readonly steps: readonly MacroStep[] }
    | { readonly type: 'stick'; readonly at: Point; readonly radius: number; readonly dpad: boolean }
    | { readonly type: 'look'; readonly at: Point; readonly sensitivity: number }
  );

export type BindingType = Binding['type'];

export interface MacroStep {
  readonly at: Point;
  readonly delayMs: number;
  readonly holdMs: number;
}

export interface ProfileConfig {
  readonly packageName: string;
  readonly name: string | null;
  readonly screen: { readonly width: number; readonly height: number };
  readonly settings: Readonly<Record<string, string>>;
  readonly bindings: readonly Binding[];
}

export const CONF_MAX_BYTES = 16384;
export const CONF_MAX_LINES = 400;
export const CONF_MAX_BINDINGS = 150;
export const MACRO_MAX_STEPS = 16;
