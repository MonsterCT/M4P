# M4P (Music for Patata)

A small static PWA for a private Song of the Day mixtape.

## Run locally

```sh
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173/
```

The app needs `localhost` or HTTPS for service-worker/PWA behavior. Opening `index.html` directly will show the page, but install/offline features and notifications will not work properly.

## Add the real songs

The default launch plan is:

- Start: `2026-04-21`
- Total levels: `392`

You can change the release date and total number of levels in the app's settings panel. That means you can release later, shorten the project, or expand it without editing code.

Edit [`data/songs.js`](./data/songs.js) and replace `SONGS` with entries like:

```js
{
  day: 1,
  title: "Song title",
  artist: "Artist name",
  url: "https://soundcloud.com/artist/song",
  note: "Your little sentence before she reveals the song.",
}
```

You can also use the in-app settings panel to import a JSON or CSV file. CSV columns:

```text
day,title,artist,url,genre,album,artworkUrl,note
```

Use `day` for flexible launch timing. For example, `day: 1` is the first day after release, `day: 2` is the next day, and so on. If the launch date is already fixed, you can use `date` instead of `day`.

Songs without data stay as hidden placeholder levels until you add them. The current built-in release data was imported from `playlist_400_days_edited.numbers` and compressed into 392 continuous days from April 21, 2026 through May 17, 2027. Because that sheet did not include direct track URLs, each song link opens a SoundCloud search for the artist and title. Genre and album-art metadata are included where automated lookup found a reliable match; otherwise the app shows a styled cover fallback.

## Test progress and release

Reveals, listened status, and reflections are saved in the browser with `localStorage`, mirrored to a second local backup key, and the app requests persistent browser storage when available. Use the settings panel to export, import, or reset progress.

Anything you do while testing is temporary. Before release, open Settings and choose **Clear test progress** so the first real listener starts from level 1 with no saved reveals or reflections.

## Notifications

The app can request browser notification permission and nudge once per hour between 08:00 and 22:00 when a level is unfinished. Browsers do not reliably allow a static PWA to run hourly notifications while fully closed unless you add a push-notification server or use OS-level reminders.
