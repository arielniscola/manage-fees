import { etiquetaParcela, type ParcelaUbicada } from '@mf/shared';

/** El sector siempre viaja con su loteo: la jerarquía es Loteo > Sector > Parcela. */
export const sectorResumen = {
  select: { id: true, nombre: true, loteo: { select: { id: true, nombre: true } } },
} as const;

/**
 * Lo que hay que traer de una parcela para poder nombrarla. El código es único dentro de
 * su sector, no en todo el sistema, así que sin el loteo no alcanza para identificarla.
 */
export const parcelaResumen = {
  select: { id: true, codigo: true, sector: sectorResumen },
} as const;

interface ParcelaSeleccionada {
  id: number;
  codigo: string;
  sector: { id: number; nombre: string; loteo: { id: number; nombre: string } | null } | null;
}

export const aParcelaUbicada = (p: ParcelaSeleccionada): ParcelaUbicada => ({
  id: p.id,
  codigo: p.codigo,
  etiqueta: etiquetaParcela(p),
  manzana: p.sector?.nombre ?? null,
});
