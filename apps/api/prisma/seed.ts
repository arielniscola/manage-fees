/**
 * Datos de ejemplo para desarrollo. No usar en producción.
 * Uso: npm run db:seed -w @mf/api
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const d = (s: string) => new Date(`${s}T00:00:00Z`);

async function main() {
  const existentes = await prisma.socio.count();
  if (existentes > 0) {
    console.log(`La base ya tiene ${existentes} socios; no se cargan datos de ejemplo.`);
    return;
  }

  // El predio se organiza en Loteo > Sector > Parcela: un loteo con tres manzanas,
  // y doce lotes en cada una. El código de la parcela es «manzana-lote».
  const loteo = await prisma.loteo.create({
    data: { nombre: 'Lavalle', direccion: 'Ruta 40 km 12' },
  });
  const manzanas = ['7', '8', '9'];
  const superficies = [173.22, 199.98, 200, 196, 298.45];
  // El código solo es único dentro del sector, así que las parcelas se van guardando acá
  // en lugar de buscarlas después por código.
  const parcelas = new Map<string, number>();
  for (const manzana of manzanas) {
    const sector = await prisma.sector.create({ data: { nombre: manzana, loteoId: loteo.id } });
    for (let lote = 1; lote <= 12; lote++) {
      const parcela = await prisma.parcela.create({
        data: {
          codigo: `${manzana}-${lote}`,
          sectorId: sector.id,
          superficieM2: superficies[lote % superficies.length],
        },
      });
      parcelas.set(parcela.codigo, parcela.id);
    }
  }

  const socios = [
    ['Carlos', 'Ferreyra', '28114502', '1998-03-02', ['7-1', '7-2']],
    ['Martín', 'Acosta', '33905117', '2015-08-10', ['7-3']],
    ['Lucía', 'Benítez', '46220381', '2021-02-15', ['8-1']],
    ['Julián', 'Sosa', '38442960', '2019-05-20', ['8-2', '8-3']],
    ['María', 'Castro', '25781334', '2004-11-05', ['9-1']],
    ['Sergio', 'Molina', '31067845', '2012-06-01', []],
  ] as const;

  let numero = 100;
  for (const [nombre, apellido, dni, alta, codigos] of socios) {
    const socio = await prisma.socio.create({
      data: { numero: ++numero, nombre, apellido, dni, fechaAlta: d(alta) },
    });
    for (const codigo of codigos) {
      const parcelaId = parcelas.get(codigo);
      if (!parcelaId) throw new Error(`No se creó la parcela ${codigo}`);
      await prisma.asignacion.create({ data: { socioId: socio.id, parcelaId, desde: d(alta) } });
    }
  }

  // Las dos cuotas del período, cada una con su historial: la de parcela cambia de valor
  // en julio y la social, que se paga una vez por socio, arranca con la misma vigencia.
  // Las cuotas se crean después desde «Generar período».
  const anio = new Date().getUTCFullYear();
  await prisma.tarifa.createMany({
    data: [
      { alcance: 'PARCELA', importe: 800000, periodicidad: 'MENSUAL', diaVencimiento: 10, vigenteDesde: d(`${anio - 1}-01-01`) },
      { alcance: 'PARCELA', importe: 1200000, periodicidad: 'MENSUAL', diaVencimiento: 10, vigenteDesde: d(`${anio}-07-01`) },
      { alcance: 'SOCIO', importe: 500000, periodicidad: 'MENSUAL', diaVencimiento: 10, vigenteDesde: d(`${anio - 1}-01-01`) },
    ],
  });

  console.log(
    `Cargado el loteo «${loteo.nombre}» con ${manzanas.length} sectores, ${manzanas.length * 12} parcelas, ` +
      `${socios.length} socios y 3 tarifas de ejemplo (cuota social y cuota por parcela).`,
  );
  console.log('Las cuotas se generan desde Cuotas → «Generar período» (o con el cron diario).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
