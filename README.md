## Use React and Redux to make classic cube games

----
This project is inspired by the React version of [Tetris] (https://github.com/chvin/react-tetris). This project is completely refactored with React functional components, using Hook to simulate the life cycle, and the state is scheduled with redux

Poke: [https://nabeelshar.github.io/Retro-Brick-Game/](https://nabeelshar.github.io/Retro-Brick-Game/) Play it!

----
### Effect preview
![Effect Preview](https://img.alicdn.com/tps/TB1Ag7CNXXXXXaoXXXXXXXXXXXX-320-483.gif)

Recording at normal speed, the experience is smooth.

### Tank Battle
![tank](./src/resource/image/tank.gif)

### Racing Games
![racing](./src/resource/image/racing.gif)

### shooting game
![shooting](./src/resource/image/fighting.gif)

### Snake
![snake](./src/resource/image/snake.gif)

### Marble Game
![breakout](./src/resource/image/breakout.gif)

### Responsive
![Responsive](https://img.alicdn.com/tps/TB1AdjZNXXXXXcCapXXXXXXXXXX-480-343.gif)

Not only refers to the adaptive screen, but `responsive operation using the keyboard on the PC and using the fingers on the mobile phone`:

![Mobile phone](https://img.alicdn.com/tps/TB1kvJyOVXXXXbhaFXXXXXXXXXX-320-555.gif)


### Redux state preview ([Redux DevTools extension](https://github.com/zalmoxisus/redux-devtools-extension))
![Redux Status Preview](https://img.alicdn.com/tps/TB1hGQqNXXXXXX3XFXXXXXXXXXX-640-381.gif)

Redux design manages all the state that should be stored.


----
## What is in this repository

The React machine still contains Tank, Tetris, Snake, Shooting, Racing, and Breakout. It has six machine themes and editable colors saved in the browser. A single **Theme colors** button opens the palette modal; image-based plastic grain and worn-edge detail give the shell a lightly aged finish. Inspired by the original handheld layout, wide screens center the near-full-height machine, place the title, game status, and theme control in the left whitespace, and fill the right whitespace with the leaderboard. Narrow and portrait screens keep the machine in one viewport and open the board from a compact **Top 10** button; phones show the machine first. In portrait, the handheld shell extends downward to use the available height while its top and the LCD's top stay fixed relative to each other at the same viewport width. The LCD and gameplay buttons grow uniformly downward together (up to about 15% when the width permits), without stretching or clipping; the button group follows the LCD and packs more tightly horizontally. The vertical gap from the LCD to the nearest gameplay button stays within 10% of the phone viewport height. The toolbar keeps a 42x42 device-icon theme button and an 84x42 Top 10 button instead of scaling them with the machine. The Cloudflare Worker serves the built SPA and same-origin API. D1 stores run and leaderboard data; a Durable Object coordinates claims and WebSocket version events. Ranked runs use the same seeded game rules in the browser and Worker, and the Worker computes `verifiedRawScore * startLevel` from an input replay.

`plan.md` describes the product rules and acceptance criteria. `IMPLEMENTATION_REPORT.md` records what has been verified and what remains before production.

## Local development

Use Node.js 22 and npm. From the repository root:

```sh
npm ci
npm run build
npm run db:migrate:local
npm run dev:worker
```

Open the local URL printed by Wrangler. The Worker serves the React files in `build/`, `/api/health`, `/api/leaderboards`, and `/ws/leaderboards` from one origin. Rebuild after changing frontend code. `npm start` remains available for rapid React-only work, but it does not provide the Worker API or persistent local D1 data.

Ranked play requires a local `.dev.vars` file containing a unique random `SESSION_SECRET` of at least 32 characters. Copy `.dev.vars.example` and replace its placeholder. The checked-in `wrangler.jsonc` keeps `ENABLE_RANKED` disabled until replay and gameplay verification is complete; when explicitly testing ranked play, set that flag to `"true"` locally. Without the Worker or when ranked play is unavailable, the six games can still be played casually, and local scores are never submitted later as ranked scores.

To run automated checks:

```sh
npm run test:ci
npm run test:worker
npm run test:browser:ranked
npm run benchmark:replay
npm run typecheck:worker
npm run lint
npm run build
```

The Worker integration test starts its own isolated local Wrangler process and database. Some locked-down Windows environments require filesystem approval for Wrangler to bundle source files.

With `npm run dev:worker` running, `npm run test:browser` performs a local headless Chrome/Edge smoke check at 320x568, 360x640, 388x866, 390x844, 412x915, 600x960, 768x1024, 800x1024, 844x390, 1024x768, 1366x768, 1440x900, and the 1848x997 reference size. It also cycles a live viewport through 390x844, 844x390, and back to 390x844 to check resize and orientation changes. The smoke check verifies that the complete machine stays within one viewport, its portrait shell uses the available height, and its LCD top remains anchored relative to the shell top as the shell extends downward at the same viewport width. The LCD and gameplay buttons share a uniform downward enlargement without clipping in both the default and Retro Cream themes, and the button group follows the LCD. It checks that the nearest LCD-to-button gap is at most 10% of the phone viewport height, the theme and Top 10 buttons keep their fixed dimensions, wide layouts center the machine between the title and leaderboard, narrow/portrait layouts keep it primary, both dialogs fit, game switching avoids leaderboard GETs, and on-screen input works in all six games. It saves screenshots under ignored `.wrangler/qa/`. `npm run test:browser:ranked` starts a separate temporary Wrangler/D1 instance with ranked enabled, plays a terminal Snake run in the browser, verifies it on the Worker, claims its nickname, checks the board, and removes only its temporary state. Both browser checks need Chrome or Edge; set `CHROME_PATH` if the browser is elsewhere. The replay benchmark reports local Node wall time only, not Cloudflare billed CPU; measure the latter in staging before enabling public ranked play.

## Controls and scoring

Use the on-screen controls or keyboard arrows. In the menu, choose a game, level, and speed; `P` starts or pauses, `R` resets, `S` toggles sound, and Space changes games. A ranked session pins the starting level and speed on the server. The LCD shows the game's raw score. An eligible run opens the name dialog only after the Worker has verified the completed game. A second eligibility check takes place when the name is claimed. Each game's public Top 10 is separate, with one best entry per anonymous visitor per game.

Select the game-device icon (**Theme colors**) to choose a preset or edit the shell, button, and display colors. The dialog can be closed with Escape and returns focus to its trigger. On narrow and portrait screens, select **Top 10** to see the current game's board without moving the machine off screen.

The first leaderboard request loads all six boards. Changing games reads the in-memory cache. A WebSocket announces changed versions, and the browser fetches only boards whose versions advanced; reconnection reconciles missed versions.

## Cloudflare deployment

The app is deployed at [brick-game.zhaduchanhzz.workers.dev](https://brick-game.zhaduchanhzz.workers.dev). Worker `brick-game` uses the APAC `brick-game-db` D1 database configured in `wrangler.jsonc`; migrations `0001`–`0003` were applied on 2026-10-09. Public checks returned 200 for `/`, `/api/health`, and `/api/leaderboards`; a WebSocket connection received the six-game version sync. The hourly cleanup schedule is deployed. `ENABLE_RANKED` remains `false`, so play is casual and the public boards are read-only for now.

For a future code or schema update, review the migration and capture a D1 Time Travel bookmark before applying it. Run the checks, then:

```sh
npx wrangler d1 time-travel info brick-game-db
npm run db:migrate:remote
npm run build
npx wrangler deploy --dry-run
npm run deploy:worker
```

Keep secrets out of version control and the React bundle. No remote `SESSION_SECRET` was installed during this casual-mode deployment. Before enabling ranked, confirm the account plan, measure maximum replay CPU and abuse behavior in staging, install a persistent random `SESSION_SECRET` of at least 32 characters, then deliberately change `ENABLE_RANKED` to `true` and deploy. [Wrangler `secret put`](https://developers.cloudflare.com/workers/wrangler/commands/workers/#secret-put) publishes a new Worker version immediately, so treat it as a live change. The Worker can validate Turnstile tokens, but this version does **not** render a Turnstile widget or submit its token. Do not set `TURNSTILE_SECRET` yet: doing so makes all nickname claims fail until the client widget and its public site key are integrated. The 12,000-tick maximum replay is not proven to fit Cloudflare's [Workers Free 10 ms CPU budget](https://developers.cloudflare.com/workers/platform/limits/); use a compatible plan or reduce/optimize the replay after measuring CPU in staging.

The Worker applies per-IP request limits and caps active leaderboard WebSockets at 20 per edge-supplied `CF-Connecting-IP`; verify that header is present on the target route in staging. If it is stripped, clients share a conservative 20-socket `unknown` bucket. An hourly Cron prunes up to 1,000 old unreferenced verified runs and 1,000 old sessions per invocation after 90 days, preserving current Top 10 entries. Apply all migrations, including `0003_retention_indexes.sql`, before deploying the Cron-enabled Worker. Distributed abuse controls and alerting still need account-level configuration.

For an update to game rules, retain the previous replay verifier until its sessions expire, or deliberately reject those sessions with a clear error. Back up D1 and review the migration before applying it remotely. A rollback of only Worker code may be insufficient after a schema or scoring-rule change.

Use a separate staging Worker and D1 database with its own config/secret before future ranked rollout. Record a D1 [Time Travel bookmark](https://developers.cloudflare.com/d1/reference/time-travel/) before each remote migration. If a deployment must be reversed, [Wrangler rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) changes Worker code only; assess database compatibility before any D1 restore. Restoring D1 overwrites live data, so it must be a deliberate, separately authorized operator action.
