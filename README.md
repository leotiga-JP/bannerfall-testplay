# Bannerfall Phase 3.7 — Multiplayer Foundation

Phase 3.6の戦場を、Cloudflare Tunnel + 自宅PCのNode.jsサーバーで複数人共有できるようにした版です。

## 今回の主な実装

- タイトル画面
- プレイヤー名入力
- CREATE ROOM / JOIN ROOM
- 6文字Room Code
- 任意パスワード
- BLUE / RED チーム選択
- 1〜50部隊 / 陣営
- リスポーン時間 5〜60秒
- 最大20プレイヤー
- 空き部隊はAIが担当
- シングルプレイ = 1人だけRoomに入ってSTART
- プレイヤー名を戦場上に表示
- AI部隊はB01 / R01等の部隊名を表示
- 切断したプレイヤー部隊はAIが引き継ぐ
- Room作成者が抜けてもサーバー上の戦闘は継続
- Invite URLコピー機能

## ネットワーク構成

```text
GitHub Pages Client
        ↕ WSS
Cloudflare Tunnel
        ↕ HTTP/WebSocket
自宅PC Node.js Server
        ├ Room / Password / Lobby
        ├ AI
        ├ Combat
        ├ Banner
        ├ Respawn
        └ Authoritative Simulation
```

ゲームシミュレーションは **自宅PCのサーバー側が正解を持つ方式** です。
サーバーは20Hzでシミュレーションし、10Hzで戦場スナップショットをクライアントへ配信します。クライアント側では操作感を良くするため短時間の予測表示を行い、サーバースナップショットで補正します。

## GitHub Pages側

既存の `.github/workflows/deploy.yml` は **変更不要** です。

このPhase3.7のルート側ファイルを既存リポジトリへ上書きしてください。`server/`フォルダをGitHubに置いてもPagesビルドには影響しません。

```text
index.html
package.json
README.md
src/
server/
tsconfig.json
vite.config.ts
```

`vite.config.ts` は従来どおり `/bannerfall-testplay/` を使用しています。

## 自宅PCサーバーの起動

サーバーは `server/` 単体ではなく、同じプロジェクトの `src/` を共有して使用します。GitHubリポジトリを自宅PCへcloneするか、このZIPを展開した状態で実行してください。

PowerShellまたはコマンドプロンプトで：

```powershell
cd <Bannerfallのフォルダ>\server
npm install
npm run start
```

成功すると：

```text
Bannerfall server running at http://127.0.0.1:8787
Health: http://127.0.0.1:8787/health
WebSocket: ws://127.0.0.1:8787/ws
Simulation: 20 Hz / snapshots 10 Hz
```

Windowsでは `server\start-server.cmd` をダブルクリックしても起動できます。ただし最初の1回は `npm install` が必要です。

## Cloudflare Quick Tunnel

別のPowerShellで：

```powershell
cloudflared tunnel --url http://127.0.0.1:8787
```

例：

```text
https://example-random-name.trycloudflare.com
```

ブラウザで次を開いて健康状態を確認できます。

```text
https://example-random-name.trycloudflare.com/health
```

`/health` には `rooms / players / soldiers / tickAvgMs / tickMaxMs` も表示されます。20Hz運用では1tickの持ち時間は約50msなので、`tickAvgMs` が50msへ近づくほどサーバー負荷が高いと判断できます。

Quick Tunnelは再起動するたびURLが変わります。

## ゲーム開始

1. GitHub PagesのBannerfallを開く
2. PLAYER NAMEを入力
3. SERVERに今回の `https://xxxxx.trycloudflare.com` を入力
4. CREATE ROOM
5. 部隊数・Respawn・Passwordを設定
6. Roomを作る
7. `COPY INVITE` で友人にURLを送る
8. Passwordを設定した場合は別途友人へ伝える
9. BLUE / REDを選択
10. HostがSTART BATTLE

Invite URLにはServer URLとRoom Codeが含まれます。PasswordはURLへ含めません。

## シングルプレイ

CREATE ROOM後、他プレイヤーを待たずにSTARTしてください。
人間1部隊 + 残りAIで、マルチプレイと同じサーバールールを使って開始します。

## Room設定

- BLUE SQUADS: 1〜50
- RED SQUADS: 1〜50
- RESPAWN: 5〜60秒
- PASSWORD: 任意
- Player: 最大20人

人間プレイヤーは総部隊数に含まれます。例えば20 vs 20でBLUEに3人いれば、BLUEはPlayer 3部隊 + AI 17部隊です。

## 現段階の制限

- 試合開始後の途中参加は未対応
- サーバー再起動でRoomは消滅
- アカウント / DB / ランキングなし
- Quick Tunnel URLは固定されない
- 50 vs 50 + 多人数は負荷試験用途。まず20 vs 20・2〜4人から確認推奨
- ネットワーク補間・帯域最適化は今後改善余地あり

## 切断時

プレイヤーが切断すると、その人が操作していた部隊はAIへ戻ります。Room Hostが切断した場合は残っているプレイヤーへHost権限だけ移ります。ゲームシミュレーション自体は自宅PCサーバーが管理しているため継続します。

## 開発確認

クライアントTypeScriptは以下で型チェックできます。

```powershell
npm install
npm run build
```

サーバー：

```powershell
cd server
npm install
npm run start
```

## deploy.yml

今回も変更不要です。GitHub上に現在ある `.github/workflows/deploy.yml` をそのまま残してください。
