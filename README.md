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

## Current Local Status

GitHub push is paused because this PC is not authenticated with GitHub yet.

Local changes already prepared:

- `forest.html`: Added the Debug Panel markup and rain layer.
- `forest.css`: Added Debug Panel styling, mobile-safe layout, rain effect, and fixed-ratio forest map sizing.
- `forest.js`: Added debug controls, forced time modes, rain/mist/star toggles, bird and SE tests, and fast event timing.
- `.nojekyll`: Added for GitHub Pages static hosting.
- `README.md`: Added mobile debug and deploy instructions.

Local commits waiting to be pushed:

```text
10e3b9b Add forest debug panel and deploy notes
0264f20 森画面の環境演出を追加
```

## Later Push Steps

After GitHub authentication is available on this PC:

```powershell
cd C:\Users\kakao\Desktop\shizuku-game
git status --short --branch
git push origin main
```

If Git asks for authentication, sign in to GitHub with the browser or Git Credential Manager prompt.

After push:

1. Wait for GitHub Pages or Vercel to redeploy.
2. Open this URL on a phone:

```text
https://ratemaru88-blip.github.io/teamerry-shizuku-game/forest.html?debug=1
```

3. Use `?debug=0` when checking the production-style view without the Debug Panel.
