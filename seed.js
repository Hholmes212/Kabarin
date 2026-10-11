// Isi database dengan berita contoh. Otomatis jalan saat database kosong; manual: npm run seed
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

const UPLOADS = path.join(__dirname, 'uploads');
const PALETTES = {
  Technology: ['#0b1d3a', '#2f6bff', '#7ee8ff'],
  Business: ['#10261c', '#1fa971', '#d4ff3f'],
  Sports: ['#2a0e0a', '#ff4d2e', '#ffc857'],
  Politics: ['#1e1033', '#7b4dff', '#ff8fb8'],
  Entertainment: ['#2b0a24', '#ff3d9a', '#ffd23f'],
};

// Sampul abstrak (SVG) per kategori - pengganti foto sampai kamu upload foto asli
function cover(category, seed) {
  const [bg, a, b] = PALETTES[category];
  const r = (n, i) => ((seed * 9301 + i * 49297 + n * 233) % 1000) / 1000;
  const shapes = Array.from({ length: 7 }, (_, i) => {
    const x = Math.round(r(1, i) * 1200), y = Math.round(r(2, i) * 750), s = 80 + Math.round(r(3, i) * 260);
    const col = i % 2 ? a : b, op = (0.18 + r(4, i) * 0.5).toFixed(2);
    return i % 3 === 0 ? `<circle cx="${x}" cy="${y}" r="${s / 2}" fill="${col}" opacity="${op}"/>`
      : i % 3 === 1 ? `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s / 5}" fill="${col}" opacity="${op}" transform="rotate(${Math.round(r(5, i) * 60 - 30)} ${x} ${y})"/>`
      : `<path d="M${x} ${y} l${s} ${s / 2} l${-s / 2} ${s} z" fill="${col}" opacity="${op}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 750" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${a}" stop-opacity=".55"/></linearGradient>
<filter id="b"><feGaussianBlur stdDeviation="14"/></filter></defs>
<rect width="1200" height="750" fill="url(#g)"/><g filter="url(#b)">${shapes}</g>
<g fill="none" stroke="#fff" stroke-opacity=".08">${Array.from({ length: 12 }, (_, i) => `<path d="M0 ${i * 70} H1200"/>`).join('')}</g></svg>`;
}

const NEWS = [
  ['Technology', 'Startup Bandung luncurkan asisten AI yang paham bahasa gaul dan campuran bahasa daerah',
    'Sebuah startup asal Bandung resmi meluncurkan asisten AI yang dilatih khusus untuk memahami bahasa Indonesia sehari-hari, termasuk bahasa gaul dan campuran bahasa daerah.\n\nPendiri startup menyebut aplikasi ini ditujukan untuk membantu pelajar dan pelaku UMKM menulis, merangkum, dan menerjemahkan dokumen dengan lebih cepat. Versi beta dapat dicoba gratis selama tiga bulan pertama.\n\n"Banyak asisten AI masih kaku saat diajak bicara santai. Kami ingin teknologi yang terasa seperti ngobrol dengan teman," ujar salah satu pendiri.', 2],
  ['Technology', 'Jaringan 5G mulai menjangkau lebih banyak kota di luar Pulau Jawa',
    'Operator seluler mempercepat pembangunan jaringan 5G ke kota-kota di luar Pulau Jawa. Dalam enam bulan terakhir, puluhan menara baru diaktifkan di Sumatra, Kalimantan, dan Sulawesi.\n\nPengamat menilai pemerataan jaringan akan mendorong layanan pendidikan dan kesehatan jarak jauh, meski harga perangkat yang kompatibel masih menjadi tantangan.', 9],
  ['Technology', 'Tips amankan akun: dari kata sandi unik sampai verifikasi dua langkah',
    'Pakar keamanan siber mengingatkan pengguna untuk tidak memakai kata sandi yang sama di banyak layanan. Gunakan pengelola kata sandi dan aktifkan verifikasi dua langkah di akun penting seperti email dan perbankan.\n\nJangan mudah mengeklik tautan dari pesan yang tidak dikenal, karena penipuan lewat tautan palsu masih menjadi modus paling umum.', 30],
  ['Business', 'UMKM digital makin tumbuh, penjualan daring jadi andalan',
    'Jumlah pelaku UMKM yang berjualan lewat platform digital terus bertambah. Banyak pelaku usaha mengaku omzet naik setelah memanfaatkan marketplace dan media sosial untuk promosi.\n\nAsosiasi pelaku usaha mendorong pelatihan pengelolaan keuangan dan pemotretan produk agar toko daring lebih menarik bagi pembeli.', 4],
  ['Business', 'Harga kebutuhan pokok relatif stabil menjelang akhir pekan',
    'Pantauan di sejumlah pasar tradisional menunjukkan harga beras, telur, dan minyak goreng cenderung stabil. Pedagang menyebut pasokan dari daerah sentra produksi berjalan lancar.\n\nPemerintah daerah akan terus memantau harga agar tidak terjadi lonjakan mendadak yang membebani masyarakat.', 20],
  ['Sports', 'Timnas gas latihan intensif jelang laga penting pekan depan',
    'Skuad tim nasional menjalani latihan intensif di pemusatan latihan menjelang pertandingan penting pekan depan. Pelatih menekankan kekompakan lini belakang dan efektivitas serangan balik.\n\nSejumlah pemain muda mendapat kesempatan menunjukkan kemampuan, sementara pemain senior diminta menjadi panutan di lapangan.', 1],
  ['Sports', 'Turnamen bulu tangkis antarpelajar digelar, ratusan atlet muda ambil bagian',
    'Ratusan pelajar dari berbagai daerah mengikuti turnamen bulu tangkis tingkat nasional. Selain mencari juara, ajang ini menjadi tempat pemandu bakat mencari atlet berprestasi untuk dibina lebih lanjut.\n\nPanitia berharap kegiatan serupa rutin diadakan agar regenerasi atlet tetap terjaga.', 26],
  ['Politics', 'DPR bahas aturan turunan perlindungan data pribadi',
    'Komisi terkait di DPR mulai membahas rancangan aturan turunan mengenai perlindungan data pribadi. Pembahasan mencakup kewajiban penyelenggara layanan digital dalam mengelola dan mengamankan data pengguna.\n\nKelompok masyarakat sipil meminta proses pembahasan dibuka agar publik dapat memberi masukan.', 6],
  ['Politics', 'Pemda gelar musyawarah rencana pembangunan bersama warga',
    'Pemerintah daerah mengundang tokoh masyarakat, pemuda, dan perwakilan perempuan dalam musyawarah rencana pembangunan. Usulan warga mencakup perbaikan jalan, drainase, dan fasilitas kesehatan.\n\nHasil musyawarah akan menjadi bahan penyusunan anggaran tahun depan.', 40],
  ['Entertainment', 'Festival musik akhir tahun umumkan line-up dan harga tiket',
    'Panitia festival musik tahunan mengumumkan daftar penampil, mulai dari band indie hingga musisi papan atas. Penjualan tiket tahap pertama dibuka dengan harga khusus selama sepekan.\n\nSelain panggung musik, festival juga menghadirkan bazar kuliner dan pameran karya seniman lokal.', 3],
  ['Entertainment', 'Film animasi sineas lokal tembus festival internasional',
    'Sebuah film animasi pendek karya sineas lokal terpilih untuk diputar di festival film internasional. Film berdurasi 12 menit itu bercerita tentang persahabatan anak-anak di kampung pesisir.\n\nSutradara berharap pencapaian ini membuka peluang bagi lebih banyak animator Indonesia untuk berkarya.', 14],
];

const COMMENTS = ['Mantap, semoga makin merata ya!', 'Infonya bermanfaat banget, makasih sudah dibagikan.', 'Ditunggu update selanjutnya 👀', 'Setuju, ini yang kita butuhkan sekarang.', 'Semoga benar-benar terealisasi, bukan cuma wacana.'];

function run({ force = false } = {}) {
  fs.mkdirSync(UPLOADS, { recursive: true });
  const upsertUser = (username, email, password, bio) => {
    let u = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (!u) u = { id: db.prepare('INSERT INTO users (username,email,password,bio) VALUES (?,?,?,?)').run(username, email, bcrypt.hashSync(password, 10), bio).lastInsertRowid };
    return u.id;
  };
  const redaksi = upsertUser('redaksi', 'redaksi@kabarin.id', 'demo1234', 'Tim redaksi Kabarin. Kabar singkat, jelas, dan bisa dipercaya.');
  const fans = ['sari', 'budi', 'nadia'].map((n) => upsertUser(n, `${n}@kabarin.id`, 'demo1234', ''));

  let added = 0;
  NEWS.forEach(([category, title, content, hoursAgo], i) => {
    if (db.prepare('SELECT 1 FROM news WHERE title = ?').get(title)) return;
    const file = `seed-${i + 1}.svg`;
    fs.writeFileSync(path.join(UPLOADS, file), cover(category, i + 3));
    const ts = `-${hoursAgo} hours`;
    const id = db.prepare(`INSERT INTO news (title, content, category, media_url, media_type, views, user_id, created_at, updated_at)
      VALUES (?,?,?,?,'image',?,?, datetime('now', ?), datetime('now', ?))`)
      .run(title, content, category, `/uploads/${file}`, 40 + ((i * 97) % 400), redaksi, ts, ts).lastInsertRowid;
    fans.forEach((f, k) => {
      if ((i + k) % 2 === 0) db.prepare('INSERT OR IGNORE INTO likes (news_id,user_id) VALUES (?,?)').run(id, f);
      if ((i + k) % 4 === 0) db.prepare('INSERT INTO comments (content,news_id,user_id,created_at) VALUES (?,?,?,datetime(\'now\', ?))').run(COMMENTS[(i + k) % COMMENTS.length], id, f, `-${Math.max(1, hoursAgo - 1)} hours`);
    });
    for (let s = 0; s < (i % 4); s++) db.prepare('INSERT INTO shares (news_id) VALUES (?)').run(id);
    added++;
  });
  if (added) console.log(`  ${added} berita contoh ditambahkan. Akun demo: redaksi@kabarin.id / demo1234`);
  return added;
}

module.exports = { run };
if (require.main === module) { run({ force: true }); }
