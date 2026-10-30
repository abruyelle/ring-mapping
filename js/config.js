// Listes communes a tous les projets. Libelles dans js/i18n.js (tool.*, sev.*, st.*).
export const TYPES = {
  crack: { line: true },
  leak: {},
  spall: {},
  lip: {},
  other: {},
};

export const STATUS = ['open', 'repair', 'closed'];
export const LEGACY_STATUS = { Ouvert: 'open', 'En réparation': 'repair', Clos: 'closed' };
