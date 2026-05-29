// ==========================================
// FUNGSI UTAMA (TANPA PERLU CLIENT ID/SECRET!)
// ==========================================
async function processSpotifyLink() {
    const inputUrl = document.getElementById('searchInput').value.trim();
    const btn = document.getElementById('searchBtn');
    
    if (!inputUrl) return alert("Paste link Spotify dulu!");

    // Setup UI Loading
    btn.disabled = true;
    btn.innerText = "Mencari...";
    document.getElementById('player-section').classList.remove('hidden');
    setStatus("Mengambil data lagu dari Spotify...");

    try {
        // 1. Ambil Metadata Lagu via oEmbed API (Jalur anti-CORS dan tanpa token)
        const trackData = await fetchSpotifyOembed(inputUrl);
        updateTrackInfoUI(trackData);
        
        // 2. Cari Lirik di LRCLIB menggunakan judul dari Spotify
        setStatus("Mencari lirik lagu...");
        const lyricsData = await fetchLyrics(trackData.searchQuery);
        
        if (!lyricsData) {
            setStatus("❌ Lirik tidak ditemukan di database.");
            document.getElementById('text-original').innerText = "Lirik tidak tersedia.";
            btn.disabled = false;
            btn.innerText = "Cari";
            return;
        }

        // Update UI dengan judul & artis asli dari database lirik
        trackData.title = lyricsData.title;
        trackData.artist = lyricsData.artist;
        updateTrackInfoUI(trackData);

        // 3. Terjemahkan dan Deteksi Bahasa
        setStatus("Menerjemahkan lirik...");
        document.getElementById('text-original').innerText = lyricsData.lyrics;
        
        const translateData = await translateAndDetectLang(lyricsData.lyrics);
        updateLyricsUI(translateData);

        setStatus("✅ Selesai!");
    } catch (error) {
        console.error(error);
        setStatus("❌ Terjadi kesalahan: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "Cari";
    }
}

// ==========================================
// HELPER & API CALLS
// ==========================================

function setStatus(text) {
    document.getElementById('status-text').innerText = text;
}

async function fetchSpotifyOembed(url) {
    // Trik memecah URL agar tidak disensor/diubah otomatis oleh sistem chat
    const baseUrl = "https://" + "open.spotify.com" + "/oembed?url=";
    const apiUrl = baseUrl + encodeURIComponent(url);
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) throw new Error("Lagu tidak ditemukan. Pastikan link Spotify benar.");
    const data = await response.json();
    
    // oEmbed mengembalikan "title" (biasanya berisi judul lagu) dan "thumbnail_url"
    let titleStr = data.title;
    // Bersihkan teks ekstra jika Spotify mengembalikan format "Judul - song by Artis"
    titleStr = titleStr.split(" - song")[0]; 
    
    return {
        title: titleStr,
        artist: "Mendeteksi artis...",
        albumArt: data.thumbnail_url || 'https://via.placeholder.com/150',
        searchQuery: titleStr
    };
}

async function fetchLyrics(searchQuery) {
    // Memecah URL LRCLIB
    const baseUrl = "https://" + "lrclib.net" + "/api/search?q=";
    const apiUrl = baseUrl + encodeURIComponent(searchQuery);
    
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    if (data && data.length > 0) {
        // Ambil hasil pencarian lirik yang pertama (paling relevan)
        return {
            lyrics: data[0].plainLyrics,
            title: data[0].trackName,
            artist: data[0].artistName
        };
    }
    return null;
}

async function translateAndDetectLang(text) {
    // Memecah URL Google Translate API
    const baseUrl = "https://" + "translate.googleapis.com" + "/translate_a/single";
    const params = "?client=gtx&sl=auto&tl=id&dt=t&dt=rm&q=" + encodeURIComponent(text);
    const apiUrl = baseUrl + params;
    
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error("Gagal menerjemahkan teks.");
    
    const data = await response.json();
    
    const detectedLang = data[2]; 
    let translatedText = "";
    let pronunciationText = "";

    // Gabungkan tiap baris lirik terjemahan
    if (data[0]) {
        data[0].forEach(item => {
            if (item[0]) translatedText += item[0];
        });
    }

    // Ambil romaji/pelafalan jika ada
    if (data[0]) {
        data[0].forEach(item => {
            if (item[3]) {
                pronunciationText += item[3];
            } else if (item[0] && detectedLang !== 'en' && detectedLang !== 'id' && detectedLang !== 'ms') {
                pronunciationText += "";
            }
        });
    }

    if (!pronunciationText.trim()) {
        pronunciationText = "Pelafalan tidak didukung/tidak diperlukan.";
    }

    return { detectedLang, translatedText, pronunciationText };
}

// ==========================================
// UI UPDATES
// ==========================================
function updateTrackInfoUI(trackData) {
    document.getElementById('track-title').innerText = trackData.title;
    document.getElementById('track-artist').innerText = trackData.artist;
    if (trackData.albumArt) {
        document.getElementById('album-art').src = trackData.albumArt;
    }
}

function updateLyricsUI(data) {
    const colPronunciation = document.getElementById('col-pronunciation');
    const colTranslation = document.getElementById('col-translation');
    const lyricsContainer = document.getElementById('lyrics-container');

    document.getElementById('text-translation').innerText = data.translatedText;
    document.getElementById('text-pronunciation').innerText = data.pronunciationText;

    // Logika: Sembunyikan kolom sesuai bahasa
    if (data.detectedLang === 'id' || data.detectedLang === 'ms') {
        colPronunciation.classList.add('hidden');
        colTranslation.classList.add('hidden');
        lyricsContainer.style.gridTemplateColumns = "1fr"; 
    } else if (data.detectedLang === 'en') {
        // Bahasa Inggris tidak butuh pelafalan
        colPronunciation.classList.add('hidden');
        colTranslation.classList.remove('hidden');
        lyricsContainer.style.gridTemplateColumns = "repeat(2, 1fr)";
    } else {
        // Tampilkan 3 kolom penuh untuk Jepang, Korea, dll
        colPronunciation.classList.remove('hidden');
        colTranslation.classList.remove('hidden');
        lyricsContainer.style.gridTemplateColumns = "repeat(3, 1fr)";
    }
}