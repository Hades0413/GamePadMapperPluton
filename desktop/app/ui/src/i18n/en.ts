/**
 * Diccionario espanol -> ingles (el texto en espanol es la clave, como en la web). Una prueba
 * comprueba que no falta ni sobra ninguna entrada.
 */
export const EN: Readonly<Record<string, string>> = {
  // Cabecera
  'Escritorio': 'Desktop',
  'Secciones': 'Sections',
  'Mandos': 'Controllers',
  'Juegos': 'Games',
  'Próximamente': 'Coming soon',
  'Sin Tauri: datos de ejemplo': 'Without Tauri: sample data',
  'Modo demostración': 'Demo mode',
  'Idioma': 'Language',

  // Lista de mandos
  'Mandos conectados': 'Connected controllers',
  'Conecta un mando por USB o Bluetooth. Aparecerá aquí al momento.':
    'Connect a controller over USB or Bluetooth. It will show up here right away.',
  'Virtual': 'Virtual',
  'Otra': 'Other',
  'simulado': 'simulated',
  'Base de datos SDL: {n} mandos conocidos. Puedes añadir el gamecontrollerdb.txt completo.':
    'SDL database: {n} known controllers. You can add the full gamecontrollerdb.txt.',
  'Cargar base completa': 'Load full database',
  '{n} mandos añadidos a la base de datos': '{n} controllers added to the database',
  'No hay ningún mando conectado': 'No controller connected',
  'En Linux hace falta permiso para leer /dev/input (grupo «input»). Mira desktop/linux/instalar-permisos.sh.':
    'On Linux you need permission to read /dev/input (the "input" group). See desktop/linux/instalar-permisos.sh.',

  // Barra del mando
  'Guardado': 'Saved',
  'SDL GameControllerDB': 'SDL GameControllerDB',
  'Detección automática': 'Auto-detected',
  'Asistente': 'Wizard',
  'Editado': 'Edited',
  'Sin guardar': 'Unsaved',
  'Asignar todo': 'Map all',
  'Automático': 'Automatic',
  'Mapeo automático aplicado (sin guardar)': 'Automatic mapping applied (unsaved)',
  'Vibración': 'Rumble',
  'Vibrando…': 'Rumbling…',
  'Este mando no tiene vibración': 'This controller has no rumble',
  'Exportar SDL': 'Export SDL',
  'Copia el mapeo en formato SDL': 'Copy the mapping in SDL format',
  'Línea SDL copiada al portapapeles': 'SDL line copied to the clipboard',
  'Importar SDL': 'Import SDL',
  'Línea SDL importada (sin guardar)': 'SDL line imported (unsaved)',
  'Restablecer': 'Reset',
  'Mapeo restablecido': 'Mapping reset',
  'Guardar': 'Save',
  'Guardado en {ruta}': 'Saved to {ruta}',
  'Mapeo del asistente aplicado (sin guardar)': 'Wizard mapping applied (unsaved)',

  // Diagrama
  'Mando': 'Controller',
  'Mando estándar (compatible con XInput)': 'Standard controller (XInput-compatible)',
  'Pulsa un control del dibujo para elegir su entrada.': 'Click a control in the drawing to choose its input.',
  'Diagrama del mando': 'Controller diagram',
  'Elegir la entrada de {control}': 'Choose the input for {control}',

  // Asignaciones
  'Asignaciones': 'Assignments',
  'Elige qué entrada del mando alimenta cada control.': 'Choose which controller input drives each control.',
  'Entrada de {control}': 'Input for {control}',
  '— sin asignar —': '— unassigned —',
  'Actividad': 'Activity',
  'Botones': 'Buttons',
  'Gatillos y bumpers': 'Triggers and bumpers',
  'Cruceta': 'D-pad',
  'Sticks': 'Sticks',

  // Entrada en vivo
  'Entrada en vivo': 'Live input',
  'Recibiendo': 'Receiving',
  'Sin datos': 'No data',
  'Ejes': 'Axes',
  'Hats': 'Hats',

  // Sticks
  'Stick izquierdo': 'Left stick',
  'Stick derecho': 'Right stick',
  'crudo': 'raw',
  'ajustado': 'adjusted',
  'Zona muerta': 'Dead zone',
  'Curva de respuesta': 'Response curve',
  'Invertir X': 'Invert X',
  'Invertir Y': 'Invert Y',

  // Asistente
  'Paso {n} de {total}': 'Step {n} of {total}',
  'Calibrando: no toques el mando un momento…': 'Calibrating: don\'t touch the controller for a moment…',
  'Suelta todos los botones y sticks…': 'Release all buttons and sticks…',
  'Esperando…': 'Waiting…',
  '¡Listo!': 'Done!',
  '{n} de {total} controles asignados. Revisa el resultado y úsalo como mapeo de este mando.':
    '{n} of {total} controls mapped. Review the result and use it as this controller\'s mapping.',
  'Esa entrada ya está asignada a {control}. Usa otra o pulsa «Saltar».':
    'That input is already mapped to {control}. Use another one or press "Skip".',
  'Ejes con ruido ignorados: {ejes}': 'Noisy axes ignored: {ejes}',
  'Cancelar': 'Cancel',
  'Atrás': 'Back',
  'Saltar': 'Skip',
  'Usar este mapeo': 'Use this mapping',
  'Pulsa el botón inferior (A)': 'Press the bottom button (A)',
  'Pulsa el botón derecho (B)': 'Press the right button (B)',
  'Pulsa el botón izquierdo (X)': 'Press the left button (X)',
  'Pulsa el botón superior (Y)': 'Press the top button (Y)',
  'Pulsa la cruceta hacia arriba': 'Press the D-pad up',
  'Pulsa la cruceta a la derecha': 'Press the D-pad right',
  'Pulsa la cruceta hacia abajo': 'Press the D-pad down',
  'Pulsa la cruceta a la izquierda': 'Press the D-pad left',
  'Pulsa el bumper izquierdo (L1)': 'Press the left bumper (L1)',
  'Pulsa el bumper derecho (R1)': 'Press the right bumper (R1)',
  'Aprieta el gatillo izquierdo (L2) a fondo': 'Pull the left trigger (L2) all the way',
  'Aprieta el gatillo derecho (R2) a fondo': 'Pull the right trigger (R2) all the way',
  'Hunde el stick izquierdo (L3)': 'Click the left stick (L3)',
  'Hunde el stick derecho (R3)': 'Click the right stick (R3)',
  'Pulsa SELECT (Back / View)': 'Press SELECT (Back / View)',
  'Pulsa START (Menu)': 'Press START (Menu)',
  'Pulsa el botón central (HOME)': 'Press the center button (HOME)',
  'Mueve el stick izquierdo a la derecha': 'Move the left stick to the right',
  'Mueve el stick izquierdo hacia abajo': 'Move the left stick down',
  'Mueve el stick derecho a la derecha': 'Move the right stick to the right',
  'Mueve el stick derecho hacia abajo': 'Move the right stick down',

  // Errores del nucleo (dominio/errores.ts)
  'El mando ya no está conectado.': 'The controller is no longer connected.',
  'Este mando no tiene vibración.': 'This controller has no rumble.',
  'No hay carpeta de configuración donde guardar.': 'There is no configuration folder to save to.',
  'El asistente no está en marcha para este mando.': 'The wizard is not running for this controller.',
  'El asistente aún no ha terminado.': 'The wizard has not finished yet.',

  // Importar
  'Importar línea SDL': 'Import SDL line',
  'Pega una línea de gamecontrollerdb.txt (GUID,nombre,a:b0,...). Se usará con este mando aunque el GUID sea otro.':
    'Paste a gamecontrollerdb.txt line (GUID,name,a:b0,...). It will be used for this controller even if the GUID differs.',
  'Importar': 'Import',
};
