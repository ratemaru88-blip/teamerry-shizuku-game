# TeaMerry Shizuku Game

TeaMerry Forest and Shizuku game static site.

## Mobile Debug Check

After pushing to GitHub, open the Forest page on a phone with the debug query.

GitHub Pages URL:

```text
https://ratemaru88-blip.github.io/teamerry-shizuku-game/forest.html?debug=1
```

Vercel URL:

```text
https://<your-vercel-project>.vercel.app/forest.html?debug=1
```

Use these query options:

- `forest.html?debug=1` shows the Debug Panel.
- `forest.html?debug=0` hides the Debug Panel for production-style checking.
- `forest.html` uses the saved local panel setting if the browser has one.

## Debug Panel

The Debug Panel appears at the bottom of the Forest page. It can test:

- Day, evening, and night modes
- Rain, mist, and starry sky toggles
- Bird spawn test
- SE playback test
- Fast mode for time-delayed events

Fast mode shortens delayed events for checking:

- About 30 seconds becomes about 3 seconds.
- About 60 seconds becomes about 5 seconds.

## Deploy Notes

GitHub Pages:

1. Push changes to the `main` branch.
2. In GitHub, open `Settings` -> `Pages`.
3. Set `Source` to `Deploy from a branch`.
4. Select `main` and `/root`.
5. Wait for Pages to finish publishing, then open the GitHub Pages URL above.

Vercel:

1. Import `ratemaru88-blip/teamerry-shizuku-game`.
2. Use the default static project settings.
3. Leave build command empty unless Vercel asks for one.
4. Set output directory to the project root if required.
5. After each GitHub push, Vercel redeploys automatically.

## Local Check

Open:

```text
file:///C:/Users/kakao/Desktop/shizuku-game/forest.html?debug=1
```
