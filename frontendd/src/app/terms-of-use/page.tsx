import type { Metadata } from 'next';
import { PublicHeader } from '../../components/public-heder';

export const metadata: Metadata = {
  title: 'Lietošanas noteikumi | Domera',
  description: 'Domera e-pakalpojumu lietošanas noteikumi.',
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
  address: "Liepaja, Jekaba Janševska iela 18-1 ",
  domain: "domera.lv"
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

export default function TermsPage() {
  return (
    <main className="bg-slate-50">
                  <PublicHeader />
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-900 px-6 py-10 text-white sm:px-10 sm:py-12">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-slate-300">
              Domera
            </p>
            <h1 className="max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
              E-pakalpojumu lietošanas noteikumi
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Šie noteikumi nosaka Domera platformas lietošanas kārtību, lietotāju tiesības,
              pienākumus un atbildību, kā arī datu apstrādes pamatprincipus.
            </p>
          </div>

          <div className="space-y-12 px-6 py-10 sm:px-10 sm:py-12">
            <Section title="1. Termini">
              <BulletList
                items={[
                  <>
                    <strong>Vietne</strong> – <strong>{companyData.domain}</strong> un visi ar to
                    saistītie apakšdomēni.
                  </>,
                  <>
                    <strong>Vietnes pārzinis</strong> – <strong>{companyData.companyName}</strong>,
                    reģistrācijas numurs <strong>{companyData.regNr}</strong>. E-pasts: <strong>{companyData.email} </strong>.
                  </>,
                  <>
                    <strong>E-pakalpojums</strong> – Domera Vietnē piedāvātie elektroniskie
                    pakalpojumi.
                  </>,
                  <>
                    <strong>Noteikumi</strong> – šie Domera e-pakalpojumu lietošanas noteikumi.
                  </>,
                  <>
                    <strong>Apmeklētājs</strong> – neidentificēts Vietnes apmeklētājs.
                  </>,
                  <>
                    <strong>Lietotājs</strong> – persona, kura ir reģistrējusies un izveidojusi
                    Lietotāja kontu Domera Vietnē.
                  </>,
                  <>
                    <strong>Lietotāja konts</strong> – informācija par Lietotāju, piemēram,
                    e-pasta adrese, vārds, uzvārds vai nosaukums, tālruņa numurs, parole un cita
                    ar konta izmantošanu saistītā informācija.
                  </>,
                  <>
                    <strong>Pārvaldnieks</strong> – Vietnes pārziņa sadarbības partneris, piemēram,
                    apsaimniekošanas uzņēmums, pārvaldnieks vai cita pilnvarota persona, kuras
                    interesēs tiek nodrošināta datu apstrāde un E-pakalpojumu sniegšana.
                  </>,
                  <>
                    <strong>Nekustamā īpašuma objekts</strong> – dzīvoklis, neapdzīvojamā telpa vai
                    cits īpašuma objekts, kas ir saistīts ar Domera sistēmā reģistrētu ēku vai
                    pārvaldāmu objektu.
                  </>,
                ]}
              />
            </Section>

            <Section title="2. Sniegto pakalpojumu apraksts">
              <p>Lietotājs Vietnē var saņemt šādus E-pakalpojumus:</p>
              <BulletList
                items={[
                  'pieprasījumu nosūtīšana Pārvaldniekam par tiesību piešķiršanu piekļuvei Lietotāja pieteikumā norādītā Nekustamā īpašuma objekta datiem;',
                  'ūdens, siltuma, elektroenerģijas vai citu skaitītāju rādījumu iesniegšana tālākai nodošanai Pārvaldniekam;',
                  'piekļuve pārvaldnieka sagatavotajiem rēķiniem ar iespēju tos apmaksāt elektroniski, ja šāda funkcionalitāte tiek nodrošināta;',
                  'piekļuve iepriekš veikto maksājumu un norēķinu informācijai;',
                  'dalība Pārvaldnieka organizētajās aptaujās, balsojumos vai citās digitālās aktivitātēs;',
                  'pieprasījumu un pieteikumu nosūtīšana Vietnes sadarbības partneriem par izvēlēto E-pakalpojumu saņemšanu;',
                  'piekļuve ar īpašumu saistītajiem dokumentiem, paziņojumiem un informācijai, ja to nodrošina Pārvaldnieks.',
                ]}
              />
            </Section>

            <Section title="3. Vispārīgie noteikumi">
              <BulletList
                items={[
                  'Noteikumi ir saistoši katram Lietotājam. Vietnes lietošana ir uzskatāma par apstiprinājumu tam, ka Lietotājs pirms E-pakalpojumu lietošanas ir pilnībā iepazinies ar Noteikumiem un tiem piekrīt.',
                  'Vietnes pārzinim ir tiesības jebkurā laikā grozīt Noteikumus, un šie grozījumi stājas spēkā ar brīdi, kad tie ir publicēti Vietnē, ja vien nav noteikts citādi.',
                  'Lietotājs uzņemas pilnu atbildību par darbībām, kuras viņš vai trešā persona, kas izmanto Lietotāja kontu, veic, izmantojot Vietni, kā arī par šo darbību sekām.',
                  'Vietnes pārzinim ir tiesības pārtraukt Vietnes vai tās atsevišķu funkciju darbību, ja tas nepieciešams Vietnes pilnveidošanas, uzturēšanas, drošības vai modernizēšanas darbiem.',
                  'Vietnes pārzinis pats neveic un negarantē tiesību apstiprināšanu un piešķiršanu izvēlētam Nekustamā īpašuma objektam. Šo funkciju veic Pārvaldnieks.',
                  'Tehniskās problēmas Vietnes darbībā neatbrīvo Lietotāju no pienākuma noteiktajā termiņā iesniegt skaitītāju rādījumus vai veikt rēķinu apmaksu, ja šāds pienākums pastāv.',
                  'Vietnes pārzinim ir tiesības izmantot Lietotāja kontā norādīto informāciju, lai sazinātos ar Lietotāju, atgādinātu par skaitītāju rādījumu iesniegšanu, informētu par E-pakalpojumu izpildes gaitu, izmaiņām to darbībā vai jauniem pakalpojumiem.',
                  'Vietnē var tikt izmantotas sīkdatnes, kas nodrošina Vietnes pilnvērtīgu darbību. Lietojot Vietni, Apmeklētājs vai Lietotājs piekrīt sīkdatņu izmantošanai atbilstoši spēkā esošajai sīkdatņu politikai.',
                ]}
              />
            </Section>

            <Section title="4. Lietotāja pienākumi un atbildība">
              <BulletList
                items={[
                  'Lietotājs uzņemas pilnīgu atbildību par Lietotāja kontā norādītās informācijas patiesumu, tai skaitā par tiesībām izmantot norādīto tālruņa numuru un e-pasta adresi.',
                  'Lietotājs apņemas uzturēt visus Lietotāja kontā norādītos datus aktuālā un precīzā stāvoklī.',
                  'Lietotājs apliecina, ka e-pasta adrese, kura norādīta viņa Lietotāja kontā, netiek izmantota neatļautā veidā no trešo personu puses, un uzņemas pilnu atbildību par sekām, kas var rasties, nododot vai izpaužot Lietotāja konta piekļuves datus trešajām personām.',
                  'Lietotāja pienākums ir pārliecināties, ka informācija, kuru tas ievada, lietojot E-pakalpojumu, ir patiesa, korekta un pilnīga.',
                  'Lietotājs piekrīt, ka viņa Lietotāja kontā norādītā informācija var tikt nodota Pārvaldniekiem un sadarbības partneriem tādā apjomā, kāds nepieciešams kvalitatīvu E-pakalpojumu nodrošināšanai.',
                  'Ja Lietotājs nepiekrīt Noteikumiem un nevēlas turpmāk izmantot Vietnes pakalpojumus, Lietotājs var atteikties no E-pakalpojumu un Vietnes izmantošanas, dzēšot Lietotāja kontu.',
                  'Pēc Lietotāja konta dzēšanas Lietotāja ievadītie dati var tikt uzglabāti noteiktu laiku saskaņā ar piemērojamo privātuma politiku, normatīvajiem aktiem un Pārziņa leģitīmajām interesēm.',
                ]}
              />
            </Section>

            <Section title="5. Vietnes pārziņa tiesības un atbildība">
              <BulletList
                items={[
                  'Vietnes pārzinim ir tiesības uz Lietotāja kontā norādīto e-pasta adresi vai citu kontaktinformāciju nosūtīt atgādinājumus un paziņojumus, kas ir saistīti ar E-pakalpojumiem.',
                  'Vietnes pārzinis nav atbildīgs par zaudējumiem, kas Lietotājam radušies Vietnes vai saistīto informācijas sistēmu uzlabošanas, uzturēšanas, profilakses vai tehnisku traucējumu laikā.',
                  'Vietnes pārzinis nav atbildīgs par sekām, kas rodas, ja Lietotājs ir iesniedzis nepilnīgus, novecojušus vai nepareizus datus, kas nepieciešami reģistrācijai vai E-pakalpojumu sniegšanai.',
                  'Vietnes pārzinim ir tiesības automātiski atjaunot ar Nekustamā īpašuma objektu saistīto informāciju, tai skaitā skaitītāju rādījumus, skaitītāju derīguma termiņus, aprēķinu informāciju, objekta adresi un citus saistītos datus no Pārvaldnieku informācijas uzskaites sistēmām, lai savlaicīgi nodrošinātu Lietotājus ar aktuālu informāciju.',
                ]}
              />
            </Section>

            <Section title="6. Datu patiesums un atbildība par datu apstrādi">
              <p>
                Piekrītot Noteikumiem, Lietotājs piekrīt savu personas datu nodošanai Vietnes
                pārzinim un apliecina, ka viņam ir zināms, ka Vietnes pārzinis ir Lietotāja
                personas datu apstrādes pārzinis vai datu apstrādātājs atkarībā no konkrētā
                datu apstrādes procesa un sadarbības modeļa ar Pārvaldnieku.
              </p>
              <p>
                Vietnes pārzinis ir tiesīgs apstrādāt Lietotāja personas datus atbilstoši spēkā
                esošajiem Latvijas Republikas, Eiropas Savienības un citiem piemērojamiem
                normatīvajiem aktiem, lai:
              </p>
              <BulletList
                items={[
                  'izpildītu noslēgto līgumu vai vienošanos;',
                  'veiktu klientu uzskaiti;',
                  'piedāvātu, sniegtu un uzturētu pakalpojumus;',
                  'realizētu un aizsargātu Vietnes pārziņa tiesības un tiesiskās intereses;',
                  'izpildītu normatīvajos aktos noteiktos pienākumus;',
                  'sasniegtu iepriekš minētos mērķus nepieciešamajā apjomā.',
                ]}
              />
              <p>
                Norādīto mērķu sasniegšanai Vietnes pārzinim ir tiesības iegūt personas datus arī
                no trešajām personām, ciktāl tas ir tiesiski pieļaujams.
              </p>
              <p>
                Lietotājs, kas veic reģistrāciju Vietnē, apliecina, ka viņa iesniegtie dati,
                tostarp fizisko personu dati, ir patiesi un ka pastāv tiesisks pamats to
                izmantošanai. Pretējā gadījumā Lietotājs uzņemas atbildību par citas personas datu
                neatļautu izmantošanu un var tikt saukts pie atbildības normatīvajos aktos noteiktajā
                kārtībā.
              </p>
              <p>
                Lietotājs, nododot Vietnes pārzinim trešo personu datus apstrādei, atbild par to,
                ka pastāv tiesisks pamats šo personu datu apstrādei.
              </p>
              <p>
                Pārvaldnieks, apstrādājot Lietotāja pieprasījumu, pirms apstiprināšanas pārbauda
                Lietotāja tiesības uz noteiktu īpašumu saprātīgā termiņā saskaņā ar savu iekšējo
                kārtību.
              </p>
              <p>
                Pārvaldnieks patur tiesības neapstiprināt Lietotāja pieprasījumu uz noteiktu
                īpašumu, ja tiek konstatētas neatbilstības vai riski, kas var apdraudēt personas
                datu aizsardzību vai tiesisku piekļuvi datiem.
              </p>
            </Section>

            <Section title="7. Noteikumu spēkā stāšanās un atjaunināšana">
              <p>
                Šie Noteikumi stājas spēkā ar to publicēšanas dienu Vietnē un ir spēkā līdz brīdim,
                kad tie tiek aizstāti ar jaunu versiju.
              </p>
              <p>
                Aktuālā Noteikumu versija vienmēr ir pieejama Vietnē. Ja nepieciešams, Vietnes
                pārzinis var informēt Lietotājus arī papildu veidā, piemēram, nosūtot paziņojumu
                e-pastā vai publicējot sistēmas paziņojumu Lietotāja kontā.
              </p>
            </Section>
          </div>
        </div>
      </div>
    </main>
  );
}