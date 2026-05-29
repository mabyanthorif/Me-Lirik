// ==========================================
// FUNGSI UTAMA
// ==========================================
async function processSpotifyLink() {
    const inputVal = document.getElementById('searchInput').value.trim();
    const btn = document.getElementById('searchBtn');
    
    if (!inputVal) return alert("Masukkan link Spotify atau ketik judul lagu/artis!");

    btn.disabled = true;
    btn.innerText = "Mencari...";
    document.getElementById('player-section').classList.remove('hidden');
    document.getElementById('lyrics-container').innerHTML = '';

    try {
        let trackData = { title: "", artist: "", albumArt: "https://via.placeholder.com/150" };
        let lyricsData = null;

        const isLink = inputVal.includes('spotify.com') || inputVal.startsWith('http');

        if (isLink) {
            // ==========================================
            // JALUR 1: PENCARIAN VIA LINK SPOTIFY
            // ==========================================
            setStatus("Mengambil data resmi dari Spotify...");
            trackData = await fetchSpotifyOembed(inputVal);
            updateTrackInfoUI(trackData);

            if (!trackData.artist) {
                setStatus(`Mencari daftar lagu "${trackData.title}" di database...`);
                document.getElementById('player-section').classList.add('hidden'); // Umpetin player
                
                const searchRes = await fetch("https://lrclib.net/api/search?q=" + encodeURIComponent(trackData.title));
                const searchData = await searchRes.json();
                const tracksWithLyrics = (searchData || []).filter(track => track.plainLyrics);
                
                const customMsg = `Lagu <b style="color: #1db954;">"${trackData.title}"</b> ditemukan dari link, tapi Spotify menyembunyikan nama artisnya.`;
                const selectedTrack = await askUserToSelectTrack(trackData.title, tracksWithLyrics, customMsg);
                
                if (!selectedTrack) throw new Error("Pencarian dibatalkan.");

                if (selectedTrack.isManual) {
                    setStatus(`Mencari lirik lagu dari artis "${selectedTrack.artistName}"...`);
                    lyricsData = await fetchLyrics(selectedTrack.trackName, selectedTrack.artistName);
                } else {
                    lyricsData = { lyrics: selectedTrack.plainLyrics, title: selectedTrack.trackName, artist: selectedTrack.artistName };
                }
                document.getElementById('player-section').classList.remove('hidden'); 
            } else {
                setStatus("Mencari lirik lagu di database...");
                lyricsData = await fetchLyrics(trackData.title, trackData.artist);
            }
        } else {
            // ==========================================
            // JALUR 2: PENCARIAN TEKS BEBAS (Judul / Artis)
            // ==========================================
            setStatus(`Mencari "${inputVal}" di database...`);
            document.getElementById('player-section').classList.add('hidden'); // Umpetin player

            const searchRes = await fetch("https://lrclib.net/api/search?q=" + encodeURIComponent(inputVal));
            const searchData = await searchRes.json();
            const tracksWithLyrics = (searchData || []).filter(track => track.plainLyrics);

            const customMsg = `Hasil pencarian untuk <b style="color: #1db954;">"${inputVal}"</b>:`;
            const selectedTrack = await askUserToSelectTrack(inputVal, tracksWithLyrics, customMsg);

            if (!selectedTrack) throw new Error("Pencarian dibatalkan.");

            if (selectedTrack.isManual) {
                setStatus(`Mencari lirik lagu dari artis "${selectedTrack.artistName}"...`);
                lyricsData = await fetchLyrics(selectedTrack.trackName, selectedTrack.artistName);
            } else {
                lyricsData = { lyrics: selectedTrack.plainLyrics, title: selectedTrack.trackName, artist: selectedTrack.artistName };
            }
            
            trackData.title = lyricsData ? lyricsData.title : selectedTrack.trackName;
            trackData.artist = lyricsData ? lyricsData.artist : selectedTrack.artistName;

            try {
                const itunesRes = await fetch("https://itunes.apple.com/search?term=" + encodeURIComponent(trackData.title + " " + trackData.artist) + "&entity=song&limit=1");
                const itunesData = await itunesRes.json();
                if (itunesData.results && itunesData.results.length > 0) {
                    trackData.albumArt = itunesData.results[0].artworkUrl100.replace('100x100', '300x300'); // Perbesar gambar
                }
            } catch(e) { console.log("Gagal memuat cover album"); }

            document.getElementById('player-section').classList.remove('hidden'); 
        }
        
        // Final Pengecekan Lirik
        if (!lyricsData || !lyricsData.lyrics) {
            setStatus("❌ Lirik tidak ditemukan di database.");
            document.getElementById('lyrics-container').innerHTML = '<p style="color:white; text-align:center;">Lirik tidak tersedia untuk lagu/versi ini di database.</p>';
            btn.disabled = false;
            btn.innerText = "Cari";
            return;
        }

        trackData.title = lyricsData.title;
        trackData.artist = lyricsData.artist;
        updateTrackInfoUI(trackData);

        // Terjemahkan dan Deteksi Bahasa
        setStatus("Menerjemahkan & memproses pelafalan...");
        const translateData = await translateAndDetectLang(lyricsData.lyrics);
        
        // Tampilkan lirik
        updateLyricsUI(translateData, lyricsData.lyrics);

        setStatus("✅ Selesai!");
    } catch (error) {
        console.error(error);
        setStatus("❌ " + error.message);
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
    const apiUrl = "https://open.spotify.com/oembed?url=" + encodeURIComponent(url);
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error("Lagu tidak valid. Pastikan link dari Spotify.");
    const data = await response.json();
    
    let fullTitle = data.title || "";
    let titleStr = fullTitle;
    let artistStr = "";

    if (fullTitle.includes(" - song and lyrics by ")) {
        const parts = fullTitle.split(" - song and lyrics by ");
        titleStr = parts[0];
        artistStr = parts[1];
    } else if (fullTitle.includes(" - song by ")) {
        const parts = fullTitle.split(" - song by ");
        titleStr = parts[0];
        artistStr = parts[1];
    } else {
        titleStr = fullTitle.split(" - ")[0];
    }

    titleStr = titleStr.replace(/\(feat\..*?\)/ig, "").trim();
    if (artistStr && artistStr.includes(",")) artistStr = artistStr.split(",")[0].trim();
    else if (artistStr && artistStr.includes("&")) artistStr = artistStr.split("&")[0].trim();

    return { title: titleStr, artist: artistStr ? artistStr.trim() : "", albumArt: data.thumbnail_url || 'https://via.placeholder.com/150' };
}

// ==========================================
// UI CUSTOM LIST LAGU (Universal)
// ==========================================
function askUserToSelectTrack(title, tracks, customMessage) {
    return new Promise((resolve) => {
        let promptDiv = document.getElementById('custom-track-selector');
        
        if (!promptDiv) {
            promptDiv = document.createElement('div');
            promptDiv.id = 'custom-track-selector';
            promptDiv.style.cssText = "margin: 20px auto; max-width: 500px; background: #282828; padding: 20px; border-radius: 12px; text-align: center; box-shadow: 0 8px 16px rgba(0,0,0,0.5);";
            
            const playerSection = document.getElementById('player-section');
            playerSection.parentNode.insertBefore(promptDiv, playerSection);
        }

        // Tampilan 1: Mode List (Default)
        let html = `
            <div id="prompt-state-list">
                <p style="color: white; margin: 0 0 10px 0; font-size: 14px; line-height: 1.5;">
                    ${customMessage}
                </p>
        `;

        if (tracks.length > 0) {
            html += `<p style="color: #b3b3b3; font-size: 13px; margin-bottom: 15px;">Silakan pilih versi lagu yang benar di bawah ini:</p>`;
            html += `<div id="track-list-container" style="max-height: 200px; overflow-y: auto; text-align: left; background: #121212; border-radius: 8px; padding: 10px; margin-bottom: 20px;">`;
            
            tracks.forEach((track, index) => {
                html += `
                    <div class="track-option" data-index="${index}" style="padding: 12px; border-bottom: 1px solid #333; cursor: pointer; transition: background 0.2s; border-radius: 6px;">
                        <div style="color: white; font-weight: bold; font-size: 14px; margin-bottom: 4px;">${track.trackName}</div>
                        <div style="color: #b3b3b3; font-size: 12px;">👤 ${track.artistName} &nbsp;•&nbsp; 💿 ${track.albumName || 'Single'}</div>
                    </div>
                `;
            });
            html += `</div>`;
        } else {
            html += `<p style="color: #ff4d4d; font-size: 13px; margin-bottom: 20px;">Maaf, tidak ada hasil di list otomatis.</p>`;
        }

        html += `
                <div style="display: flex; justify-content: center; gap: 10px;">
                    <button id="btn-show-manual" style="background: #1db954; color: white; border: none; padding: 10px 15px; border-radius: 25px; cursor: pointer; font-weight: bold; transition: 0.2s; font-size: 13px;">Cari Manual dengan Artis</button>
                    <button id="prompt-cancel-btn" style="background: #535353; color: white; border: none; padding: 10px 20px; border-radius: 25px; cursor: pointer; font-weight: bold; transition: 0.2s; font-size: 13px;">Batalkan</button>
                </div>
            </div>
        `;

        // Tampilan 2: Mode Manual
        html += `
            <div id="prompt-state-manual" style="display: none;">
                <p style="color: white; margin: 0 0 15px 0; font-size: 14px; line-height: 1.5;">
                    Ketik nama artis untuk memperjelas pencarian <b style="color: #1db954;">"${title}"</b>:
                </p>
                <input type="text" id="prompt-artist-input" placeholder="Contoh: Radwimps" style="padding: 12px; width: 80%; border-radius: 20px; border: none; outline: none; text-align: center; margin-bottom: 20px; font-size: 14px; background: #fff; color: #000;">
                <div style="display: flex; justify-content: center; gap: 10px;">
                    <button id="prompt-manual-search-btn" style="background: #1db954; color: white; border: none; padding: 10px 20px; border-radius: 25px; cursor: pointer; font-weight: bold; transition: 0.2s; font-size: 13px;">Cari Manual</button>
                    <button id="prompt-back-btn" style="background: #535353; color: white; border: none; padding: 10px 20px; border-radius: 25px; cursor: pointer; font-weight: bold; transition: 0.2s; font-size: 13px;">Kembali ke List</button>
                </div>
            </div>
        `;

        promptDiv.innerHTML = html;
        promptDiv.style.display = 'block';

        const cleanup = () => { promptDiv.style.display = 'none'; };

        const stateList = document.getElementById('prompt-state-list');
        const stateManual = document.getElementById('prompt-state-manual');
        const btnShowManual = document.getElementById('btn-show-manual');
        const btnCancel = document.getElementById('prompt-cancel-btn');
        const manualInput = document.getElementById('prompt-artist-input');
        const btnManualSearch = document.getElementById('prompt-manual-search-btn');
        const btnBack = document.getElementById('prompt-back-btn');

        if (tracks.length > 0) {
            const trackElements = promptDiv.querySelectorAll('.track-option');
            trackElements.forEach(el => {
                el.onmouseover = () => el.style.background = '#333';
                el.onmouseout = () => el.style.background = 'transparent';
                el.onclick = () => {
                    const selectedIndex = el.getAttribute('data-index');
                    cleanup();
                    resolve(tracks[selectedIndex]); 
                };
            });
        }

        btnShowManual.onclick = () => { stateList.style.display = 'none'; stateManual.style.display = 'block'; manualInput.focus(); };
        btnBack.onclick = () => { stateManual.style.display = 'none'; stateList.style.display = 'block'; };
        btnCancel.onclick = () => { cleanup(); resolve(null); };

        const doManualSearch = () => {
            const typedArtist = manualInput.value.trim();
            if (typedArtist) {
                cleanup();
                resolve({ trackName: title, artistName: typedArtist, isManual: true });
            } else {
                alert("Harap ketik nama artisnya terlebih dahulu!");
                manualInput.focus();
            }
        };

        btnManualSearch.onclick = doManualSearch;
        manualInput.onkeypress = (e) => { if (e.key === 'Enter') doManualSearch(); };
    });
}

// ==========================================
// LOGIC PENCARIAN & TRANSLATE
// ==========================================

async function fetchLyrics(title, artist) {
    const searchQuery = title + " " + artist;
    const baseUrl = "https://lrclib.net/api/search?q=";
    const apiUrl = baseUrl + encodeURIComponent(searchQuery);
    
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    if (data && data.length > 0) {
        const tracksWithLyrics = data.filter(track => track.plainLyrics);
        
        if (tracksWithLyrics.length > 0) {
            const targetArtist = artist.toLowerCase();
            const targetTitle = title.toLowerCase();
            
            let exactMatch = tracksWithLyrics.find(track => {
                if (!track.artistName || !track.trackName) return false;
                const dbArtist = track.artistName.toLowerCase();
                const dbTitle = track.trackName.toLowerCase();
                return (dbArtist.includes(targetArtist) || targetArtist.includes(dbArtist)) && (dbTitle.includes(targetTitle) || targetTitle.includes(dbTitle));
            });

            if (exactMatch) {
                return { lyrics: exactMatch.plainLyrics, title: exactMatch.trackName, artist: exactMatch.artistName };
            }
        }
    }
    return null;
}

async function translateAndDetectLang(text) {
    const safeText = text.replace(/\n/g, ' | ');
    const baseUrl = "https://translate.googleapis.com/translate_a/single";
    const params = "?client=gtx&sl=auto&tl=id&dt=t&dt=rm&q=" + encodeURIComponent(safeText);
    const apiUrl = baseUrl + params;
    
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error("Gagal menerjemahkan teks.");
    
    const data = await response.json();
    const detectedLang = data[2]; 
    let translatedText = "";
    let pronunciationText = "";

    if (data[0]) {
        data[0].forEach(item => { if (item[0]) translatedText += item[0]; });
        const globalPronunciation = data[0].find(item => item[0] === null && item[3] != null);
        if (globalPronunciation) {
            pronunciationText = globalPronunciation[3];
        } else {
            data[0].forEach(item => { if (item[0] !== null) pronunciationText += (item[3] || item[2] || item[1] || ""); });
        }
    }

    translatedText = translatedText.replace(/ \| /g, '\n').replace(/\|/g, '\n');
    pronunciationText = pronunciationText.replace(/ \| /g, '\n').replace(/\|/g, '\n');

    if (!pronunciationText.trim() || pronunciationText === translatedText) pronunciationText = text; 

    return { detectedLang, translatedText, pronunciationText };
}

// ==========================================
// UI UPDATES
// ==========================================

function updateTrackInfoUI(trackData) {
    document.getElementById('track-title').innerText = trackData.title;
    document.getElementById('track-artist').innerText = trackData.artist || "Mendeteksi artis...";
    if (trackData.albumArt) document.getElementById('album-art').src = trackData.albumArt;
}

function updateLyricsUI(data, originalText) {
    const lyricsContainer = document.getElementById('lyrics-container');
    lyricsContainer.innerHTML = ''; 

    const originalLines = originalText.split('\n');
    const translatedLines = data.translatedText.split('\n');
    const romajiLines = data.pronunciationText.split('\n');

    for (let i = 0; i < originalLines.length; i++) {
        const origText = originalLines[i].trim();
        if (!origText) {
            lyricsContainer.appendChild(document.createElement('br'));
            continue;
        }

        const block = document.createElement('div');
        block.className = 'lyric-block';

        const origDiv = document.createElement('div');
        origDiv.className = 'lyric-original';
        origDiv.innerText = origText;
        block.appendChild(origDiv);

        let romajiText = romajiLines[i] ? romajiLines[i].trim() : "";
        if (data.detectedLang !== 'id' && data.detectedLang !== 'ms' && data.detectedLang !== 'en') {
            if (romajiText && romajiText.toLowerCase() !== origText.toLowerCase()) {
                const romDiv = document.createElement('div');
                romDiv.className = 'lyric-romaji';
                romDiv.innerText = romajiText;
                block.appendChild(romDiv);
            }
        }

        let transText = translatedLines[i] ? translatedLines[i].trim() : "";
        if (data.detectedLang !== 'id' && data.detectedLang !== 'ms') {
            if (transText && transText.toLowerCase() !== origText.toLowerCase()) {
                const transDiv = document.createElement('div');
                transDiv.className = 'lyric-translation';
                transDiv.innerText = transText;
                block.appendChild(transDiv);
            }
        }

        lyricsContainer.appendChild(block);
    }
}
