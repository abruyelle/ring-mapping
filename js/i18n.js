// Langue et unites d'affichage. Les donnees restent stockees en pieds US et en codes.
import { fmtLen, fmtStation, lenValue } from './geometry.js';

export const prefs = { lang: 'fr', unit: 'ft' };

const FR = {
  'm3d.model': 'Modèle 3D', 'm3d.inside': 'Intérieur', 'm3d.ar': 'Caméra', 'ar.freeze': 'Figer l’image', 'ar.resume': 'Reprendre', 'ar.file': 'Photo existante',
  'help.model': 'Glissez pour tourner autour de l’anneau, pincez pour zoomer. Regardez l’intérieur par une extrémité pour tracer sur le segment ; à deux doigts, la vue tourne.',
  'help.inside': 'Vue depuis l’axe, vers l’avancement : le haut de l’écran est l’anneau précédent. Glissez pour regarder autour, pincez pour zoomer.',
  'help.ar': 'Visez l’anneau et calez le gabarit sur les joints : un doigt pour le déplacer, deux pour zoomer et tourner. Figez l’image, puis dessinez.',
  'msg.noCamera': 'Caméra indisponible : utilisez une photo existante', 'msg.noGyro': 'Gyroscope non autorisé : le gabarit ne suivra pas l’appareil',
  'tool.zone': 'Zone', 'col.photos': 'Photos', 'd.view3d': 'Vue 3D', 'd.addPhotos': 'Ajouter des photos', 'r.photos': 'Photos des défauts',
  'v3d.close': 'Fermer', 'v3d.prev': 'Anneau précédent', 'v3d.next': 'Anneau suivant',
  'msg.no3d': 'La vue 3D n’est pas disponible sur cet appareil', 'msg.photoAdded': 'Photos ajoutées : {n}', 'msg.photoFail': 'Cette image n’a pas pu être lue', 'msg.confirmPhoto': 'Supprimer cette photo ?',
  'tab.aria': 'Écrans', 'tab.data': 'Données', 'tab.ring': 'Anneaux', 'tab.def': 'Défauts', 'tab.tun': 'Tunnel 3D',
  'tun.title': 'Tunnel 3D', 'tun.open': 'Afficher le tunnel en 3D', 'tun.empty': 'Aucun anneau posé sur ce tunnel.', 'tun.noAxis': 'Ce projet ne contient pas de tracé : le tunnel est affiché en ligne droite. Réimportez le fichier projet à jour.', 'tun.all': 'Vue d’ensemble', 'tun.top': 'Dessus', 'tun.side': 'Profil', 'tun.help': 'Tracé en jaune, partie construite en orange. De près : anneaux montés avec leur numéro, clés, défauts en points de couleur. Glissez pour tourner, pincez pour zoomer, touchez un anneau pour l’ouvrir.',
  'app.note': 'Anneaux dépliés autour de la crown, clé en orange. Les données restent sur cet appareil.',
  'aria.tunnel': 'Tunnel', 'aria.tool': 'Outil',
  'pref.lang': 'Langue', 'pref.unit': 'Unités', 'unit.ft': 'Pieds US', 'unit.m': 'Mètres',
  'tool.view': 'Consulter', 'tool.crack': 'Fissure', 'tool.leak': 'Infiltration', 'tool.spall': 'Épaufrure',
  'tool.lip': 'Désaffleurement', 'tool.other': 'Autre',
  'nav.ring': 'Anneau', 'nav.go': 'Aller', 'nav.zoom': 'Zoom',
  'leg.key': 'Clé', 'leg.near': 'Segments voisins', 'leg.others': 'Autres segments', 'leg.ghost': 'Pas encore posé', 'leg.concrete': 'Bandeau béton', 'leg.fiber': 'Bandeau fibre',
  'leg.short': 'Bandeau haut : anneau plus étroit',
  'pose.title': "Pose d'anneau", 'pose.rfr': 'Fichier de guidage RFR (.csv)', 'pose.ring': 'Anneau', 'pose.key': 'Clé posée',
  'pose.date': 'Date de pose', 'pose.save': 'Enregistrer la pose', 'pose.done': 'Terminé',
  'pose.offset': 'Décalage de chaînage : {v} m', 'pose.noOffset': 'Décalage de chaînage inconnu : il sera repris du premier fichier RFR.',
  'reg.title': 'Registre des défauts', 'reg.allTypes': 'Tous les types', 'reg.allStatus': 'Tous les statuts',
  'reg.filterType': 'Filtrer par type', 'reg.filterStatus': 'Filtrer par statut',
  'reg.count1': '{n} défaut', 'reg.countN': '{n} défauts', 'reg.empty': 'Aucun défaut pour ce filtre. Choisissez un outil et annotez le développé.',
  'col.ring': 'Anneau', 'col.station': 'Station', 'col.segment': 'Segment', 'col.position': 'Position', 'col.type': 'Type',
  'col.severity': 'Gravité', 'col.length': 'Longueur', 'col.status': 'Statut', 'col.date': 'Constaté le', 'col.by': 'Par', 'col.note': 'Note',
  'col.actions': 'Actions', 'act.edit': 'Modifier', 'act.delete': 'Supprimer',
  'exp.author': 'Votre nom sur les relevés', 'exp.pdf': 'Rapport PDF', 'exp.excel': 'Tableur Excel', 'exp.backup': 'Exporter les données', 'exp.restore': 'Importer / fusionner', 'exp.help': 'Déposez vos données exportées sur le serveur du projet. Importer un fichier fusionne les relevés : la version la plus récente de chaque fiche est conservée.',
  'sev.1': 'Mineure', 'sev.2': 'Moyenne', 'sev.3': 'Majeure',
  'st.open': 'Ouvert', 'st.repair': 'En réparation', 'st.closed': 'Clos',
  'mat.concrete': 'Béton', 'mat.fiber': 'Fibre', 'mat.other': 'Autre',
  'stat.rings': 'anneaux posés', 'stat.front': 'station du front', 'stat.open': 'défauts ouverts', 'stat.cracks': 'de fissures relevées',
  'd.ringEmpty': 'Touchez un anneau ou un défaut sur le développé pour voir sa fiche.', 'd.ring': 'Anneau',
  'd.keySet': 'Clé posée', 'd.keyOpt': 'Clé proposée', 'd.laid': 'Posé le', 'd.source': 'Source', 'd.defects': 'Défauts',
  'd.fixKey': 'Corriger la clé', 'src.rfr': 'Guidage', 'src.manual': 'Saisie',
  'd.date': 'Constaté le', 'd.by': 'Par', 'd.moveLine': 'Redessiner sur la carte', 'd.movePoint': 'Déplacer sur la carte', 'd.delete': 'Supprimer ce défaut',
  'msg.notLaid': 'Cet anneau n’est pas encore posé', 'msg.saved': 'Relevé enregistré ({type}), complétez sa fiche',
  'msg.moved': 'Position modifiée', 'msg.moveHint': 'Touchez la carte pour indiquer la nouvelle position',
  'msg.lineHint': 'Tracez le nouveau tracé sur la carte', 'msg.tooShort': 'Tracez un trait plus long',
  'msg.confirmDelete': 'Supprimer définitivement ce défaut ?', 'msg.deleted': 'Défaut supprimé', 'msg.keyFixed': 'Clé corrigée',
  'msg.ringLimit': 'Ce tunnel compte {n} anneaux', 'msg.ringSaved': 'Anneau {n} enregistré, clé K{k}',
  'msg.rfrTooLong': 'Ce fichier dépasse les {n} anneaux de ce tunnel : vérifiez le tunnel choisi',
  'msg.rfrRead': '{n} anneaux lus, {a} nouveaux', 'msg.rfrFixed': ', clé corrigée sur {n}',
  'msg.backup': 'Fichier de données créé', 'msg.restored': 'Fusion terminée : {r} anneaux et {d} défauts mis à jour', 'msg.updated': 'Application mise à jour en {v}', 'msg.projectSaved': 'Projet enregistré',
  'msg.confirmProject': 'Supprimer le projet {p} et toutes ses données de cet appareil ?',
  'err.notProject': 'Ce fichier n’est pas un fichier projet', 'err.notData': 'Ce fichier n’est pas un fichier de données', 'err.name': 'Donnez un nom au projet', 'err.unit': 'Unité inconnue',
  'err.segments': 'Segments : la somme des angles doit faire 360°', 'err.types': 'Types d’anneau : indiquez nom, matériau et largeur', 'err.tunnels': 'Tunnels : vérifiez chaque ligne et les types utilisés dans le plan', 'err.number': 'Vérifiez les valeurs numériques',
  'err.rfrEmpty': 'Ce fichier est vide', 'err.rfrColumns': 'Colonnes du guidage introuvables dans ce fichier', 'err.rfrGap': 'Numérotation des anneaux interrompue dans ce fichier', 'err.rfrNone': 'Aucun anneau posé dans ce fichier',
  'p.title': 'Projet', 'p.edit': 'Projet', 'p.new': 'Nouveau projet', 'p.import': 'Importer un fichier projet', 'p.name': 'Nom du projet', 'p.unit': 'Unité du projet', 'p.circ': 'Développé de l’anneau', 'p.taper': 'Biseau de la clé (par joint)', 'p.keys': 'Positions de clé',
  'p.segs': 'Segments, de la clé vers le sens horaire (nom:degrés)', 'p.types': 'Types d’anneau, un par ligne : nom matériau largeur (concrete, fiber ou other)', 'p.tunnels': 'Tunnels, un par ligne : id | nom | nb anneaux | décalage chaînage en m | plan premier_anneau:type',
  'p.save': 'Enregistrer', 'p.cancel': 'Annuler', 'p.export': 'Exporter le fichier projet', 'p.delete': 'Supprimer ce projet',
  'r.title': '{p}, {t} : développé des anneaux', 'r.edited': 'Édité le {d}', 'r.by': ' par {a}',
  'r.summary': '{b} / {t} anneaux posés · {n} défauts ({c})',
  'r.note': 'Développé de {c} centré sur la crown. Clé en orange. Bandeau supérieur : gris = béton, vert = fibre, bande haute = anneau de 4 ft.',
  'r.strip': 'Anneaux {a} à {b} · stations {s} à {e}', 'r.none': 'Aucun anneau posé sur ce tunnel.', 'r.seg': 'Seg.', 'r.pos': 'Pos.',
  'x.defects': 'Défauts', 'x.rings': 'Anneaux', 'x.id': 'N°', 'x.tunnel': 'Tunnel', 'x.pm': 'Chaînage PM (m)', 'x.material': 'Matériau',
  'x.width': 'Largeur', 'x.src': 'Source', 'x.count': 'Nb défauts', 'x.file': 'Ring Mapping {p} {t} {d}.xlsx',
};

const EN = {
  'm3d.model': '3D model', 'm3d.inside': 'Inside', 'm3d.ar': 'Camera', 'ar.freeze': 'Freeze image', 'ar.resume': 'Resume', 'ar.file': 'Existing photo',
  'help.model': 'Drag to orbit the ring, pinch to zoom. Look inside through one end to draw on the segment; with two fingers the view orbits.',
  'help.inside': 'View from the axis, facing the drive direction: the top of the screen is the previous ring. Drag to look around, pinch to zoom.',
  'help.ar': 'Aim at the ring and align the template with the joints: one finger moves it, two zoom and rotate. Freeze the image, then draw.',
  'msg.noCamera': 'Camera unavailable: use an existing photo', 'msg.noGyro': 'Gyroscope not allowed: the template will not follow the device',
  'tool.zone': 'Zone', 'col.photos': 'Photos', 'd.view3d': '3D view', 'd.addPhotos': 'Add photos', 'r.photos': 'Defect photos',
  'v3d.close': 'Close', 'v3d.prev': 'Previous ring', 'v3d.next': 'Next ring',
  'msg.no3d': '3D view is not available on this device', 'msg.photoAdded': 'Photos added: {n}', 'msg.photoFail': 'This image could not be read', 'msg.confirmPhoto': 'Delete this photo?',
  'tab.aria': 'Screens', 'tab.data': 'Data', 'tab.ring': 'Rings', 'tab.def': 'Defects', 'tab.tun': '3D tunnel',
  'tun.title': '3D tunnel', 'tun.open': 'Show the tunnel in 3D', 'tun.empty': 'No rings built on this tunnel.', 'tun.noAxis': 'This project has no alignment: the tunnel is shown as a straight line. Import the latest project file again.', 'tun.all': 'Overview', 'tun.top': 'Top', 'tun.side': 'Profile', 'tun.help': 'Alignment in yellow, built section in orange. Up close: built rings with their numbers, keys, defects as colored dots. Drag to orbit, pinch to zoom, tap a ring to open it.',
  'app.note': 'Rings unrolled around the crown, key in orange. Data stays on this device.',
  'aria.tunnel': 'Tunnel', 'aria.tool': 'Tool',
  'pref.lang': 'Language', 'pref.unit': 'Units', 'unit.ft': 'US feet', 'unit.m': 'Meters',
  'tool.view': 'Browse', 'tool.crack': 'Crack', 'tool.leak': 'Leak', 'tool.spall': 'Spall',
  'tool.lip': 'Lippage', 'tool.other': 'Other',
  'nav.ring': 'Ring', 'nav.go': 'Go', 'nav.zoom': 'Zoom',
  'leg.key': 'Key', 'leg.near': 'Adjacent segments', 'leg.others': 'Other segments', 'leg.ghost': 'Not yet built', 'leg.concrete': 'Concrete band', 'leg.fiber': 'Fiber band',
  'leg.short': 'Tall band: narrower ring',
  'pose.title': 'Ring build', 'pose.rfr': 'RFR guidance file (.csv)', 'pose.ring': 'Ring', 'pose.key': 'Key as built',
  'pose.date': 'Build date', 'pose.save': 'Save ring', 'pose.done': 'Complete',
  'pose.offset': 'Chainage offset: {v} m', 'pose.noOffset': 'Chainage offset unknown: it will come from the first RFR file.',
  'reg.title': 'Defect log', 'reg.allTypes': 'All types', 'reg.allStatus': 'All statuses',
  'reg.filterType': 'Filter by type', 'reg.filterStatus': 'Filter by status',
  'reg.count1': '{n} defect', 'reg.countN': '{n} defects', 'reg.empty': 'No defects for this filter. Pick a tool and mark up the map.',
  'col.ring': 'Ring', 'col.station': 'Station', 'col.segment': 'Segment', 'col.position': 'Position', 'col.type': 'Type',
  'col.severity': 'Severity', 'col.length': 'Length', 'col.status': 'Status', 'col.date': 'Found on', 'col.by': 'By', 'col.note': 'Note',
  'col.actions': 'Actions', 'act.edit': 'Edit', 'act.delete': 'Delete',
  'exp.author': 'Your name on records', 'exp.pdf': 'PDF report', 'exp.excel': 'Excel sheet', 'exp.backup': 'Export data', 'exp.restore': 'Import / merge', 'exp.help': 'Upload your exported data to the project server. Importing a file merges the records: the most recent version of each one is kept.',
  'sev.1': 'Minor', 'sev.2': 'Moderate', 'sev.3': 'Major',
  'st.open': 'Open', 'st.repair': 'In repair', 'st.closed': 'Closed',
  'mat.concrete': 'Concrete', 'mat.fiber': 'Fiber', 'mat.other': 'Other',
  'stat.rings': 'rings built', 'stat.front': 'front station', 'stat.open': 'open defects', 'stat.cracks': 'of cracks recorded',
  'd.ringEmpty': 'Tap a ring or a defect on the map to open its record.', 'd.ring': 'Ring',
  'd.keySet': 'Key as built', 'd.keyOpt': 'Proposed key', 'd.laid': 'Built on', 'd.source': 'Source', 'd.defects': 'Defects',
  'd.fixKey': 'Correct the key', 'src.rfr': 'Guidance', 'src.manual': 'Manual',
  'd.date': 'Found on', 'd.by': 'By', 'd.moveLine': 'Redraw on the map', 'd.movePoint': 'Move on the map', 'd.delete': 'Delete this defect',
  'msg.notLaid': 'This ring is not built yet', 'msg.saved': '{type} saved, complete its record',
  'msg.moved': 'Position updated', 'msg.moveHint': 'Tap the map to set the new position',
  'msg.lineHint': 'Draw the new outline on the map', 'msg.tooShort': 'Draw a longer line',
  'msg.confirmDelete': 'Permanently delete this defect?', 'msg.deleted': 'Defect deleted', 'msg.keyFixed': 'Key corrected',
  'msg.ringLimit': 'This tunnel has {n} rings', 'msg.ringSaved': 'Ring {n} saved, key K{k}',
  'msg.rfrTooLong': 'This file goes past the {n} rings of this tunnel: check the selected tunnel',
  'msg.rfrRead': '{n} rings read, {a} new', 'msg.rfrFixed': ', key corrected on {n}',
  'msg.backup': 'Data file created', 'msg.restored': 'Merge complete: {r} rings and {d} defects updated', 'msg.updated': 'App updated to {v}', 'msg.projectSaved': 'Project saved',
  'msg.confirmProject': 'Delete project {p} and all its data from this device?',
  'err.notProject': 'This is not a project file', 'err.notData': 'This is not a data file', 'err.name': 'Enter a project name', 'err.unit': 'Unknown unit',
  'err.segments': 'Segments: angles must add up to 360°', 'err.types': 'Ring types: enter name, material and width', 'err.tunnels': 'Tunnels: check each line and the types used in the plan', 'err.number': 'Check the numeric values',
  'err.rfrEmpty': 'This file is empty', 'err.rfrColumns': 'Guidance columns not found in this file', 'err.rfrGap': 'Ring numbering is broken in this file', 'err.rfrNone': 'No built rings in this file',
  'p.title': 'Project', 'p.edit': 'Project', 'p.new': 'New project', 'p.import': 'Import a project file', 'p.name': 'Project name', 'p.unit': 'Project unit', 'p.circ': 'Ring development', 'p.taper': 'Key taper (per joint)', 'p.keys': 'Key positions',
  'p.segs': 'Segments, from the key clockwise (name:degrees)', 'p.types': 'Ring types, one per line: name material width (concrete, fiber or other)', 'p.tunnels': 'Tunnels, one per line: id | name | ring count | chainage offset in m | plan first_ring:type',
  'p.save': 'Save', 'p.cancel': 'Cancel', 'p.export': 'Export project file', 'p.delete': 'Delete this project',
  'r.title': '{p}, {t}: ring development', 'r.edited': 'Issued {d}', 'r.by': ' by {a}',
  'r.summary': '{b} / {t} rings built · {n} defects ({c})',
  'r.note': 'Development of {c} centered on the crown. Key in orange. Top band: gray = concrete, green = fiber, tall band = 4 ft ring.',
  'r.strip': 'Rings {a} to {b} · stations {s} to {e}', 'r.none': 'No rings built on this tunnel.', 'r.seg': 'Seg.', 'r.pos': 'Pos.',
  'x.defects': 'Defects', 'x.rings': 'Rings', 'x.id': 'No.', 'x.tunnel': 'Tunnel', 'x.pm': 'Chainage PM (m)', 'x.material': 'Material',
  'x.width': 'Width', 'x.src': 'Source', 'x.count': 'Defect count', 'x.file': 'Ring Mapping {p} {t} {d}.xlsx',
};

const DICT = { fr: FR, en: EN };

export function t(key, vars = {}) {
  const s = DICT[prefs.lang][key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

export function applyI18n(root = document) {
  document.documentElement.lang = prefs.lang;
  root.querySelectorAll('[data-i18n]').forEach((e) => (e.textContent = t(e.dataset.i18n)));
  root.querySelectorAll('[data-i18n-aria]').forEach((e) => e.setAttribute('aria-label', t(e.dataset.i18nAria)));
}

export const stationText = (ft) => fmtStation(ft, prefs.unit);
export const lenText = (ft) => fmtLen(ft, prefs.unit);
export const lenNumber = (ft) => lenValue(ft, prefs.unit);
export const unitName = () => prefs.unit;
