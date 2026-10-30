import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Layout, clock, crackLength, fmtLen, fmtStation, makeGeometry, toFt } from '../js/geometry.js';
import { mergeRFR, parseRFR, stationFt } from '../js/rfr.js';
import {
  TEMPLATE, normalizeProject, parseSegments, parseTunnels, parseTypes, segmentsText, tunnelsText, typesText,
} from '../js/project.js';

const fixture = normalizeProject(JSON.parse(readFileSync(new URL('./fixture.project.json', import.meta.url), 'utf8')));
const geo = makeGeometry(fixture);
const widthOf = (p) => (l) => p.ringTypes[l].width;

test('la cle tombe sur son heure, K12 a la crown et K6 a l invert', () => {
  assert.equal(geo.segAt(12, 0), 'K');
  assert.equal(geo.segAt(3, 90), 'K');
  assert.equal(geo.segAt(6, 180), 'K');
  assert.equal(geo.segAt(6, -180), 'K');
  assert.equal(geo.segAt(9, -90), 'K');
});

test('les segments suivent la cle dans le sens horaire', () => {
  assert.deepEqual([0, 60, 120, 180, -120, -60].map((d) => geo.segAt(12, d)), ['K', 'D', 'E', 'A', 'B', 'C']);
  assert.equal(geo.bounds(12).length, 7);
});

test('cle etroite et nombre de positions libres', () => {
  const p = normalizeProject({
    ...fixture, id: 'x', keyPositions: 16, segments: [{ name: 'K', deg: 20 }, { name: 'A', deg: 170 }, { name: 'B', deg: 170 }],
  });
  const g = makeGeometry(p);
  assert.equal(g.segAt(16, 9), 'K');
  assert.equal(g.segAt(16, 11), 'A');
  assert.equal(g.segAt(4, 90), 'K');
  assert.equal(g.segAt(4, 105), 'A');
});

test('projet en metres converti en interne', () => {
  const p = normalizeProject({ ...fixture, id: 'y', unit: 'm', circumference: 20, ringTypes: { L: { material: 'concrete', width: 1.5 }, M: { material: 'fiber', width: 1.2 } } });
  assert.ok(Math.abs(makeGeometry(p).circ - 65.617) < 0.001);
  assert.ok(Math.abs(toFt(1.5, 'm') - 4.92126) < 0.001);
});

test('position horaire', () => {
  assert.equal(clock(0), '12h');
  assert.equal(clock(90), '3h');
  assert.equal(clock(-90), '9h');
  assert.equal(clock(180), '6h');
});

test('plan : types et longueur cumulee', () => {
  const t = fixture.tunnels[0];
  const l = new Layout(t.plan, t.total, widthOf(fixture));
  assert.equal(l.label(1), 'L');
  assert.equal(l.label(100), 'M');
  assert.equal(l.label(119), 'M');
  assert.equal(l.label(120), 'L');
  assert.equal(l.length, 300 * 5 - 20);
  assert.equal(l.maxWidth, 5);
});

test('conversion anneau <-> pieds avec largeurs mixtes', () => {
  const l = new Layout([[1, 'L'], [3, 'M'], [5, 'L']], 6, widthOf(fixture));
  assert.equal(l.ftOf(3), 10);
  assert.equal(l.ftOf(4.5), 16);
  assert.equal(l.ftOf(5), 18);
  assert.equal(l.ringAtFt(17.9), 4);
  assert.equal(l.ringAtFt(18), 5);
  assert.ok(Math.abs(l.rOf(l.ftOf(4.25)) - 4.25) < 1e-9);
});

test('longueur de fissure sur le developpe', () => {
  const l = new Layout([[1, 'L']], 10, widthOf(fixture));
  assert.ok(Math.abs(crackLength([{ r: 1, d: 0 }, { r: 2, d: 0 }], l, 60) - 5) < 1e-9);
  assert.ok(Math.abs(crackLength([{ r: 1, d: 0 }, { r: 1, d: 180 }], l, 60) - 30) < 1e-9);
});

test('format de station et unites', () => {
  assert.equal(fmtStation(17594.52053), '175+94.52');
  assert.equal(fmtStation(17599.999), '176+00.00');
  assert.equal(fmtStation(5.4), '0+05.40');
  assert.equal(fmtStation(17594.52053, 'm'), '5+362.82');
  assert.equal(fmtStation(32.8083, 'm'), '0+010.00');
  assert.equal(fmtLen(5, 'ft'), '5 ft');
  assert.equal(fmtLen(5, 'm'), '1.52 m');
});

test('fichier projet : erreurs lisibles', () => {
  assert.throws(() => normalizeProject({}), /err.notProject/);
  assert.throws(() => normalizeProject({ ...fixture, name: ' ' }), /err.name/);
  assert.throws(() => normalizeProject({ ...fixture, segments: [{ name: 'A', deg: 100 }, { name: 'B', deg: 100 }, { name: 'C', deg: 100 }] }), /err.segments/);
  assert.throws(() => normalizeProject({ ...fixture, tunnels: [{ id: 'W', name: 'W', total: 5, plan: [[1, 'Z']] }] }), /err.tunnels/);
});

test('ecran projet : aller-retour texte', () => {
  const back = normalizeProject({
    ...fixture, segments: parseSegments(segmentsText(fixture)), ringTypes: parseTypes(typesText(fixture)), tunnels: parseTunnels(tunnelsText(fixture)),
  });
  assert.deepEqual(back, fixture);
  assert.equal(normalizeProject({ ...TEMPLATE, name: 'Été 2027 / Lot A' }).id, 'ete-2027-lot-a');
});

const cols = TEMPLATE.rfr;

test('RFR : point-virgule, virgule decimale, arret aux anneaux non poses', () => {
  const p = parseRFR('AnnNum;PM;CleOpt;ClePil;RingState\n1;-12,1;6;12;0\n2;-10,6;7;7;0\n3;0;0;0;0\n', cols);
  assert.equal(p.rings.length, 2);
  assert.deepEqual(p.rings[0], { n: 1, key: 12, opt: 6, pm: -12.1 });
  assert.equal(p.offsetM, null);
});

test('RFR : colonnes propres au projet', () => {
  const p = parseRFR('Ring,Chain,Prop,Built\n1,10,2,3\n', { ring: 'Ring', pm: 'Chain', keyProposed: 'Prop', key: 'Built' });
  assert.deepEqual(p.rings, [{ n: 1, key: 3, opt: 2, pm: 10 }]);
});

test('RFR : erreurs lisibles', () => {
  assert.throws(() => parseRFR('a,b\n1,2\n', cols), /err.rfrColumns/);
  assert.throws(() => parseRFR('AnnNum,PM,CleOpt,ClePil\n1,0,1,1\n3,3,1,1\n', cols), /err.rfrGap/);
  assert.throws(() => parseRFR('AnnNum,PM,CleOpt,ClePil\n', cols), /err.rfrNone/);
});

test('fusion RFR : le guidage corrige la cle et garde date et auteur', () => {
  const old = [{ n: 1, key: 4, date: '2026-10-30', by: 'QC', opt: 0, pm: null }];
  const r = mergeRFR(old, { rings: [{ n: 1, key: 5, opt: 5, pm: 1 }, { n: 2, key: 7, opt: 7, pm: 2 }] }, 'p/N', 't');
  assert.deepEqual(r.corrected, [1]);
  assert.equal(r.added, 1);
  assert.equal(r.rings[0].key, 5);
  assert.equal(r.rings[0].date, '2026-10-30');
  assert.equal(r.rings[1].date, '');
});

const REAL = process.env.RFR_FILE;
test('fichier de guidage reel (RFR_FILE)', { skip: !REAL }, () => {
  const p = parseRFR(readFileSync(REAL, 'utf8'), cols);
  assert.ok(p.rings.length >= 1);
  assert.ok(p.offsetM != null);
  console.log('station anneau 1 :', fmtStation(stationFt(p.rings[0].pm, p.offsetM)));
});
