import { Plus, X } from 'lucide-react';
import { aCentavos, pesos, type CuotaListItem, type MoraDeCuota } from '@mf/shared';
import { Input } from '@/components/ui/field';

/**
 * Interés por mora elegido al cobrar o refinanciar: lo escrito en el importe, por id de
 * cuota. Una cuota que no figura no lleva mora. Se guarda el texto y no los centavos para
 * que quien cobra pueda corregir el importe a mano.
 */
export type Moras = Record<number, string>;

/** Si a la cuota se le puede sumar mora: el servidor solo la propone para las vencidas que la admiten. */
export const admiteMora = (c: CuotaListItem): boolean => c.mora > 0;

const sugerida = (c: CuotaListItem): string => pesos(c.mora, { simbolo: false });

/** Las vencidas arrancan con la mora propuesta; después se puede cambiar o quitar. */
export function morasPorDefecto(cuotas: CuotaListItem[]): Moras {
  return Object.fromEntries(cuotas.filter(admiteMora).map((c) => [c.id, sugerida(c)]));
}

/** Suma o quita la mora propuesta de una cuota, según se la tilde o destilde. */
export function conMora(moras: Moras, cuota: CuotaListItem, incluir: boolean): Moras {
  const resto = { ...moras };
  delete resto[cuota.id];
  return incluir && admiteMora(cuota) ? { ...resto, [cuota.id]: sugerida(cuota) } : resto;
}

/** Lo que viaja al servidor y lo que suma al total. `invalida` si algún importe no se entiende o es cero. */
export function resumirMoras(moras: Moras, cuotaIds: number[]): { lista: MoraDeCuota[]; total: number; invalida: boolean } {
  const lista: MoraDeCuota[] = [];
  let invalida = false;
  for (const cuotaId of cuotaIds) {
    const texto = moras[cuotaId];
    if (texto === undefined) continue;
    const importe = aCentavos(texto);
    if (importe === null || importe <= 0) invalida = true;
    else lista.push({ cuotaId, importe });
  }
  return { lista, total: lista.reduce((t, m) => t + m.importe, 0), invalida };
}

/**
 * El concepto de mora de una cuota vencida: el importe se puede corregir y el concepto
 * entero se puede quitar. Si ya se quitó, queda el botón para volver a sumarlo.
 */
export function RenglonMora({
  cuota,
  moras,
  onCambiar,
}: {
  cuota: CuotaListItem;
  moras: Moras;
  onCambiar: (moras: Moras) => void;
}) {
  const texto = moras[cuota.id];
  const id = `mora-${cuota.id}`;

  if (texto === undefined) {
    return (
      <button
        type="button"
        onClick={() => onCambiar(conMora(moras, cuota, true))}
        className="flex items-center gap-1 text-[13px] font-semibold text-pino-600 hover:underline [&_svg]:size-3.5"
      >
        <Plus /> Agregar interés por mora
      </button>
    );
  }

  const centavos = aCentavos(texto);
  const invalido = centavos === null || centavos <= 0;
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <label htmlFor={id} className="min-w-0 flex-1 text-tenue">
        Interés por mora
        {invalido && <span className="text-mor"> · ingresá un importe mayor a 0, o quitalo</span>}
      </label>
      <div className="relative w-[120px] shrink-0">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-tenue">$</span>
        <Input
          id={id}
          inputMode="decimal"
          className="h-8 pl-6 text-right text-[13px] tabular"
          value={texto}
          invalido={invalido}
          onChange={(e) => onCambiar({ ...moras, [cuota.id]: e.target.value })}
        />
      </div>
      <button
        type="button"
        onClick={() => onCambiar(conMora(moras, cuota, false))}
        aria-label="Quitar el interés por mora"
        title="Quitar el interés por mora"
        className="rounded-control p-1 text-tenue hover:bg-superficie-2 hover:text-mor [&_svg]:size-4"
      >
        <X />
      </button>
    </div>
  );
}
