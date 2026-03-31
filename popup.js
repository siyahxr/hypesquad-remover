document.addEventListener('DOMContentLoaded', () => {
    const statusDiv = document.getElementById('status');
    const mainContainer = document.getElementById('main-container');
    const loader = document.getElementById('loader');
    const uiTitle = document.getElementById('ui-title');
    const removeBtn = document.getElementById('remove');
    const starhubLink = document.getElementById('starhub-link');
    const tokenInput = document.getElementById('tokenInput');
    const fallbackBox = document.getElementById('token-fallback');
    const manualToggle = document.getElementById('manual-toggle');

    // Language Pack
    const langData = {
        tr: {
            title: "Hypesquad Panel",
            remove: "ROZETİ KALDIR",
            success: "Başarılı! Discord'u yenileyin.",
            error_401: "Yetkisiz! Token geçersiz.",
            no_discord: "Discord sekmesi bulunamadı!",
            error_gen: "Hata oluştu: ",
            conn_issue: "Bağlantı sorunu!",
            processing: "İşleniyor...",
            manual_msg: "Manuel Token Girdi",
            manual_hint: "MANUEL TOKEN GİRİN (FALLBACK)",
            rate_limit: "Yavaşla! Bekle: "
        },
        en: {
            title: "Hypesquad Panel",
            remove: "REMOVE BADGE",
            success: "Success! Refresh Discord.",
            error_401: "Unauthorized! Invalid token.",
            no_discord: "Discord tab not found!",
            error_gen: "Error occurred: ",
            conn_issue: "Connection issue!",
            processing: "Processing...",
            manual_msg: "Manual Token Entry",
            manual_hint: "ENTER MANUAL TOKEN (FALLBACK)",
            rate_limit: "Slow down! Wait: "
        }
    };

    let currentLang = 'tr';
    let isCooldown = false;
    let cooldownTimer = 0;

    // UI Initialization
    setTimeout(() => {
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
                mainContainer.classList.add('visible');
            }, 500);
        }
    }, 1500);

    // Language Logic
    const trBtn = document.getElementById('tr');
    const enBtn = document.getElementById('en');

    const updateLanguage = (lang) => {
        currentLang = lang;
        trBtn.classList.toggle('active', lang === 'tr');
        enBtn.classList.toggle('active', lang === 'en');
        uiTitle.textContent = langData[lang].title;
        removeBtn.textContent = langData[lang].remove;
        manualToggle.textContent = langData[lang].manual_msg;
        tokenInput.placeholder = langData[lang].manual_hint;
        chrome.storage.local.set({ lang: lang });
    };

    trBtn.addEventListener('click', () => updateLanguage('tr'));
    enBtn.addEventListener('click', () => updateLanguage('en'));

    // Persistent State
    chrome.storage.local.get(['lang', 'savedToken'], (result) => {
        if (result.lang) updateLanguage(result.lang);
        if (result.savedToken) tokenInput.value = result.savedToken;
    });

    starhubLink.addEventListener('click', () => chrome.tabs.create({ url: 'https://discord.gg/starhub' }));
    
    manualToggle.addEventListener('click', () => {
        fallbackBox.style.display = fallbackBox.style.display === 'block' ? 'none' : 'block';
    });

    const showStatus = (messageKey, isError = false, extra = "") => {
        if (!statusDiv) return;
        const msg = langData[currentLang][messageKey] || messageKey;
        statusDiv.textContent = msg + extra;
        statusDiv.style.color = isError ? '#ed4245' : '#43b581';
        if (messageKey !== 'processing' && messageKey !== 'rate_limit') {
            setTimeout(() => { statusDiv.textContent = ''; }, 4000);
        }
    };

    // Deep Scanning Token Extraction
    const getDiscordToken = async () => {
        if (tokenInput.value.trim().length > 20) {
            return tokenInput.value.trim();
        }

        return new Promise((resolve) => {
            if (!chrome.tabs || !chrome.scripting) return resolve(null);

            chrome.windows.getAll({ populate: true }, (windows) => {
                let discordTab = null;
                for (const win of windows) {
                    for (const tab of win.tabs) {
                        const url = tab.url || "";
                        const title = tab.title || "";
                        if (url.includes("discord.com") || url.includes("discordapp.com") || title.toLowerCase().includes("discord")) {
                            discordTab = tab;
                            break;
                        }
                    }
                    if (discordTab) break;
                }

                if (!discordTab) return resolve(null);

                chrome.scripting.executeScript({
                    target: { tabId: discordTab.id },
                    world: "MAIN",
                    func: () => {
                        try {
                            let extractedToken = null;
                            const wp = window.webpackChunkdiscord_app || [];
                            wp.push([
                                [Math.random().toString()],
                                {},
                                (req) => {
                                    for (const key in req.c) {
                                        const mod = req.c[key].exports;
                                        if (mod && mod.default && mod.default.getToken) {
                                            extractedToken = mod.default.getToken();
                                        } else if (mod && mod.getToken) {
                                            extractedToken = mod.getToken();
                                        }
                                    }
                                }
                            ]);
                            if (extractedToken) return extractedToken;
                            return localStorage.getItem('token')?.replace(/"/g, '');
                        } catch (e) { return null; }
                    }
                }, (results) => {
                    if (results && results[0] && results[0].result) {
                        chrome.storage.local.set({ savedToken: results[0].result });
                        resolve(results[0].result);
                    } else {
                        resolve(null);
                    }
                });
            });

            setTimeout(() => resolve(null), 8000);
        });
    };

    const updateHype = async (houseID) => {
        if (isCooldown) {
            showStatus("rate_limit", true, cooldownTimer + "s");
            return;
        }

        showStatus("processing");
        try {
            const token = await getDiscordToken();

            if (!token) {
                showStatus("no_discord", true);
                fallbackBox.style.display = 'block';
                return;
            }

            const method = houseID === 0 ? 'DELETE' : 'POST';
            const body = houseID === 0 ? null : JSON.stringify({ house_id: houseID });

            const res = await fetch('https://discord.com/api/v9/hypesquad/online', {
                method: method,
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': token 
                },
                body: body
            });

            if (res.ok) {
                showStatus("success");
                startCooldown(5); // 5 sec rate limit
            } else if (res.status === 401) {
                showStatus("error_401", true);
                fallbackBox.style.display = 'block';
            } else if (res.status === 429) {
                const data = await res.json();
                const retryAfter = data.retry_after || 30;
                showStatus("rate_limit", true, Math.ceil(retryAfter) + "s");
                startCooldown(Math.ceil(retryAfter));
            } else {
                showStatus("error_gen", true, res.status);
            }
        } catch (err) {
            showStatus("conn_issue", true);
        }
    };

    function startCooldown(seconds) {
        isCooldown = true;
        cooldownTimer = seconds;
        const interval = setInterval(() => {
            cooldownTimer--;
            if (cooldownTimer <= 0) {
                clearInterval(interval);
                isCooldown = false;
                statusDiv.textContent = '';
            } else if (statusDiv.textContent.includes(langData[currentLang].rate_limit)) {
                statusDiv.textContent = langData[currentLang].rate_limit + cooldownTimer + "s";
            }
        }, 1000);
    }

    document.getElementById('bravery').addEventListener('click', () => updateHype(1));
    document.getElementById('brilliance').addEventListener('click', () => updateHype(2));
    document.getElementById('balance').addEventListener('click', () => updateHype(3));
    document.getElementById('remove').addEventListener('click', () => updateHype(0));
});