export function createEconomicOfferAdapter(api, download) {
  let version = 0;
  let pending = Promise.resolve();
  const path = id => `/api/projects/${encodeURIComponent(id)}/economic-offer`;
  return {
    async get(id) {
      const { offer } = await api(path(id));
      version = offer?.version || 0;
      return offer;
    },
    save(id, draft) {
      const next = pending.then(async () => {
        try {
          const { offer } = await api(path(id), { method: 'PUT', json: { draft, version } });
          version = offer.version;
          return offer;
        } catch (error) {
          if (error.status === 409) throw new Error('El borrador fue actualizado en otra sesión. Copia tus cambios y vuelve a cargar la página. / The draft changed in another session. Copy your changes and reload.');
          throw error;
        }
      });
      pending = next.catch(() => {});
      return next;
    },
    async export(id, draft, language) {
      const { csv } = await api(`${path(id)}/export`, { method: 'POST', json: { draft, language } });
      download(csv);
      return true;
    },
  };
}
