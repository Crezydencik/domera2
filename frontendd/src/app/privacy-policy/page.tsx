import type { Metadata } from 'next'
import { PublicHeader } from '../../components/public-heder';

export const metadata: Metadata = {
  title: 'Privātuma politika | Domera',
  description:
    'Domera privātuma politika un personas datu apstrādes noteikumi.',
};

type SectionProps = {
  title: string;
  children: React.ReactNode;
};
const companyData = {
  companyName: "Deniss Kalnins",
  regNr: "19029910818",
  controller: "Deniss Kalnins",
  email: "lumtach@gmail.com",
  address: "Liepaja, Jekaba Janševska iela 18-1 "
};

function Section({ title, children }: SectionProps) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {title}
      </h2>
      <div className="space-y-4 text-base leading-8 text-slate-700">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-6 text-slate-700 marker:text-slate-400">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export default function PrivacyPolicy() {
  return (
    <div className="bg-slate-50">
      
            <PublicHeader />
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-900 px-6 py-10 text-white sm:px-10 sm:py-12">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-slate-300">
              Domera
            </p>
            <h1 className="max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
              Privātuma politika un personas datu apstrādes noteikumi
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Šajā lapā ir aprakstīts, kā Domera apstrādā, glabā un aizsargā personas datus,
              nodrošinot daudzdzīvokļu māju, dzīvokļu, rēķinu, skaitītāju rādījumu un dokumentu
              digitālu pārvaldību.
            </p>
          </div>

          <div className="space-y-12 px-6 py-10 sm:px-10 sm:py-12">
            <Section title="1. Vispārīgā informācija">
              <p>
                <strong>Privātuma politika un personas datu apstrādes noteikumi</strong>{' '}
                (turpmāk – <strong>Politika</strong>) ir izstrādāti, lai informētu fiziskās
                personas par to, kā <strong>{companyData.companyName}</strong>, reģistrācijas numurs{' '}
                <strong>{companyData.regNr}</strong> (turpmāk – <strong>Pārzinis</strong>), apstrādā Jūsu
                personas datus.
              </p>
              <p>
                Pārzinis uztur interneta vietni <strong>[domera domēns]</strong> un ar to saistītos
                apakšdomēnus (turpmāk – <strong>Domera</strong> vai <strong>Vietne</strong>), kas
                nodrošina digitālus pakalpojumus daudzdzīvokļu māju, dzīvokļu, īpašumu,
                maksājumu, skaitītāju rādījumu, dokumentu un iedzīvotāju savstarpējās saziņas
                pārvaldībai (turpmāk – <strong>E-pakalpojumi</strong>).
              </p>
            </Section>

            <Section title="2. E-pakalpojumi">
              <BulletList
                items={[
                  'daudzdzīvokļu māju, dzīvokļu un īpašumu datu pārvaldība;',
                  'lietotāju kontu izveide un pārvaldība;',
                  'pārvaldnieku, grāmatvežu, administratoru un iedzīvotāju piekļuves nodrošināšana atbilstoši lietotāju lomām;',
                  'ūdens, siltuma, elektroenerģijas un citu komunālo resursu skaitītāju rādījumu iesniegšana un uzskaite;',
                  'skaitītāju rādījumu vēstures attēlošana;',
                  'komunālo maksājumu, rēķinu un parādu uzskaite;',
                  'rēķinu sagatavošana, glabāšana un nosūtīšana;',
                  'dokumentu augšupielāde, glabāšana un piekļuve tiem;',
                  'saziņa starp pārvaldnieku, apsaimniekotāju un iedzīvotāju;',
                  'paziņojumu un atgādinājumu nosūtīšana;',
                  'pieteikumu, iesniegumu un citu pieprasījumu iesniegšana un apstrāde;',
                  'lietotāju uzaicināšana sistēmā;',
                  'datu analīze, atskaišu sagatavošana un pakalpojumu kvalitātes uzlabošana.',
                ]}
              />
            </Section>

            <Section title="3. Personas datu apstrādes joma">
              <p>Šī Politika attiecas uz šādām fizisko personu kategorijām:</p>
              <BulletList
                items={[
                  'esošajiem klientiem un lietotājiem, kuri izmanto Domera E-pakalpojumus;',
                  'potenciālajiem klientiem vai Vietnes apmeklētājiem, kuri ir ieinteresēti Domera pakalpojumos;',
                  'bijušajiem klientiem un lietotājiem, kuri iepriekš izmantojuši Domera E-pakalpojumus;',
                  'dzīvojamo īpašumu īpašniekiem, īrniekiem, deklarētām personām vai citiem ar īpašumu saistītiem lietotājiem, kuru dati tiek apstrādāti platformas funkcionalitātes nodrošināšanai.',
                ]}
              />
              <p>
                (Turpmāk – <strong>Lietotājs</strong> vai <strong>Jūs</strong>.)
              </p>
              <p>
                Lai nodrošinātu caurspīdīgumu personas datu apstrādē, Pārzinis sniedz zemāk
                norādīto informāciju saskaņā ar Eiropas Parlamenta un Padomes Regulu (ES)
                2016/679 (GDPR).
              </p>
            </Section>

            <Section title="4. Datu pārzinis">
              <p>Jūsu personas datu pārzinis ir:</p>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-slate-700">
                <p>
                  <strong>{companyData.companyName}</strong>
                </p>
                <p>Reģistrācijas numurs: <strong>{companyData.regNr}</strong></p>
                <p>Juridiskā adrese: <strong>{companyData.address}</strong></p>
                <p>
                  E-pasts saziņai par personas datu apstrādi: <strong>{companyData.email}</strong>
                </p>
              </div>
              <p>
                Ja Jums ir jautājumi par personas datu apstrādi Domera platformā, lūdzu,
                sazinieties ar Pārzini, rakstot uz iepriekš norādīto e-pasta adresi.
              </p>
            </Section>

            <Section title="5. Personas datu apstrādes mērķi">
              <BulletList
                items={[
                  'lietotāja reģistrācijai un autentifikācijai;',
                  'lietotāja identifikācijai;',
                  'lietotāja profila, lomu un piekļuves tiesību pārvaldībai;',
                  'līgumisko attiecību nodrošināšanai;',
                  'E-pakalpojumu nodrošināšanai un uzturēšanai;',
                  'skaitītāju rādījumu nodošanai, uzskaitei un vēstures attēlošanai;',
                  'rēķinu sagatavošanai, aprēķināšanai, glabāšanai un nosūtīšanai;',
                  'maksājumu un parādu uzskaitei;',
                  'dokumentu glabāšanai un piekļuves nodrošināšanai;',
                  'lietotāju iesniegumu, pieprasījumu, sūdzību un priekšlikumu izskatīšanai;',
                  'lietotāju atbalsta sniegšanai;',
                  'svarīgu paziņojumu, atgādinājumu un sistēmas ziņojumu nosūtīšanai;',
                  'Vietnes darbības uzturēšanai un drošības nodrošināšanai;',
                  'IT drošības incidentu novēršanai un izmeklēšanai;',
                  'platformas darbības statistikai, analīzei un kvalitātes uzlabošanai;',
                  'normatīvajos aktos noteikto pienākumu izpildei;',
                  'sadarbībai ar namu pārvaldniekiem, apsaimniekotājiem un citiem pakalpojumu sniedzējiem, ciktāl tas nepieciešams pakalpojuma nodrošināšanai;',
                  'mārketinga, informatīvo ziņojumu vai kontekstuālās reklāmas nodrošināšanai, ja tas ir pieļaujams saskaņā ar piemērojamiem normatīvajiem aktiem.',
                ]}
              />
            </Section>

            <Section title="6. Personas datu apstrādes tiesiskais pamats">
              <p>
                Personas datu apstrāde Domera platformā notiek saskaņā ar GDPR 6. pantu,
                pamatojoties uz vienu vai vairākiem no šiem tiesiskajiem pamatiem:
              </p>
              <BulletList
                items={[
                  <>
                    <strong>Lietotāja piekrišana</strong>;
                  </>,
                  <>
                    <strong>līguma izpilde</strong> vai pasākumu veikšana pēc Lietotāja
                    pieprasījuma pirms līguma noslēgšanas;
                  </>,
                  <>
                    <strong>juridiska pienākuma izpilde</strong>, kas attiecas uz Pārzini;
                  </>,
                  <>
                    <strong>Pārziņa vai trešās personas leģitīmās intereses</strong>, piemēram,
                    platformas drošības nodrošināšana, sistēmas darbības kontrole, krāpšanas
                    novēršana, tehniskās kļūdas novēršana, pakalpojumu attīstība un kvalitātes
                    uzlabošana.
                  </>,
                ]}
              />
            </Section>

            <Section title="7. Apstrādāto personas datu kategorijas">
              <p>
                Atkarībā no izmantotajiem E-pakalpojumiem, Pārzinis var apstrādāt šādas personas
                datu kategorijas:
              </p>
              <BulletList
                items={[
                  'identifikācijas dati: vārds, uzvārds, personas kods vai cits identifikators;',
                  'kontaktinformācija: e-pasta adrese, telefona numurs, deklarētā vai norādītā adrese;',
                  'konta informācija: lietotājvārds, parole (šifrētā veidā), autorizācijas un piekļuves dati;',
                  'īpašuma dati: dzīvokļa vai nekustamā īpašuma adrese, dzīvokļa numurs, mājas identifikācijas informācija;',
                  'līguma dati: informācija par līgumiem, klienta statusu un sadarbību ar pārvaldnieku vai apsaimniekotāju;',
                  'skaitītāju dati: skaitītāju numuri, rādījumi, iesniegšanas datumi, patēriņa vēsture;',
                  'norēķinu dati: rēķinu informācija, maksājumu statuss, parādu informācija;',
                  'saziņas dati: iesniegumi, pieteikumi, pieprasījumi, sarakste un paziņojumi;',
                  'tehniskie dati: IP adrese, ierīces dati, pārlūkprogrammas veids, operētājsistēma, piekļuves laiks, žurnālfailu ieraksti;',
                  'sīkdatņu un analītikas dati.',
                ]}
              />
            </Section>

            <Section title="8. Personas datu iegūšanas avoti">
              <BulletList
                items={[
                  'tieši no Jums, kad reģistrējaties vai izmantojat platformu;',
                  'no Jūsu pārvaldnieka, apsaimniekotāja vai citas pilnvarotas personas;',
                  'no līgumu vai norēķinu sistēmām, kas integrētas ar Domera;',
                  'no publiskiem reģistriem vai valsts iestādēm, ja tas ir nepieciešams un pieļaujams normatīvajos aktos;',
                  'automātiski, izmantojot sīkdatnes, serveru žurnālfailus un analītikas rīkus.',
                ]}
              />
            </Section>

            <Section title="9. Personas datu apstrādes gadījumi">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">9.1. Vietnes apmeklētāji</h3>
                  <p className="mt-2">
                    Apmeklējot Vietni, var tikt apstrādāti tehniskie un lietošanas dati,
                    piemēram, IP adrese, pārlūkprogrammas informācija, lietošanas paradumi,
                    sīkdatņu dati un citi analītiskie dati, lai nodrošinātu Vietnes darbību,
                    drošību un uzlabotu lietošanas pieredzi.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">9.2. Reģistrētie lietotāji</h3>
                  <p className="mt-2">
                    Reģistrējoties un izmantojot Domera E-pakalpojumus, Jūsu personas dati tiek
                    apstrādāti, lai nodrošinātu piekļuvi kontam, saistītu Jūsu kontu ar attiecīgo
                    īpašumu, pārvaldītu rēķinus, skaitītāju rādījumus, dokumentus, paziņojumus un
                    citus platformas pakalpojumus.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">9.3. Lietotāju uzaicināšana</h3>
                  <p className="mt-2">
                    Ja platformā tiek veikta jauna lietotāja uzaicināšana, Pārzinis var apstrādāt
                    uzaicināmās personas kontaktinformāciju, lai nodrošinātu piekļuves piešķiršanu
                    sistēmai.
                  </p>
                </div>
              </div>
            </Section>

            <Section title="10. Personas datu saņēmēji">
              <p>Jūsu personas dati var tikt nodoti vai tiem var piekļūt:</p>
              <BulletList
                items={[
                  'Pārziņa darbinieki un pilnvarotas personas;',
                  'namu pārvaldnieki, apsaimniekotāji, grāmatveži vai citi sadarbības partneri, kuri izmanto Domera platformu pakalpojumu sniegšanai;',
                  'IT pakalpojumu sniedzēji, hostinga pakalpojumu sniedzēji, datu glabāšanas, drošības, e-pasta vai tehniskā atbalsta pakalpojumu sniedzēji;',
                  'maksājumu, rēķinu piegādes, e-pasta un ziņojumu izsūtīšanas pakalpojumu sniedzēji;',
                  'analītikas un statistikas rīku nodrošinātāji;',
                  'valsts un pašvaldību iestādes, tiesībsargājošās iestādes vai uzraudzības institūcijas, ja to paredz normatīvie akti.',
                ]}
              />
            </Section>

            <Section title="11. Personas datu nodošana ārpus Eiropas Savienības vai EEZ">
              <p>
                Ja personas dati tiek nodoti ārpus Eiropas Savienības vai Eiropas Ekonomikas
                zonas, tas notiek tikai tad, ja ir nodrošināts atbilstošs datu aizsardzības
                līmenis saskaņā ar GDPR prasībām, piemēram, balstoties uz Eiropas Komisijas
                lēmumu par aizsardzības līmeņa pietiekamību vai piemērojot standarta līguma
                klauzulas.
              </p>
            </Section>

            <Section title="12. Personas datu glabāšanas termiņš">
              <p>
                Personas dati tiek glabāti tik ilgi, cik tas nepieciešams attiecīgā apstrādes
                mērķa sasniegšanai, līgumisko attiecību nodrošināšanai, normatīvo aktu prasību
                izpildei un Pārziņa leģitīmo interešu aizsardzībai.
              </p>
              <p>Ja Lietotāja konts tiek dzēsts, personas dati var tikt glabāti vēl noteiktu laiku, lai:</p>
              <BulletList
                items={[
                  'izpildītu normatīvo aktu prasības;',
                  'nodrošinātu grāmatvedības, nodokļu vai juridisko pienākumu izpildi;',
                  'aizsargātu Pārziņa leģitīmās intereses strīdu, prasījumu vai incidentu gadījumos.',
                ]}
              />
              <p>
                Konkrēti glabāšanas termiņi var atšķirties atkarībā no datu veida un piemērojamā
                tiesiskā pienākuma.
              </p>
            </Section>

            <Section title="13. Sīkdatnes un analītika">
              <p>
                Domera Vietnē var tikt izmantotas sīkdatnes un līdzīgas tehnoloģijas, lai:
              </p>
              <BulletList
                items={[
                  'nodrošinātu Vietnes tehnisko darbību;',
                  'atcerētos lietotāja izvēles un iestatījumus;',
                  'analizētu Vietnes lietošanu;',
                  'uzlabotu pakalpojumu kvalitāti un drošību;',
                  'nodrošinātu personalizētu saturu vai reklāmu, ja tas ir piemērojams.',
                ]}
              />
              <p>
                Informācija par izmantotajām sīkdatnēm, to veidiem, glabāšanas termiņiem un
                pārvaldīšanas iespējām ir pieejama atsevišķā <strong>Sīkdatņu politikā</strong>{' '}
                vai sīkdatņu paziņojumā Vietnē.
              </p>
            </Section>

            <Section title="14. Personas datu drošība">
              <p>
                Pārzinis īsteno atbilstošus tehniskus un organizatoriskus drošības pasākumus, lai
                aizsargātu personas datus pret neatļautu piekļuvi, izpaušanu, nozaudēšanu,
                iznīcināšanu vai neatļautu pārveidošanu.
              </p>
              <p>Šādi pasākumi var ietvert:</p>
              <BulletList
                items={[
                  'piekļuves tiesību ierobežošanu;',
                  'datu šifrēšanu;',
                  'sistēmu uzraudzību un žurnālfailu uzturēšanu;',
                  'rezerves kopiju veidošanu;',
                  'drošības incidentu pārvaldības procedūras.',
                ]}
              />
            </Section>

            <Section title="15. Lietotāja tiesības">
              <p>Kā datu subjektam Jums saskaņā ar GDPR ir tiesības:</p>
              <BulletList
                items={[
                  'pieprasīt piekļuvi saviem personas datiem;',
                  'pieprasīt savu personas datu labošanu;',
                  'pieprasīt savu personas datu dzēšanu;',
                  'pieprasīt apstrādes ierobežošanu;',
                  'iebilst pret personas datu apstrādi;',
                  'atsaukt piekrišanu, ja apstrāde balstās uz piekrišanu;',
                  'saņemt savus personas datus strukturētā, plaši lietojamā un mašīnlasāmā formātā, ja tas ir piemērojams;',
                  'iesniegt sūdzību Datu valsts inspekcijā, ja uzskatāt, ka Jūsu personas datu apstrāde neatbilst GDPR prasībām.',
                ]}
              />
              <p>
                Lai izmantotu savas tiesības, Jūs varat sazināties ar Pārzini, izmantojot šajā
                Politikā norādīto kontaktinformāciju.
              </p>
            </Section>

            <Section title="16. Izmaiņas Politikā">
              <p>
                Pārzinis ir tiesīgs jebkurā laikā veikt izmaiņas šajā Politikā. Aktuālā Politikas
                versija vienmēr tiek publicēta Vietnē.
              </p>
              <p>
                Ja izmaiņas ir būtiskas, Pārzinis var papildus informēt Lietotājus ar e-pasta,
                sistēmas paziņojuma vai citu atbilstošu līdzekļu starpniecību.
              </p>
            </Section>

            <Section title="17. Politikas spēkā stāšanās">
              <p>
                Šī Politika stājas spēkā ar tās publicēšanas dienu Vietnē un ir spēkā līdz tās
                atjaunināšanai vai aizstāšanai ar jaunu versiju.
              </p>
            </Section>

          </div>
        </div>
      </div>
    </div>
  );
}