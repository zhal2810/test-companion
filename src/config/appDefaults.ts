// Isi data kamu di sini biar tidak perlu input di Settings tiap buka app
// Aman untuk pemakaian PRIVATE. JANGAN commit token asli ke repo public!

export const DEFAULT_TOKEN = "";
export const DEFAULT_USERNAME = ""; // kosongin aja kalau cuma butuh token
export const DEFAULT_USER_ID = ""; // kosongin aja kalau cuma butuh token

// Jika DEFAULT_TOKEN diisi, akan dipakai otomatis jika localStorage kosong.
// Prioritas: localStorage > DEFAULT_TOKEN > import.meta.env.VITE_WARERA_TOKEN
