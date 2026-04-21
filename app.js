import { DEFAULT_START_DATE, DEFAULT_TOTAL_DAYS, SONGS } from "./data/songs.js";

const STORAGE_KEYS = {
  progress: "m4p.progress.v1",
  progressBackup: "m4p.progress.backup.v1",
  importedSongs: "m4p.importedSongs.v1",
  settings: "m4p.settings.v1",
};

const RELEASE_VERSION = "2026-04-21-jamming-v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_START = 8;
const REMINDER_END = 22;
const REMINDER_INTERVAL_MS = 60 * 60 * 1000;

const els = {
  questDate: document.querySelector("#quest-date"),
  questTitle: document.querySelector("#quest-title"),
  levelBadge: document.querySelector("#level-badge"),
  loveNote: document.querySelector("#love-note"),
  revealStage: document.querySelector("#reveal-stage"),
  revealButton: document.querySelector("#reveal-button"),
  listenButton: document.querySelector("#listen-button"),
  songName: document.querySelector("#song-name"),
  songArtist: document.querySelector("#song-artist"),
  songAlbum: document.querySelector("#song-album"),
  songGenre: document.querySelector("#song-genre"),
  albumArtwork: document.querySelector("#album-artwork"),
  albumArtworkFallback: document.querySelector("#album-art-fallback"),
  soundcloudLink: document.querySelector("#soundcloud-link"),
  reflectionForm: document.querySelector("#reflection-form"),
  reflectionInput: document.querySelector("#reflection-input"),
  reflectionHelper: document.querySelector("#reflection-helper"),
  unlockedCount: document.querySelector("#unlocked-count"),
  remainingCount: document.querySelector("#remaining-count"),
  streakCount: document.querySelector("#streak-count"),
  finaleDate: document.querySelector("#finale-date"),
  progressPercent: document.querySelector("#progress-percent"),
  ringFill: document.querySelector("#ring-fill"),
  reminderStatus: document.querySelector("#reminder-status"),
  notificationButton: document.querySelector("#notification-button"),
  levelGrid: document.querySelector("#level-grid"),
  archiveList: document.querySelector("#archive-list"),
  memoryList: document.querySelector("#memory-list"),
  installButton: document.querySelector("#install-button"),
  settingsButton: document.querySelector("#settings-button"),
  settingsDialog: document.querySelector("#settings-dialog"),
  importFile: document.querySelector("#import-file"),
  importProgressFile: document.querySelector("#import-progress-file"),
  exportButton: document.querySelector("#export-button"),
  exportProgressButton: document.querySelector("#export-progress-button"),
  resetDataButton: document.querySelector("#reset-data-button"),
  resetProgressButton: document.querySelector("#reset-progress-button"),
  startDateInput: document.querySelector("#start-date-input"),
  totalDaysInput: document.querySelector("#total-days-input"),
  saveScheduleButton: document.querySelector("#save-schedule-button"),
  soundToggle: document.querySelector("#sound-toggle"),
  canvas: document.querySelector("#ambient-canvas"),
};

const formatDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

let deferredInstallPrompt = null;
let mixtape = [];
let activeIndex = 0;
let progress = readJson(STORAGE_KEYS.progress, {
  releaseVersion: RELEASE_VERSION,
  reflections: {},
  revealed: {},
  listened: {},
  lastReminderAt: 0,
});
let settings = readJson(STORAGE_KEYS.settings, {
  releaseVersion: RELEASE_VERSION,
  sound: true,
  startDate: DEFAULT_START_DATE,
  totalDays: DEFAULT_TOTAL_DAYS,
});

init();

function init() {
  registerServiceWorker();
  requestPersistentStorage();
  progress = normalizeProgress(progress);
  settings = normalizeSettings(settings);
  mixtape = buildMixtape();
  els.soundToggle.checked = Boolean(settings.sound);
  els.startDateInput.value = settings.startDate;
  els.totalDaysInput.value = String(settings.totalDays);
  activeIndex = getActiveIndex();
  bindEvents();
  render();
  startReminderLoop();
  startAmbientCanvas();
}

function bindEvents() {
  document.addEventListener("error", handleArtworkError, true);

  els.revealButton.addEventListener("click", () => {
    const song = mixtape[activeIndex];
    progress.revealed[song.id] = new Date().toISOString();
    saveProgress();
    render();
  });

  els.listenButton.addEventListener("click", () => {
    els.reflectionInput.focus();
  });

  els.reflectionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const song = mixtape[activeIndex];
    const text = els.reflectionInput.value.trim();

    if (!text) {
      els.reflectionHelper.textContent = "Tiny thought required. The next level is still locked.";
      els.reflectionInput.focus();
      return;
    }

    progress.reflections[song.id] = {
      text,
      date: new Date().toISOString(),
    };
    progress.listened[song.id] = new Date().toISOString();
    saveProgress();
    playChime();
    activeIndex = getActiveIndex();
    render();
  });

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-button").forEach((tab) => tab.classList.remove("is-active"));
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("is-active"));
      button.classList.add("is-active");
      document.querySelector(`#tab-${button.dataset.tab}`).classList.add("is-active");
    });
  });

  els.notificationButton.addEventListener("click", requestNotifications);
  els.settingsButton.addEventListener("click", () => els.settingsDialog.showModal());

  els.importFile.addEventListener("change", importSongs);
  els.importProgressFile.addEventListener("change", importProgress);
  els.exportButton.addEventListener("click", () => downloadJson("m4p-songs.json", mixtape));
  els.exportProgressButton.addEventListener("click", () => downloadJson("m4p-progress.json", progress));
  els.resetDataButton.addEventListener("click", resetImportedSongs);
  els.resetProgressButton.addEventListener("click", resetProgress);
  els.saveScheduleButton.addEventListener("click", saveScheduleSettings);
  els.soundToggle.addEventListener("change", () => {
    settings.sound = els.soundToggle.checked;
    saveSettings();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    els.installButton.hidden = false;
  });

  els.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installButton.hidden = true;
  });
}

function render() {
  const song = mixtape[activeIndex];
  const today = getToday();
  const elapsedIndex = getElapsedIndex(today);
  const isFuture = activeIndex > elapsedIndex;
  const isRevealed = Boolean(progress.revealed[song.id]);
  const isComplete = Boolean(progress.reflections[song.id]);

  els.questDate.textContent = isFuture ? "The mixtape has not started yet" : formatDate.format(song.date);
  els.questTitle.textContent = isComplete ? "Level complete" : getQuestTitle(activeIndex, elapsedIndex);
  els.levelBadge.textContent = `LVL ${String(activeIndex + 1).padStart(3, "0")}`;
  els.loveNote.textContent = song.note;
  els.revealStage.hidden = !isRevealed;
  els.revealButton.hidden = isRevealed || isFuture;
  els.listenButton.hidden = !isRevealed || isComplete;
  els.reflectionForm.hidden = !isRevealed || isComplete;
  els.songName.textContent = song.title;
  els.songArtist.textContent = song.artist;
  els.songAlbum.textContent = song.album;
  els.songAlbum.hidden = !song.album;
  els.songGenre.textContent = song.genre;
  els.albumArtworkFallback.querySelector("span").textContent = getInitials(song);
  setArtworkImage(els.albumArtwork, els.albumArtworkFallback, song.artworkUrl);
  els.soundcloudLink.href = song.url;
  els.reflectionInput.value = progress.reflections[song.id]?.text ?? "";
  els.reflectionHelper.textContent = isComplete
    ? "Saved. This level is unlocked forever."
    : "You need to write something to complete this level.";

  renderStats();
  renderLevelGrid();
  renderArchive();
  renderMemories();
  updateReminderStatus();
}

function getQuestTitle(index, elapsedIndex) {
  if (index < elapsedIndex) return "Catch-up level";
  if (index === elapsedIndex) return "Today's quest";
  return "Locked for now";
}

function renderStats() {
  const completed = mixtape.filter((song) => progress.reflections[song.id]).length;
  const percent = Math.round((completed / mixtape.length) * 100);
  const circumference = 2 * Math.PI * 52;
  els.unlockedCount.textContent = String(completed);
  els.remainingCount.textContent = String(mixtape.length - completed);
  els.streakCount.textContent = String(calculateStreak());
  els.finaleDate.textContent = formatDate.format(mixtape[mixtape.length - 1].date);
  els.progressPercent.textContent = `${percent}%`;
  els.ringFill.style.strokeDashoffset = String(circumference - (percent / 100) * circumference);
}

function renderLevelGrid() {
  const today = getToday();
  const elapsedIndex = getElapsedIndex(today);
  els.levelGrid.replaceChildren(
    ...mixtape.map((song, index) => {
      const tile = document.createElement("div");
      const complete = Boolean(progress.reflections[song.id]);
      const current = index === activeIndex;
      const locked = index > elapsedIndex || (!complete && !current);
      tile.className = [
        "level-tile",
        complete ? "is-complete" : "",
        current ? "is-current" : "",
        locked ? "is-locked" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const title = document.createElement("strong");
      title.textContent = complete ? song.title : current ? "Song of the Day" : "???";
      const meta = document.createElement("span");
      meta.textContent = complete ? song.artist : `LVL ${String(index + 1).padStart(3, "0")}`;
      tile.append(title, meta);
      return tile;
    }),
  );
}

function renderArchive() {
  const unlocked = mixtape.filter((song) => progress.reflections[song.id]);
  if (!unlocked.length) {
    els.archiveList.innerHTML = '<div class="empty-state">No unlocked songs yet.</div>';
    return;
  }

  els.archiveList.replaceChildren(
    ...unlocked.map((song, index) => {
      const card = document.createElement("article");
      card.className = "song-card";
      card.innerHTML = `
        <div class="song-card-art">${getArtworkMarkup(song)}</div>
        <div>
          <p class="stage-label">LVL ${String(index + 1).padStart(3, "0")} - ${formatDate.format(song.date)}</p>
          <h3>${escapeHtml(song.title)}</h3>
          <p>${escapeHtml(song.artist)}</p>
          <p class="song-card-meta">${escapeHtml(song.genre)}${song.album ? ` - ${escapeHtml(song.album)}` : ""}</p>
          <a href="${escapeAttribute(song.url)}" target="_blank" rel="noreferrer">SoundCloud</a>
        </div>
      `;
      return card;
    }),
  );
}

function renderMemories() {
  const memories = mixtape.filter((song) => progress.reflections[song.id]);
  if (!memories.length) {
    els.memoryList.innerHTML = '<div class="empty-state">Her thoughts will collect here after each level.</div>';
    return;
  }

  els.memoryList.replaceChildren(
    ...memories.map((song) => {
      const memory = progress.reflections[song.id];
      const card = document.createElement("article");
      card.className = "memory-card";
      card.innerHTML = `
        <p class="stage-label">${formatDate.format(song.date)}</p>
        <h3>${escapeHtml(song.title)}</h3>
        <p>${escapeHtml(memory.text)}</p>
      `;
      return card;
    }),
  );
}

function buildMixtape() {
  const imported = readJson(STORAGE_KEYS.importedSongs, null);
  const sourceSongs = imported?.length ? imported : SONGS;
  const byDate = new Map(sourceSongs.filter((song) => song.date).map((song) => [song.date, song]));
  const byDay = new Map(
    sourceSongs.map((song, index) => {
      const day = Number(song.day || index + 1);
      return [day, song];
    }),
  );
  const start = parseDate(settings.startDate);
  const count = clamp(Number(settings.totalDays) || sourceSongs.length || DEFAULT_TOTAL_DAYS, 1, 999);

  return Array.from({ length: count }, (_, index) => {
    const date = addDays(start, index);
    const dateKey = toDateKey(date);
    const song = byDate.get(dateKey) || byDay.get(index + 1);
    return normalizeSong(song, dateKey, index);
  });
}

function normalizeSong(song, dateKey, index) {
  const normalized = {
    id: dateKey,
    date: parseDate(dateKey),
    day: Number(song?.day || index + 1),
    title: song?.title?.trim() || `Mystery Track ${String(index + 1).padStart(3, "0")}`,
    artist: song?.artist?.trim() || "To be added",
    url: song?.url?.trim() || "https://soundcloud.com/",
    genre: song?.genre?.trim() || "Music",
    album: song?.album?.trim() || "",
    artworkUrl: song?.artworkUrl?.trim() || song?.artwork?.trim() || song?.image?.trim() || "",
    note:
      song?.note?.trim() ||
      "This day is reserved for a future sentence from you. Add the real note when the final list is ready.",
  };
  if (normalized.genre === "Music") {
    normalized.genre = getFallbackGenre(normalized);
  }
  return normalized;
}

function getActiveIndex() {
  const elapsedIndex = getElapsedIndex(getToday());
  for (let index = 0; index <= elapsedIndex; index += 1) {
    if (!progress.reflections[mixtape[index].id]) return index;
  }
  return Math.min(elapsedIndex, mixtape.length - 1);
}

function getElapsedIndex(today) {
  const start = parseDate(settings.startDate);
  return clamp(daysBetween(start, today), 0, mixtape.length - 1);
}

function calculateStreak() {
  let streak = 0;
  const elapsedIndex = getElapsedIndex(getToday());
  for (let index = elapsedIndex; index >= 0; index -= 1) {
    const song = mixtape[index];
    if (!progress.reflections[song.id]) break;
    streak += 1;
  }
  return streak;
}

async function requestNotifications() {
  if (!("Notification" in window)) {
    updateReminderStatus("This browser does not support notifications.");
    return;
  }

  const permission = await Notification.requestPermission();
  updateReminderStatus();
  if (permission === "granted") {
    showReminderNotification("M4P reminders are on", "I will nudge when a level is still unfinished.");
  }
}

function startReminderLoop() {
  updateReminderStatus();
  setInterval(() => {
    const song = mixtape[activeIndex];
    if (!song || progress.reflections[song.id]) return;
    const now = new Date();
    const hour = now.getHours();
    const allowedHour = hour >= REMINDER_START && hour < REMINDER_END;
    const longEnough = now.getTime() - Number(progress.lastReminderAt || 0) >= REMINDER_INTERVAL_MS;
    if (!allowedHour || !longEnough || document.visibilityState === "visible") return;

    showReminderNotification("Song of the Day is waiting", "Open M4P and unlock today's music level.");
    playChime();
    progress.lastReminderAt = now.getTime();
    saveProgress();
  }, 60 * 1000);
}

async function showReminderNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker?.ready?.catch(() => null);
  const options = {
    body,
    icon: "./assets/icon-192.svg",
    badge: "./assets/icon-192.svg",
    tag: "m4p-sod",
    renotify: true,
  };
  if (registration?.showNotification) {
    registration.showNotification(title, options);
  } else {
    new Notification(title, options);
  }
}

function updateReminderStatus(customText) {
  if (customText) {
    els.reminderStatus.textContent = customText;
    return;
  }
  if (!("Notification" in window)) {
    els.reminderStatus.textContent = "Not supported in this browser.";
    els.notificationButton.disabled = true;
    return;
  }
  if (Notification.permission === "granted") {
    els.reminderStatus.textContent = "On from 08:00 to 22:00 for unfinished levels.";
    els.notificationButton.textContent = "On";
    return;
  }
  if (Notification.permission === "denied") {
    els.reminderStatus.textContent = "Blocked in browser settings.";
    els.notificationButton.textContent = "Blocked";
    return;
  }
  els.reminderStatus.textContent = "Notifications are off.";
  els.notificationButton.textContent = "Enable";
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.warn("Service worker registration failed", error);
  }
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch (error) {
    console.warn("Persistent storage request failed", error);
  }
}

async function importSongs(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = file.name.toLowerCase().endsWith(".csv") ? parseCsv(text) : JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.songs) ? parsed.songs : null;
    if (!rows) throw new Error("Imported songs must be an array.");

    const imported = rows.map((row) => ({
      day: row.day,
      date: row.date,
      title: row.title,
      artist: row.artist,
      url: row.url || row.soundcloud || row.soundcloudUrl,
      genre: row.genre,
      album: row.album,
      artworkUrl: row.artworkUrl || row.artwork || row.image || row.cover,
      note: row.note || row.sentence || row.description,
    }));
    localStorage.setItem(STORAGE_KEYS.importedSongs, JSON.stringify(imported));
    mixtape = buildMixtape();
    activeIndex = getActiveIndex();
    render();
  } catch (error) {
    alert("That song file could not be imported.");
    console.warn("Song import failed", error);
  } finally {
    event.target.value = "";
  }
}

async function importProgress(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    progress = normalizeProgress(imported);
    saveProgress();
    activeIndex = getActiveIndex();
    render();
  } catch (error) {
    alert("That progress file could not be imported.");
    console.warn("Progress import failed", error);
  } finally {
    event.target.value = "";
  }
}

function saveScheduleSettings() {
  const startDate = els.startDateInput.value || DEFAULT_START_DATE;
  const totalDays = clamp(Number(els.totalDaysInput.value) || DEFAULT_TOTAL_DAYS, 1, 999);
  settings.releaseVersion = RELEASE_VERSION;
  settings.startDate = startDate;
  settings.totalDays = totalDays;
  els.totalDaysInput.value = String(totalDays);
  saveSettings();
  mixtape = buildMixtape();
  activeIndex = getActiveIndex();
  render();
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines[0]) return [];
  const headers = splitCsvLine(lines.shift()).map((header) => header.trim());
  return lines.map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function resetImportedSongs() {
  if (!confirm("Use the built-in sample songs again?")) return;
  localStorage.removeItem(STORAGE_KEYS.importedSongs);
  mixtape = buildMixtape();
  activeIndex = getActiveIndex();
  render();
}

function resetProgress() {
  if (!confirm("Clear all test reveals and reflections in this browser before release?")) return;
  progress = createEmptyProgress();
  saveProgress();
  activeIndex = getActiveIndex();
  render();
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function saveProgress() {
  const serialized = JSON.stringify(progress);
  localStorage.setItem(STORAGE_KEYS.progress, serialized);
  localStorage.setItem(STORAGE_KEYS.progressBackup, serialized);
}

function saveSettings() {
  settings = normalizeSettings(settings);
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

function normalizeSettings(value) {
  if (value?.releaseVersion !== RELEASE_VERSION) {
    return {
      releaseVersion: RELEASE_VERSION,
      sound: value?.sound ?? true,
      startDate: DEFAULT_START_DATE,
      totalDays: DEFAULT_TOTAL_DAYS,
    };
  }
  return {
    releaseVersion: RELEASE_VERSION,
    sound: value?.sound ?? true,
    startDate: isDateKey(value?.startDate) ? value.startDate : DEFAULT_START_DATE,
    totalDays: clamp(Number(value?.totalDays) || DEFAULT_TOTAL_DAYS, 1, 999),
  };
}

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (value) return JSON.parse(value);
    if (key === STORAGE_KEYS.progress) {
      const backup = localStorage.getItem(STORAGE_KEYS.progressBackup);
      if (backup) return JSON.parse(backup);
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function normalizeProgress(value) {
  if (value?.releaseVersion !== RELEASE_VERSION) {
    return createEmptyProgress();
  }
  return {
    releaseVersion: RELEASE_VERSION,
    reflections: value?.reflections && typeof value.reflections === "object" ? value.reflections : {},
    revealed: value?.revealed && typeof value.revealed === "object" ? value.revealed : {},
    listened: value?.listened && typeof value.listened === "object" ? value.listened : {},
    lastReminderAt: Number(value?.lastReminderAt || 0),
  };
}

function createEmptyProgress() {
  return {
    releaseVersion: RELEASE_VERSION,
    reflections: {},
    revealed: {},
    listened: {},
    lastReminderAt: 0,
  };
}

function isDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toDateKey(parseDate(value, null)) === value;
}

function getToday() {
  const override = new URLSearchParams(window.location.search).get("date");
  return override && isDateKey(override) ? parseDate(override) : stripTime(new Date());
}

function parseDate(value, fallback = new Date()) {
  if (typeof value !== "string") return fallback ? stripTime(fallback) : new Date(NaN);
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  const valid =
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day;
  if (valid) return parsed;
  return fallback ? stripTime(fallback) : new Date(NaN);
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function daysBetween(start, end) {
  return Math.round((stripTime(end) - stripTime(start)) / DAY_MS);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char];
  });
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/`/g, "&#096;");
}

function getInitials(song) {
  const words = `${song.artist} ${song.title}`.match(/[A-Za-z0-9]+/g) || ["M", "P"];
  return words
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

function getArtworkMarkup(song) {
  if (song.artworkUrl) {
    return `
      <img src="${escapeAttribute(song.artworkUrl)}" alt="" loading="lazy" />
      <div class="album-art-fallback" hidden><span>${escapeHtml(getInitials(song))}</span></div>
    `;
  }
  return `<div class="album-art-fallback"><span>${escapeHtml(getInitials(song))}</span></div>`;
}

function setArtworkImage(image, fallback, url) {
  if (!url) {
    image.removeAttribute("src");
    image.hidden = true;
    fallback.hidden = false;
    return;
  }
  fallback.hidden = true;
  image.hidden = false;
  image.src = url;
}

function handleArtworkError(event) {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  const fallback = image.nextElementSibling;
  if (!fallback?.classList?.contains("album-art-fallback")) return;
  image.hidden = true;
  fallback.hidden = false;
}

function getFallbackGenre(song) {
  const haystack = `${song.artist} ${song.title}`.toLowerCase();
  const rules = [
    [["bob marley", "peter tosh"], "Reggae"],
    [["stan getz", "joão gilberto", "joao gilberto", "astrud gilberto", "tom jobim"], "Bossa Nova"],
    [["ezra collective", "nubya garcia", "yussef", "john coltrane", "miles davis", "chet baker", "guru"], "Jazz"],
    [["mc solaar", "luidji", "soprano", "nekfeu", "damso"], "French Rap"],
    [["loyle carner", "dave", "central cee", "knucks", "kwollem", "joe james", "little simz", "kofi stone", "unknown t", "killowen", "strandz", "the mouse outfit"], "UK Rap"],
    [["kendrick", "kanye", "tyler", "j. cole", "eminem", "2pac", "nas", "mf doom", "freddie gibbs", "madlib", "joey bada", "outkast", "mos def", "yasiin bey", "j dilla", "nujabes", "a$ap", "asap", "busta rhymes", "smino", "childish gambino"], "Hip-Hop/Rap"],
    [["frank ocean", "sza", "brent faiyaz", "jorja smith", "sade", "steve lacy", "anderson .paak", "erykah badu", "lauryn hill", "tems", "the weeknd", "silk sonic", "bruno mars"], "R&B/Soul"],
    [["durand jones", "thee sacred souls", "al green", "marvin gaye", "otis redding", "jalen ngonda", "brainstory", "gotts street", "celeste", "amy winehouse"], "Soul"],
    [["the beatles", "nirvana", "pink floyd", "led zeppelin", "rolling stones", "the police", "the clash", "the who", "queen", "cranberries", "raconteurs", "eagles", "cage the elephant", "pearl jam", "fleetwood mac", "white stripes", "jimi hendrix", "the cars", "television", "dire straits", "aerosmith", "red hot chili peppers", "arctic monkeys", "radiohead", "the killers", "boston", "kansas", "marcus king"], "Rock"],
    [["tame impala", "mac demarco", "gorillaz", "portishead", "talking heads", "beirut", "cigarettes after sex"], "Alternative"],
    [["elton john", "michael jackson", "daft punk", "ryan gosling", "emma stone"], "Pop"],
    [["manu chao", "lhasa de sela", "buena vista"], "Latin Alternative"],
  ];
  const match = rules.find(([needles]) => needles.some((needle) => haystack.includes(needle)));
  if (match) return match[1];
  if (song.day <= 49) return "Feel-Good Classics";
  if (song.day <= 98) return "R&B/Soul";
  if (song.day <= 147) return "Rock";
  if (song.day <= 245) return "Alternative";
  if (song.day <= 304) return "Hip-Hop/Rap";
  return "Soul/Pop";
}

function playChime() {
  if (!settings.sound) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const now = context.currentTime;
  [440, 660, 880].forEach((frequency, index) => {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = frequency;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, now + index * 0.08);
    gain.gain.exponentialRampToValueAtTime(0.08, now + index * 0.08 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.08 + 0.18);
    osc.connect(gain).connect(context.destination);
    osc.start(now + index * 0.08);
    osc.stop(now + index * 0.08 + 0.2);
  });
}

function startAmbientCanvas() {
  const canvas = els.canvas;
  const context = canvas.getContext("2d");
  const bars = Array.from({ length: 64 }, (_, index) => ({
    phase: index * 0.47,
    hue: index % 3,
  }));

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw(time) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    context.clearRect(0, 0, width, height);
    const barWidth = width / bars.length;
    bars.forEach((bar, index) => {
      const wave = Math.sin(time * 0.0014 + bar.phase) * 0.5 + 0.5;
      const barHeight = 40 + wave * height * 0.22;
      const colors = ["#e84f72", "#f7d35a", "#67d8b7"];
      context.fillStyle = colors[bar.hue];
      context.globalAlpha = 0.16 + wave * 0.2;
      context.fillRect(index * barWidth, height - barHeight, Math.max(2, barWidth - 4), barHeight);
    });
    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(draw);
}
