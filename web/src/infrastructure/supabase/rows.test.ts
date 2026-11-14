import { describe, expect, it } from 'vitest';
import { hasControllerColumns, readProfiles, summaryColumns } from './rows';

describe('lectura de perfiles sin la migracion del mando', () => {
  it('si faltan las columnas del mando repite la consulta sin ellas (una sola vez)', async () => {
    expect(summaryColumns()).toContain('controller_model');
    const columns: string[] = [];
    const result = await readProfiles(async () => {
      columns.push(summaryColumns());
      return columns.length === 1
        ? { data: null, error: { code: '42703', message: 'column game_profiles.controller_model does not exist' } }
        : { data: [], error: null };
    });
    expect(result).toEqual({ data: [], error: null });
    expect(columns).toHaveLength(2);
    expect(columns[1]).not.toContain('controller_');
    expect(hasControllerColumns()).toBe(false);
  });

  it('otros errores no cambian nada', async () => {
    let calls = 0;
    const result = await readProfiles(async () => {
      calls++;
      return { data: null, error: { code: '42501', message: 'permission denied' } };
    });
    expect(calls).toBe(1);
    expect(result.error).toBeTruthy();
  });
});
