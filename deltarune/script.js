    const REPO_BASE = "https://cdn.jsdelivr.net/gh/ByAlvaro19/deltarune/";
    const sndMenuMove = new Audio(REPO_BASE + 'audios/snd_menumove.mp3');
    const sndSelect = new Audio(REPO_BASE + 'audios/snd_select.mp3');

    function playMove() {
      sndMenuMove.currentTime = 0;
      sndMenuMove.play().catch(() => {});
    }

    function playSelect() {
      sndSelect.currentTime = 0;
      sndSelect.play().catch(() => {});
    }

    const DB_NAME = '/_savedata';
    const STORE_NAME = 'FILE_DATA';

    function getDB() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME);
        request.onupgradeneeded = (e) => {
          e.target.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
      });
    }

    async function getAllSaves() {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.openCursor();
        const data = {};
        request.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            data[cursor.key] = cursor.value;
            cursor.continue();
          } else {
            resolve(data);
          }
        };
        request.onerror = (e) => reject(e.target.error);
      });
    }

    async function setSaveItem(key, textContent) {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        
        const uint8Contents = new TextEncoder().encode(textContent);
        const emscriptenFileObj = {
          timestamp: new Date(),
          mode: 33206, 
          contents: uint8Contents
        };

        tx.objectStore(STORE_NAME).put(emscriptenFileObj, key);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });
    }

    async function exportSave() {
      playSelect();
      const zip = new JSZip();
      let hasData = false;

      try {
        const allData = await getAllSaves();
        for (const key in allData) {
          if (key.includes('filech') || key.includes('dr_') || key.includes('_savedata')) {
            const cleanKey = key.replace(/^\/_savedata\//, '');
            
            let rawText = "";
            if (allData[key] && allData[key].contents) {
              rawText = new TextDecoder().decode(allData[key].contents);
            } else if (typeof allData[key] === 'string') {
              rawText = allData[key];
            }

            zip.file(cleanKey, rawText);
            hasData = true;
          }
        }

        if (!hasData) {
          alert('No save data found in the engine database!');
          return;
        }

        zip.generateAsync({type:"blob"}).then(function(content) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(content);
          a.download = "deltarune_saves.zip";
          a.click();
        });
      } catch (err) {
        alert('Failed to export saves.');
        console.error(err);
      }
    }

    function importSave(input) {
      playSelect();
      const file = input.files[0];
      if (!file) return;

      const zip = new JSZip();
      zip.loadAsync(file).then(function(jsZipInstance) {
        const promises = [];
        
        jsZipInstance.forEach(function (relativePath, zipEntry) {
          if (!zipEntry.dir) {
            const p = zipEntry.async("string").then(function (content) {
              let fullKey = zipEntry.name;
              if (!fullKey.startsWith('/_savedata/')) {
                fullKey = '/_savedata/' + fullKey;
              }
              return setSaveItem(fullKey, content);
            });
            promises.push(p);
          }
        });

        if (promises.length === 0) {
          throw new Error("Zip file is empty!");
        }

        return Promise.all(promises);
      }).then(function() {
        alert('Saves imported successfully! Reloading...');
        window.location.reload();
      }).catch(err => {
        alert("Error importing zip file.");
        console.error(err);
      });
    }

    document.querySelectorAll('.row, .disabled-row').forEach(row => {
      row.addEventListener('click', () => {
        playSelect();
      });
    });

    let gamestarted = false;
    let useMobileControls = false;
    
    function toggleMobileHardware() {
      playSelect();
      useMobileControls = !useMobileControls;
      document.getElementById('mobile-controls-status-text').textContent = "Mobile controls: " + (useMobileControls ? "ON" : "OFF");
      localStorage.setItem('deltarune-mobile-toggle', useMobileControls ? 'true' : 'false');
      applyConfig();
    }
    
    const frame = document.getElementById('game-frame');
    const hud = document.getElementById('hud-layer');
    const STORAGE_KEY = 'deltarune-v17-stable';
    let isEditing = false;
    let config = { opacity: 1, scale: 1.3, positions: {} };

    const keyMap = { 'ArrowUp': 38, 'ArrowDown': 40, 'ArrowLeft': 37, 'ArrowRight': 39, 'z': 90, 'x': 88, 'c': 67 };
    const activeKeys = new Set();

    function updateKey(key, isDown) {
        if (isEditing) return;
        if (isDown && !activeKeys.has(key)) {
            activeKeys.add(key);
            frame.contentWindow.postMessage({ type: 'keydown', key, keyCode: keyMap[key] }, '*');
        } else if (!isDown && activeKeys.has(key)) {
            activeKeys.delete(key);
            frame.contentWindow.postMessage({ type: 'keyup', key, keyCode: keyMap[key] }, '*');
        }
    }

    const dpadZone = document.getElementById('dpad-touch-zone');
    let isMouseDownOnDpad = false;

    function processDpad(clientX, clientY) {
        if (isEditing) return;
        const rect = dpadZone.getBoundingClientRect();
        const dx = clientX - (rect.left + rect.width / 2);
        const dy = clientY - (rect.top + rect.height / 2);
        const dist = Math.sqrt(dx*dx + dy*dy);
        const newKeys = new Set();
        if (dist > 15) {
            let angle = Math.atan2(dy, dx) * 180 / Math.PI;
            if (angle < 0) angle += 360;
            const buffer = 28;
            if (angle > 270 - buffer && angle < 270 + buffer) newKeys.add('ArrowUp');
            else if (angle > 90 - buffer && angle < 90 + buffer) newKeys.add('ArrowDown');
            else if (angle > 180 - buffer && angle < 180 + buffer) newKeys.add('ArrowLeft');
            else if (angle < buffer || angle > 360 - buffer) newKeys.add('ArrowRight');
            else {
                if (dy < 0) newKeys.add('ArrowUp'); if (dy > 0) newKeys.add('ArrowDown');
                if (dx < 0) newKeys.add('ArrowLeft'); if (dx > 0) newKeys.add('ArrowRight');
            }
        }
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].forEach(k => updateKey(k, newKeys.has(k)));
    }

    dpadZone.addEventListener('touchstart', e => processDpad(e.touches[0].clientX, e.touches[0].clientY), {passive:false});
    dpadZone.addEventListener('touchmove', e => { e.preventDefault(); processDpad(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
    dpadZone.addEventListener('touchend', () => ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].forEach(k => updateKey(k, false)));

    dpadZone.addEventListener('mousedown', e => { isMouseDownOnDpad = true; processDpad(e.clientX, e.clientY); });
    window.addEventListener('mousemove', e => { if (isMouseDownOnDpad) processDpad(e.clientX, e.clientY); });
    window.addEventListener('mouseup', () => { if (isMouseDownOnDpad) { isMouseDownOnDpad = false; ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].forEach(k => updateKey(k, false)); } });

    document.querySelectorAll('.game-btn').forEach(btn => {
        const key = btn.getAttribute('data-key');
        const start = e => { e.preventDefault(); updateKey(key, true); btn.classList.add('active'); };
        const end = e => { e.preventDefault(); updateKey(key, false); btn.classList.remove('active'); };
        btn.addEventListener('touchstart', start); btn.addEventListener('touchend', end);
        btn.addEventListener('mousedown', start); btn.addEventListener('mouseup', end);
    });

    let activeItem = null;
    const startDrag = (el, x, y) => { if(isEditing) { activeItem = el; el.style.cursor = 'grabbing'; } };
    const moveDrag = (x, y) => {
        if (!activeItem || !isEditing) return;
        activeItem.style.left = ((x / window.innerWidth) * 100).toFixed(2) + '%';
        activeItem.style.top = ((y / window.innerHeight) * 100).toFixed(2) + '%';
    };

    document.querySelectorAll('.draggable').forEach(el => {
        el.onmousedown = e => startDrag(el, e.clientX, e.clientY);
        el.ontouchstart = e => startDrag(el, e.touches[0].clientX, e.touches[0].clientY);
    });
    window.addEventListener('mousemove', e => moveDrag(e.clientX, e.clientY));
    window.addEventListener('touchmove', e => moveDrag(e.touches[0].clientX, e.touches[0].clientY));
    window.addEventListener('mouseup', () => { if(activeItem) activeItem.style.cursor = 'grab'; activeItem = null; });
    window.addEventListener('touchend', () => { if(activeItem) activeItem.style.cursor = 'grab'; activeItem = null; });

    function applyConfig() {
        if(useMobileControls && gamestarted) {
             hud.style.display = 'block';
             hud.style.opacity = config.opacity;
             document.getElementById('settings-bar').style.display = 'flex';
        } else {
             hud.style.display = 'none';
             document.getElementById('settings-bar').style.display = 'none';
             document.getElementById('settings-panel').style.display = 'none';
        }
        
        document.documentElement.style.setProperty('--ctrl-scale', config.scale);
        Object.entries(config.positions || {}).forEach(([id, pos]) => {
            const el = document.querySelector(`[data-save-id="${id}"]`);
            if(el && pos && pos.x && pos.y) { el.style.left = pos.x; el.style.top = pos.y; }
        });
    }

    document.getElementById('settings-toggle').onclick = () => {
        const p = document.getElementById('settings-panel');
        if (p.style.display === 'block') {
            p.style.display = 'none';
            isEditing = false;
            document.body.classList.remove('edit-mode');
            document.querySelectorAll('.draggable').forEach(el => {
                if(!config.positions) config.positions = {};
                config.positions[el.getAttribute('data-save-id')] = { x: el.style.left, y: el.style.top };
            });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        } else {
            p.style.display = 'block';
            isEditing = true;
            document.body.classList.add('edit-mode');
        }
        applyConfig();
    };

    document.getElementById('opacity-slider').oninput = e => { config.opacity = e.target.value; applyConfig(); };
    document.getElementById('size-slider').oninput = e => { config.scale = e.target.value; applyConfig(); };
    
    document.getElementById('reset-pos').onclick = () => {
        config = { opacity: 1, scale: 1.3, positions: {} };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        
        document.getElementById('opacity-slider').value = 1;
        document.getElementById('size-slider').value = 1.3;
        
        document.querySelectorAll('.draggable').forEach(el => {
            el.style.left = '';
            el.style.top = '';
        });
        
        applyConfig();
    };

    function injectAndLoad(htmlText) {
        const receiver = `<script>
            const r = () => { 
                window.dispatchEvent(new Event('resize'));
                const canvas = document.querySelector('canvas');
                if(canvas) { canvas.style.width = '100vw'; canvas.style.height = '100vh'; }
            };
            let count = 0;
            const interval = setInterval(() => { r(); if(count++ > 30) clearInterval(interval); }, 100);
            window.addEventListener('message', e => {
                const k = new KeyboardEvent(e.data.type, { key: e.data.key, keyCode: e.data.keyCode, bubbles: true });
                window.dispatchEvent(k); document.dispatchEvent(k);
            });
        <\/script>`;
        const blob = new Blob([htmlText.replace('<head>', '<head>' + receiver)], { type: 'text/html' });
        frame.src = URL.createObjectURL(blob);
        document.getElementById('loader-screen').style.display = 'none';
    }

    function loadChapter(chapter) {
      playSelect();
      gamestarted = true; 
      document.removeEventListener('keydown', handleMenuNavigation); 
      
      document.getElementById('main-menu-ui').style.display = 'none';
      document.getElementById('loader-screen').style.display = 'flex';
      frame.style.display = 'block';
      applyConfig();
      
      const chapterPath = `${REPO_BASE}chapter${chapter}/`;
      
      fetch(`${chapterPath}index.html`).then(res => {
        if (!res.ok) {
          throw new Error(`Failed to load ${chapterPath}index.html`);
        }
        return res.text();
      }).then(html => {
         injectAndLoad(html);
      }).catch(error => {
        console.error(error);
        frame.src = `${chapterPath}index.html`;
        document.getElementById('loader-screen').style.display = 'none';
      });
    }

    document.querySelectorAll('.row').forEach(row => {
      row.addEventListener('mouseenter', () => {
        if (!gamestarted) {
          playMove();
          if (selectedChapter !== null) {
            const rows = document.querySelectorAll('.row');
            if(rows[selectedChapter]) rows[selectedChapter].classList.remove("selected");
          }
        }
      });
    });
    
    let selectedChapter = null;
    
    function handleMenuNavigation(event) {
      if (gamestarted) return;
      const rows = document.querySelectorAll('.row');
      if (rows.length === 0) return;

      if (event.key === 'ArrowUp') {
        playMove();
        if (selectedChapter === null) {
          selectedChapter = 0;
          rows[0].classList.add("selected");
        } else {
          if(rows[selectedChapter]) rows[selectedChapter].classList.remove("selected");
          selectedChapter--;
          if (selectedChapter < 0) {
            selectedChapter = rows.length - 1;
          }
          if(rows[selectedChapter]) rows[selectedChapter].classList.add("selected");
        }
      } else if (event.key === 'ArrowDown') {
        playMove();
        if (selectedChapter === null) {
          selectedChapter = 0;
          rows[0].classList.add("selected");
        } else {
          if(rows[selectedChapter]) rows[selectedChapter].classList.remove("selected");
          selectedChapter++;
          if (selectedChapter >= rows.length) {
            selectedChapter = 0;
          }
          if(rows[selectedChapter]) rows[selectedChapter].classList.add("selected");
        }
      } else if (event.key === 'Enter') {
        if (selectedChapter !== null) {
          playSelect();
          const targetRow = rows[selectedChapter];
          if (targetRow.href && targetRow.href.includes('loadChapter')) {
             const chNum = parseInt(targetRow.href.match(/\d+/)[0]);
             loadChapter(chNum);
          } else if (targetRow.href && targetRow.href.includes('toggleMobileHardware')) {
             toggleMobileHardware();
          } else if (targetRow.href && targetRow.href.includes('exportSave')) {
             exportSave();
          } else if (targetRow.href && targetRow.href.includes('importFile')) {
             document.getElementById('importFile').click();
          }
        }
      }
    }

    document.addEventListener('keydown', handleMenuNavigation);

    window.onload = () => {
        if (window.location.hostname === 'deltarunefullwebport.vercel.app') {
            document.getElementById('notice-container').innerHTML = `
                <div class="deactivation-warning">
                    This domain might get deactivated soon. Please export your saves and switch to the new official domain: 
                    <a href="https://bloxys-playables.github.io/" target="_blank">bloxys-playables.github.io</a>
                </div>
            `;
        }

        const savedToggle = localStorage.getItem('deltarune-mobile-toggle');
        if(savedToggle === 'true') {
            useMobileControls = true;
            document.getElementById('mobile-controls-status-text').textContent = "Mobile controls: ON";
        }
        
        const saved = localStorage.getItem(STORAGE_KEY);
        if(saved) {
            try { config = JSON.parse(saved); } catch(e) {}
        }
        if (!config) config = {};
        if (config.opacity === undefined) config.opacity = 1;
        if (config.scale === undefined) config.scale = 1.3;
        if (!config.positions) config.positions = {};

        document.getElementById('opacity-slider').value = config.opacity;
        document.getElementById('size-slider').value = config.scale;
        applyConfig();
    };
