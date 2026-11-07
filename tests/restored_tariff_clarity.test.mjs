import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const root=new URL('../',import.meta.url);
const read=file=>readFileSync(new URL(file,root),'utf8').replace(/\r\n/g,'\n');
test('the current full agreement and charter PDFs are directly discoverable',()=>{
 const archive=read('legal-archive.html');
 for(const file of ['DUTT-Service-Terms-v1.6-2026-11-07.pdf','DUTT-Consumer-Charter-v1.5-2026-11-07.pdf']){
  assert.ok(archive.includes(`href="/documents/${file}"`));
  assert.equal(readFileSync(new URL('documents/'+file,root)).subarray(0,5).toString('ascii'),'%PDF-');
 }
});
for(const file of ['service-terms.html','consumer-charter.html']){
 const html=read(file);
 test(`${file}: weight, volume and car pricing are explicit in both languages`,()=>{
  for(const marker of ['Δεν υπάρχει χρέωση ανά κιλό','No per-kilogram or volumetric-kilogram charge applies','Πάνω από 20 kg Ή έστω μία διάσταση πάνω από 45 cm','Above 20 kg OR any dimension above 45 cm','Τα 20 kg περιλαμβάνονται','Exactly 20 kg is within','δεν συνεπάγεται αποδοχή απεριόριστου','does not imply unlimited','6,52 €','9,13 €','€6.52','€9.13'])assert.ok(html.includes(marker),marker);
  assert.equal((html.match(/data-tariff-decision-table/g)||[]).length,2);
  assert.equal((html.match(/data-tariff-examples/g)||[]).length,2);
  assert.ok(html.includes('/documents/DUTT-Timokatalogos-2026-11-07.pdf'));
  assert.ok(html.includes('launch_v14_restored_customer_tariff'));
  assert.equal((html.match(/data-weight-pricing-clarification="2026-11-07"/g)||[]).length,2);
 });
}
test('agreement and charter have identical current pricing sections and arrays',()=>{
 const sections=html=>['pricing','pricing-en'].map(id=>html.split(`id="${id}"`)[1].split('</section>')[0]);
 assert.deepEqual(sections(read('service-terms.html')),sections(read('consumer-charter.html')));
 const prices=html=>JSON.parse(html.match(/const standardPrices = (\[[\s\S]*?\]);/)[1]);
 assert.deepEqual(prices(read('service-terms.html')),prices(read('consumer-charter.html')));
 assert.deepEqual(prices(read('service-terms.html')),prices(read('legal/versions/service-terms-v1.3-2026-09-07.html')));
});
test('the immediately previous29October versions remain public and preserve higher prices',()=>{
 const archive=read('legal-archive.html');
 for(const name of ['service-terms-v1.5-2026-10-29.html','consumer-charter-v1.4-2026-10-29.html']){
  assert.ok(archive.includes(name));
  const old=read('legal/versions/'+name);
  assert.ok(old.includes('launch_v13_selective_distance_pricing'));
  assert.ok(old.includes('4.84, 5.33'));
  assert.ok(old.includes('2026-10-29'));
 }
});
