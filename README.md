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
- Mobile walker: Added mobile-only vertical scroll following, UI side reactions, fast scroll reactions, angry reactions, Kakao placeholder running, lunch, sleep, and wake-up states.
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

## Mobile Walker Rest Animation Notes

The mobile Forest page uses a mobile-only scroll-following character.

Current placeholder assets:

- `assets/images/kakao_tobidasu_1.webp`: temporary Kakao display image for run/rest/lunch/sleep states.
- CSS-generated bento box and sleep mark are used until the final animation files are provided.

Requested final assets to add later:

- Kakao running animation, preferably WebP/APNG/sprite sheet.
- Kakao lunch animation, converted from the Flash source if needed.
- Kakao sleeping animation, converted from the Flash source if needed.
- Optional Kakao wake-up animation.

Recommended asset location:

```text
assets/images/mobile-walker/kakao-run.webp
assets/images/mobile-walker/kakao-lunch.webp
assets/images/mobile-walker/kakao-sleep.webp
assets/images/mobile-walker/kakao-wake.webp
```

If the original files are Flash, export them to lightweight web formats first:

- WebP animation for simple drop-in replacement.
- PNG sprite sheet plus CSS steps animation if file size needs tighter control.

Mobile idle timing:

- 5 seconds after scrolling stops: sit / show bento.
- 10 seconds after scrolling stops: lunch.
- 18 seconds after scrolling stops: sleep.
- On new scroll: wake up and chase.

Debug Panel additions:

- `Kakao run test`
- `Kakao lunch test`
- `Kakao sleep test`
- `Wake up test`
- `Idle timer fast mode`

`Idle timer fast mode` shortens the idle sequence for checking:

- Rest: about 1.2 seconds
- Lunch: about 2.4 seconds
- Sleep: about 4.2 seconds

Local mobile check:

```text
file:///C:/Users/kakao/Desktop/shizuku-game/forest.html?debug=1
```

Turn the mobile walker off temporarily with `Walker OFF` in the Debug Panel.
