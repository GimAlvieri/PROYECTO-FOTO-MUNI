/*
  IndexedDB for folios and their photos.
  Existing version-1 project data is migrated to folios; photo Blobs are retained.
*/
const BaseDatos = (() => {
  const NOMBRE = 'registro_fotografico_folios_chinchao_copia';
  const VERSION = 2;
  let db = null;

  function abrir() {
    return new Promise((resolver, rechazar) => {
      if (!('indexedDB' in window)) {
        rechazar(new Error('Este navegador no admite IndexedDB.'));
        return;
      }
      const peticion = indexedDB.open(NOMBRE, VERSION);

      peticion.onupgradeneeded = (evento) => {
        const base = peticion.result;
        const tx = peticion.transaction;
        if (evento.oldVersion === 0) {
          base.createObjectStore('folios', { keyPath: 'id' });
          const fotos = base.createObjectStore('fotos', { keyPath: 'id' });
          fotos.createIndex('porFolio', 'folioId', { unique: false });
          return;
        }

        if (!base.objectStoreNames.contains('folios')) {
          base.createObjectStore('folios', { keyPath: 'id' });
          if (base.objectStoreNames.contains('proyectos')) {
            const origen = tx.objectStore('proyectos');
            const destino = tx.objectStore('folios');
            const cursor = origen.openCursor();
            cursor.onsuccess = () => {
              const actual = cursor.result;
              if (!actual) {
                base.deleteObjectStore('proyectos');
                return;
              }
              const anterior = actual.value;
              destino.put({
                id: anterior.id,
                tipoFolio: anterior.tipoFolio || anterior.establecimiento || '',
                cargo: anterior.cargo || anterior.fiscalizador || '',
                anio: anterior.anio || String(anterior.fecha || '').slice(0, 4),
                ubicacion: anterior.ubicacion || anterior.lugar || '',
                numeroFolio: anterior.numeroFolio || anterior.codigo || '',
                creado: anterior.creado || new Date().toISOString(),
                modificado: anterior.modificado || anterior.creado || new Date().toISOString(),
                datosAnteriores: anterior,
              });
              actual.continue();
            };
          }
        }

        if (base.objectStoreNames.contains('fotos')) {
          const fotos = tx.objectStore('fotos');
          if (fotos.indexNames.contains('porProyecto')) fotos.deleteIndex('porProyecto');
          if (!fotos.indexNames.contains('porFolio')) {
            fotos.createIndex('porFolio', 'folioId', { unique: false });
          }
          const cursor = fotos.openCursor();
          cursor.onsuccess = () => {
            const actual = cursor.result;
            if (!actual) return;
            const foto = actual.value;
            if (!foto.folioId) foto.folioId = foto.proyectoId;
            delete foto.proyectoId;
            actual.update(foto);
            actual.continue();
          };
        }
      };
      peticion.onsuccess = () => {
        db = peticion.result;
        db.onversionchange = () => db.close();
        resolver(db);
      };
      peticion.onerror = () => rechazar(peticion.error || new Error('No se pudo abrir la base de datos.'));
      peticion.onblocked = () => rechazar(new Error('Cierra las otras pesta\u00f1as de esta aplicaci\u00f3n y vuelve a intentarlo.'));
    });
  }

  function transaccion(almacenes, modo, trabajo) {
    return new Promise((resolver, rechazar) => {
      const tx = db.transaction(almacenes, modo);
      const salida = trabajo(tx);
      tx.oncomplete = () => resolver(salida instanceof IDBRequest ? salida.result : salida);
      tx.onerror = () => rechazar(tx.error || new Error('La operaci\u00f3n no se pudo completar.'));
      tx.onabort = () => rechazar(tx.error || new Error('La operaci\u00f3n fue cancelada.'));
    });
  }

  function guardarFolio(folio) {
    return transaccion('folios', 'readwrite', (tx) => tx.objectStore('folios').put(folio));
  }

  function listarFolios() {
    return transaccion('folios', 'readonly', (tx) => tx.objectStore('folios').getAll());
  }

  function obtenerFolio(id) {
    return transaccion('folios', 'readonly', (tx) => tx.objectStore('folios').get(id));
  }

  function eliminarFolio(id) {
    return transaccion(['folios', 'fotos'], 'readwrite', (tx) => {
      tx.objectStore('folios').delete(id);
      const almacenFotos = tx.objectStore('fotos');
      const claves = almacenFotos.index('porFolio').getAllKeys(IDBKeyRange.only(id));
      claves.onsuccess = () => claves.result.forEach((clave) => almacenFotos.delete(clave));
    });
  }

  function guardarFotos(lista) {
    return transaccion('fotos', 'readwrite', (tx) => {
      const almacen = tx.objectStore('fotos');
      lista.forEach((foto) => almacen.put(foto));
    });
  }

  function guardarFoto(foto) {
    return guardarFotos([foto]);
  }

  async function listarFotos(folioId) {
    const fotos = await transaccion('fotos', 'readonly', (tx) =>
      tx.objectStore('fotos').index('porFolio').getAll(IDBKeyRange.only(folioId))
    );
    return fotos.sort((a, b) => a.orden - b.orden);
  }

  function listarTodasFotos() {
    return transaccion('fotos', 'readonly', (tx) => tx.objectStore('fotos').getAll());
  }

  function eliminarFoto(id) {
    return transaccion('fotos', 'readwrite', (tx) => tx.objectStore('fotos').delete(id));
  }

  return {
    abrir,
    guardarFolio, listarFolios, obtenerFolio, eliminarFolio,
    guardarFoto, guardarFotos, listarFotos, listarTodasFotos, eliminarFoto,
  };
})();
